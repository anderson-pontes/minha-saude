-- Prepared locally. Do not apply remotely before review/authorization.
begin;
alter table public.establishments add column cnpj text check(cnpj ~ '^[0-9]{14}$');
create unique index establishments_cnpj_unique on public.establishments(cnpj) where cnpj is not null;
alter table public.doctors add column professional_type text;
create index doctors_registration_import_idx on public.doctors(upper(professional_council),upper(registration_state),registration_number);

-- Own consulting addresses use the existing address model, without fabricated establishments.
alter table public.addresses alter column establishment_id drop not null;
alter table public.addresses add column doctor_id uuid references public.doctors(id) on delete cascade;
alter table public.addresses add constraint addresses_one_entity check(num_nonnulls(establishment_id,doctor_id)=1);
create index addresses_doctor_shared_idx on public.addresses(doctor_id);

create table public.doctor_establishment_health_plans (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
 doctor_id uuid not null references public.doctors(id) on delete cascade,
 establishment_id uuid not null references public.establishments(id) on delete cascade,
 health_plan_id uuid not null references public.health_plans(id) on delete cascade,
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(doctor_id,establishment_id,health_plan_id)
);
alter table public.doctor_establishment_health_plans add constraint scoped_plan_local_link foreign key(doctor_id,establishment_id) references public.doctor_establishments(doctor_id,establishment_id) on delete cascade;
create index doctor_establishment_health_plans_establishment_idx on public.doctor_establishment_health_plans(establishment_id);
create index doctor_establishment_health_plans_plan_idx on public.doctor_establishment_health_plans(health_plan_id);
create table public.doctor_establishment_specialties (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
 doctor_id uuid not null references public.doctors(id) on delete cascade,
 establishment_id uuid not null references public.establishments(id) on delete cascade,
 specialty_id uuid not null references public.specialties(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(doctor_id,establishment_id,specialty_id)
);
alter table public.doctor_establishment_specialties add constraint scoped_specialty_local_link foreign key(doctor_id,establishment_id) references public.doctor_establishments(doctor_id,establishment_id) on delete cascade;
create index doctor_establishment_specialties_establishment_idx on public.doctor_establishment_specialties(establishment_id);
create index doctor_establishment_specialties_specialty_idx on public.doctor_establishment_specialties(specialty_id);
create table public.network_import_runs (
 content_sha256 text primary key check(content_sha256 ~ '^[a-f0-9]{64}$'),
 user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
do $$declare t text; begin
 foreach t in array array['doctor_establishment_health_plans','doctor_establishment_specialties','network_import_runs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert on public.%I to authenticated',t);
  execute format('create policy import_read on public.%I for select to authenticated using ((select private.%I()))',t,case when t='network_import_runs' then 'is_admin' else 'is_active_member' end);
  execute format('create policy import_insert on public.%I for insert to authenticated with check ((select private.is_admin()) and user_id=(select auth.uid()))',t);
 end loop;
end $$;

create function public.import_normalize(value text) returns text language sql immutable strict security invoker set search_path='' as $$
 select trim(regexp_replace(public.network_normalize(value),'[^a-z0-9]+',' ','g'))
$$;
revoke all on function public.import_normalize(text) from public,anon;
grant execute on function public.import_normalize(text) to authenticated;

-- SELECT-only reconciliation used by preview AND execution. Weak matches always need review.
create function public.resolve_import_entity(p_category text,p_data jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare ids uuid[]; weak_ids uuid[];
begin
 if not private.is_admin() then raise insufficient_privilege; end if;
 if p_category='establishments' then
  select array_agg(id) into ids from public.establishments where cnpj=p_data->>'cnpj';
  select array_agg(id) into weak_ids from public.establishments where public.import_normalize(name)=public.import_normalize(p_data->>'name') or public.import_normalize(trade_name)=public.import_normalize(p_data->>'trade_name');
 elsif p_category='doctors' then
  if nullif(p_data->>'professional_council','') is null or nullif(p_data->>'registration_state','') is null or nullif(p_data->>'registration_number','') is null then return jsonb_build_object('action','review','reason','incomplete_registration');end if;
  select array_agg(id) into ids from public.doctors where upper(professional_council)=upper(p_data->>'professional_council') and upper(registration_state)=upper(p_data->>'registration_state') and regexp_replace(registration_number,'[^0-9]','','g')=p_data->>'registration_number';
  if cardinality(ids)=1 and exists(select 1 from public.doctors where id=ids[1] and public.import_normalize(name)<>public.import_normalize(p_data->>'name')) then return jsonb_build_object('action','review','reason','registration_name_conflict','candidates',ids);end if;
  select array_agg(id) into weak_ids from public.doctors where public.import_normalize(name)=public.import_normalize(p_data->>'name');
 elsif p_category in ('specialties','health_plans') then
  execute format('select array_agg(id) from public.%I where public.import_normalize(name)=public.import_normalize($1)',p_category) into ids using p_data->>'name';
 else raise exception 'Unsupported category: %',p_category;
 end if;
 if coalesce(cardinality(ids),0)>1 then return jsonb_build_object('action','review','reason','ambiguous_identity','candidates',ids);end if;
 if cardinality(ids)=1 then return jsonb_build_object('action','existing','id',ids[1]);end if;
 if coalesce(cardinality(weak_ids),0)>0 then return jsonb_build_object('action','review','reason','possible_name_match','candidates',weak_ids);end if;
 return jsonb_build_object('action','new');
end $$;
revoke all on function public.resolve_import_entity(text,jsonb) from public,anon;
grant execute on function public.resolve_import_entity(text,jsonb) to authenticated;

create function public.preview_network_import(p_bundle jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare e jsonb; resolution jsonb; results jsonb:='[]';
begin
 if not private.is_admin() then raise insufficient_privilege;end if;
 for e in select value from jsonb_array_elements(p_bundle->'entities') loop
  if e->>'status'='review' then resolution:=jsonb_build_object('action','review','reason',e->'warnings');
  else resolution:=public.resolve_import_entity(e->>'category',e->'data');end if;
  results:=results||jsonb_build_array(resolution||jsonb_build_object('key',e->>'key','category',e->>'category','sources',e->'sources'));
 end loop;
 return jsonb_build_object('entities',results,'new',(select count(*) from jsonb_array_elements(results) r where r->>'action'='new'),
  'existing',(select count(*) from jsonb_array_elements(results) r where r->>'action'='existing'),
  'review',(select count(*) from jsonb_array_elements(results) r where r->>'action'='review'));
end $$;
revoke all on function public.preview_network_import(jsonb) from public,anon;
grant execute on function public.preview_network_import(jsonb) to authenticated;

-- One RPC = one transaction. No replacement of collections, no deletes, no update of manual fields.
create function public.execute_network_import(p_bundle jsonb,p_content_sha256 text,p_strict boolean default true) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare preview jsonb; prior jsonb; e jsonb; r jsonb; d jsonb; item jsonb; l jsonb; entity uuid; left_id uuid; right_id uuid; plan_id uuid;
 ids jsonb:='{}'; results jsonb:='[]'; inserted integer:=0; reused integer:=0; links_added integer:=0; contacts_added integer:=0; addresses_added integer:=0; n integer;
 fk text; jt text; lc text; rc text; critical_documents boolean; entity_enriched boolean; category_counts jsonb;
begin
 if not private.is_admin() then raise insufficient_privilege;end if;
 if p_content_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Invalid content digest';end if;
 -- Serializes imports and manual writes while identity decisions are made.
 lock table public.establishments,public.doctors,public.specialties,public.health_plans in share row exclusive mode;
 perform pg_advisory_xact_lock(hashtextextended('minha-saude/network-import',0));
 select result into prior from public.network_import_runs where content_sha256=p_content_sha256;
 if prior is not null then return prior||jsonb_build_object('already_imported',true);end if;
 preview:=public.preview_network_import(p_bundle);
 select exists(select 1 from jsonb_array_elements(p_bundle->'documents') doc where jsonb_array_length(coalesce(doc->'warnings','[]'))>0) into critical_documents;
 if p_strict and ((preview->>'review')::int>0 or critical_documents) then raise exception 'Import blocked: unresolved records or incomplete document';end if;
 for e in select value from jsonb_array_elements(p_bundle->'entities') loop
  select value into r from jsonb_array_elements(preview->'entities') where value->>'key'=e->>'key';
  if r->>'action'='review' then continue;end if;
  d:=e->'data';
  entity:=nullif(r->>'id','')::uuid;
  if entity is null then
   -- Use the established backend validation/service for every new catalogue entity.
   entity:=public.save_network_entity(e->>'category',null,(d-'contacts'-'addresses')||jsonb_build_object('contacts','[]'::jsonb,'addresses','[]'::jsonb));
   inserted:=inserted+1;
  else reused:=reused+1;end if;
  ids:=ids||jsonb_build_object(e->>'key',entity);
  entity_enriched:=false;
  if e->>'category'='establishments' then
   update public.establishments set cnpj=coalesce(cnpj,d->>'cnpj'), trade_name=coalesce(nullif(trade_name,''),d->>'trade_name'),
    notes=case when nullif(d->>'notes','') is null or position(d->>'notes' in coalesce(notes,''))>0 then notes else concat_ws(E'\n',nullif(notes,''),d->>'notes') end where id=entity and
    ((cnpj is null and nullif(d->>'cnpj','') is not null) or (nullif(trade_name,'') is null and nullif(d->>'trade_name','') is not null) or (nullif(d->>'notes','') is not null and position(d->>'notes' in coalesce(notes,''))=0));
   get diagnostics n=row_count;entity_enriched:=n>0;
  elsif e->>'category'='doctors' then
   update public.doctors set professional_type=coalesce(professional_type,d->>'professional_type'),
    notes=case when nullif(d->>'notes','') is null or position(d->>'notes' in coalesce(notes,''))>0 then notes else concat_ws(E'\n',nullif(notes,''),d->>'notes') end where id=entity and
    ((professional_type is null and nullif(d->>'professional_type','') is not null) or (nullif(d->>'notes','') is not null and position(d->>'notes' in coalesce(notes,''))=0));
   get diagnostics n=row_count;entity_enriched:=n>0;
  end if;
  if e->>'category' in ('establishments','doctors') then
   fk:=case when e->>'category'='doctors' then 'doctor_id' else 'establishment_id' end;
   for item in select value from jsonb_array_elements(coalesce(d->'contacts','[]')) loop
    if not exists(select 1 from public.contacts c where (c.doctor_id=entity or c.establishment_id=entity) and
      ((c.kind in ('phone','mobile','whatsapp') and item->>'kind'='phone' and right(regexp_replace(c.value,'[^0-9]','','g'),length(item->>'value'))=item->>'value') or (c.kind=item->>'kind' and lower(c.value)=lower(item->>'value')))) then
     execute format('insert into public.contacts(%I,kind,value,notes) values($1,$2,$3,$4)',fk) using entity,item->>'kind',item->>'value','Fonte: UNICASF';
     contacts_added:=contacts_added+1;
    end if;
   end loop;
   for item in select value from jsonb_array_elements(coalesce(d->'addresses','[]')) loop
    if nullif(item->>'street','') is null then raise exception 'Missing street for %',e->>'key';end if;
    if not exists(select 1 from public.addresses a where (a.doctor_id=entity or a.establishment_id=entity) and
      public.import_normalize(a.street)=public.import_normalize(item->>'street') and coalesce(a.number,'')=coalesce(item->>'number','') and
      public.import_normalize(coalesce(a.complement,''))=public.import_normalize(coalesce(item->>'complement','')) and public.import_normalize(a.city)=public.import_normalize(item->>'city') and a.state=item->>'state') then
     execute format('insert into public.addresses(%I,street,number,complement,neighborhood,city,state,postal_code,reference) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',fk)
      using entity,item->>'street',item->>'number',item->>'complement',item->>'neighborhood',item->>'city',item->>'state',case when item->>'postal_code' ~ '^[0-9]{8}$' then item->>'postal_code' else null end,item->>'raw';
     addresses_added:=addresses_added+1;
    end if;
   end loop;
  end if;
  results:=results||jsonb_build_array(jsonb_build_object('key',e->>'key','id',entity,'category',e->>'category','action',r->>'action','enriched',entity_enriched,'sources',e->'sources'));
 end loop;
 plan_id:=(ids->>'health_plans:unicasf')::uuid;
 for l in select value from jsonb_array_elements(p_bundle->'links') loop
  left_id:=(ids->>(l->>'left'))::uuid;right_id:=(ids->>(l->>'right'))::uuid;
  if left_id is null or right_id is null then continue;end if;
  jt:=l->>'table';
  if jt='doctor_establishment_health_plans' then
   if plan_id is null then raise exception 'Missing UNICASF plan';end if;
   insert into public.doctor_establishment_health_plans(doctor_id,establishment_id,health_plan_id,notes) values(left_id,right_id,plan_id,l->>'notes') on conflict do nothing;
  elsif jt='doctor_establishment_specialties' then
   if ids->>(l->>'specialty') is null then continue;end if;
   insert into public.doctor_establishment_specialties(doctor_id,establishment_id,specialty_id) values(left_id,right_id,(ids->>(l->>'specialty'))::uuid) on conflict do nothing;
  else
   if jt not in ('doctor_specialties','establishment_specialties','doctor_establishments','doctor_health_plans','establishment_health_plans') then raise exception 'Unsupported link: %',jt;end if;
   lc:=case when jt like 'doctor_%' then 'doctor_id' else 'establishment_id' end;
   rc:=case when jt like '%specialties' then 'specialty_id' when jt like '%health_plans' then 'health_plan_id' else 'establishment_id' end;
   if rc='specialty_id' then
    execute format('insert into public.%I(%I,%I) values($1,$2) on conflict do nothing',jt,lc,rc) using left_id,right_id;
   else
    execute format('insert into public.%I(%I,%I,notes) values($1,$2,$3) on conflict do nothing',jt,lc,rc) using left_id,right_id,l->>'notes';
   end if;
  end if;
  get diagnostics n=row_count;links_added:=links_added+n;
 end loop;
 select jsonb_object_agg(category,counts) into category_counts from (
  select value->>'category' category,jsonb_build_object('inserted',count(*) filter(where value->>'action'='new'),'reused',count(*) filter(where value->>'action'='existing'),'enriched',count(*) filter(where (value->>'enriched')::boolean)) counts
  from jsonb_array_elements(results) group by value->>'category'
 ) categories;
 prior:=jsonb_build_object('entities',results,'category_counts',category_counts,'inserted',inserted,'reused',reused,'links_created',links_added,'contacts_created',contacts_added,'addresses_created',addresses_added,'skipped',preview->'review','preview',preview);
 insert into public.network_import_runs(content_sha256,payload,result) values(p_content_sha256,p_bundle,prior);
 return prior;
end $$;
revoke all on function public.execute_network_import(jsonb,text,boolean) from public,anon;
grant execute on function public.execute_network_import(jsonb,text,boolean) to authenticated;

create function public.network_local_details(p_doctor uuid,p_establishment uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('health_plans',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('link_notes',j.notes)) from public.health_plans h join public.doctor_establishment_health_plans j on j.health_plan_id=h.id where j.doctor_id=p_doctor and j.establishment_id=p_establishment),'[]'))
 || case when exists(select 1 from public.doctor_establishment_specialties where doctor_id=p_doctor and establishment_id=p_establishment) or exists(select 1 from public.doctor_establishment_health_plans where doctor_id=p_doctor and establishment_id=p_establishment) then
 jsonb_build_object('specialties',coalesce((select jsonb_agg(to_jsonb(s)) from public.specialties s join public.doctor_establishment_specialties j on j.specialty_id=s.id where j.doctor_id=p_doctor and j.establishment_id=p_establishment),'[]')) else '{}'::jsonb end
$$;
revoke all on function public.network_local_details(uuid,uuid) from public,anon;
grant execute on function public.network_local_details(uuid,uuid) to authenticated;

create or replace function public.network_document(p_type text,p_id uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare doc jsonb; fk text;
begin
 if not private.is_active_member() then raise insufficient_privilege using message='Acesso não autorizado';end if;
 if p_type not in ('establishments','doctors','specialties','health_plans') then return null; end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1',p_type) into doc using p_id;
 if doc is null then return null; end if;
 if p_type in ('establishments','doctors') then
  select doc || jsonb_build_object('contacts',coalesce(jsonb_agg(to_jsonb(c) order by is_primary desc,created_at),'[]')) into doc from public.contacts c where (doctor_id=p_id or establishment_id=p_id);
  select doc || jsonb_build_object('favorite',exists(select 1 from public.favorites where (select private.is_active_member()) and (doctor_id=p_id or establishment_id=p_id))) into doc;
  if p_type='establishments' then
   select doc || jsonb_build_object('addresses',coalesce(jsonb_agg(to_jsonb(a) order by is_primary desc,created_at),'[]')) into doc from public.addresses a where establishment_id=p_id;
   select doc || jsonb_build_object('specialties',coalesce(jsonb_agg(to_jsonb(s)),'[]')) into doc from public.specialties s join public.establishment_specialties j on j.specialty_id=s.id where j.establishment_id=p_id;
   select doc || jsonb_build_object('doctors',coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('link_notes',j.notes,'specialties',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.specialties s join public.doctor_specialties ds on ds.specialty_id=s.id where ds.doctor_id=d.id))),'[]')) into doc from public.doctors d join public.doctor_establishments j on j.doctor_id=d.id where j.establishment_id=p_id;
   select doc || jsonb_build_object('health_plans',coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('link_notes',j.notes)),'[]')) into doc from public.health_plans h join public.establishment_health_plans j on j.health_plan_id=h.id where j.establishment_id=p_id;
  else
   select doc || jsonb_build_object('specialties',coalesce(jsonb_agg(to_jsonb(s)),'[]')) into doc from public.specialties s join public.doctor_specialties j on j.specialty_id=s.id where j.doctor_id=p_id;
   select doc || jsonb_build_object('establishments',coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('link_notes',j.notes,'addresses',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.addresses a where a.establishment_id=e.id),'specialties',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.specialties s join public.establishment_specialties es on es.specialty_id=s.id where es.establishment_id=e.id))),'[]')) into doc from public.establishments e join public.doctor_establishments j on j.establishment_id=e.id where j.doctor_id=p_id;
   select doc || jsonb_build_object('health_plans',coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('link_notes',j.notes)),'[]')) into doc from public.health_plans h join public.doctor_health_plans j on j.health_plan_id=h.id where j.doctor_id=p_id;
  end if;
 else
  select doc || jsonb_build_object('establishments',coalesce(jsonb_agg(to_jsonb(e)),'[]')) into doc from public.establishments e where exists(select 1 from public.establishment_specialties j where p_type='specialties' and j.specialty_id=p_id and j.establishment_id=e.id) or exists(select 1 from public.establishment_health_plans j where p_type='health_plans' and j.health_plan_id=p_id and j.establishment_id=e.id);
  select doc || jsonb_build_object('doctors',coalesce(jsonb_agg(to_jsonb(d)),'[]')) into doc from public.doctors d where exists(select 1 from public.doctor_specialties j where p_type='specialties' and j.specialty_id=p_id and j.doctor_id=d.id) or exists(select 1 from public.doctor_health_plans j where p_type='health_plans' and j.health_plan_id=p_id and j.doctor_id=d.id);
 end if;
 if p_type='doctors' then
  select doc||jsonb_build_object('addresses',coalesce(jsonb_agg(to_jsonb(a)),'[]')) into doc from public.addresses a where a.doctor_id=p_id;
  select doc||jsonb_build_object('establishments',coalesce(jsonb_agg(e||public.network_local_details(p_id,(e->>'id')::uuid)),'[]')) into doc from jsonb_array_elements(doc->'establishments') e;
 elsif p_type='establishments' then
  select doc||jsonb_build_object('doctors',coalesce(jsonb_agg(d||public.network_local_details((d->>'id')::uuid,p_id)),'[]')) into doc from jsonb_array_elements(doc->'doctors') d;
 elsif p_type='health_plans' then
  select doc||jsonb_build_object('doctors',coalesce(jsonb_agg(to_jsonb(d)),'[]')) into doc from public.doctors d where exists(select 1 from public.doctor_health_plans j where j.doctor_id=d.id and j.health_plan_id=p_id) or exists(select 1 from public.doctor_establishment_health_plans j where j.doctor_id=d.id and j.health_plan_id=p_id);
 end if;
 return doc;
end $$;

create or replace function public.search_network(p_filters jsonb default '{}',p_page integer default 1,p_size integer default 12) returns jsonb language sql stable security invoker set search_path='' as $$
 with entities as (
  select 'establishments' as category,id,name,created_at,active from public.establishments where (select private.is_active_member())
  union all select 'doctors',id,name,created_at,active from public.doctors where (select private.is_active_member())
  union all select 'specialties',id,name,created_at,active from public.specialties where (select private.is_active_member())
  union all select 'health_plans',id,name,created_at,active from public.health_plans where (select private.is_active_member())
 ), docs as materialized (
  select *,public.network_document(category,id) as data from entities where
   (coalesce(p_filters->>'category','')='' or category=p_filters->>'category') and
   (coalesce(p_filters->>'active','')='' or active=(p_filters->>'active')::boolean)
 ), matches as materialized (
 select * from docs where
  (coalesce(p_filters->>'q','')='' or position(public.network_normalize(p_filters->>'q') in public.network_normalize(data::text))>0) and
  (coalesce(p_filters->>'kind','')='' or data->>'kind'=p_filters->>'kind') and
  (coalesce(p_filters->>'favorites','')<>'true' or data->>'favorite'='true') and
  (coalesce(p_filters->>'specialty','')='' or data->'specialties' @> jsonb_build_array(jsonb_build_object('id',p_filters->>'specialty')) or (category='specialties' and id::text=p_filters->>'specialty')) and
  (coalesce(p_filters->>'doctor','')='' or data->'doctors' @> jsonb_build_array(jsonb_build_object('id',p_filters->>'doctor')) or (category='doctors' and id::text=p_filters->>'doctor')) and
  (coalesce(p_filters->>'plan','')='' or data->'health_plans' @> jsonb_build_array(jsonb_build_object('id',p_filters->>'plan')) or (category='health_plans' and id::text=p_filters->>'plan') or (category='doctors' and exists(select 1 from public.doctor_establishment_health_plans dp where dp.doctor_id=docs.id and dp.health_plan_id::text=p_filters->>'plan'))) and
  not exists(select 1 from jsonb_each_text(p_filters) f where f.key in ('city','neighborhood','state') and f.value<>'' and not exists(
    select 1 from jsonb_array_elements(coalesce(data->'addresses','[]') || coalesce((select jsonb_agg(a) from jsonb_array_elements(coalesce(data->'establishments','[]')) e cross join lateral jsonb_array_elements(coalesce(e->'addresses','[]')) a),'[]')) a
    where position(public.network_normalize(f.value) in public.network_normalize(coalesce(a->>f.key,'')))>0))
 ), page as (
  select category,data from matches order by case when p_filters->>'sort'='oldest' then created_at end asc,
   case when coalesce(p_filters->>'sort','newest')='newest' then created_at end desc,
   case when p_filters->>'sort'='name' then public.network_normalize(name) end asc,id
  limit least(greatest(p_size,1),50) offset (greatest(p_page,1)-1)*least(greatest(p_size,1),50)
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'total',(select count(*) from matches))
$$;

create or replace function public.save_network_entity(p_type text,p_id uuid,p_data jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare uid uuid := auth.uid(); entity uuid := coalesce(p_id,gen_random_uuid()); old_stamp timestamptz; item jsonb; linked uuid; jt text; fk text; target text; col text;
begin
 if not private.is_admin() then raise insufficient_privilege using message='Somente administradores ativos podem salvar cadastros'; end if;
 if p_type not in ('establishments','doctors','specialties','health_plans') then raise exception 'Tipo inválido'; end if;
 if length(trim(coalesce(p_data->>'name',''))) not between 1 and 200 then raise exception 'Informe um nome de até 200 caracteres'; end if;
 if p_type in ('specialties','health_plans') then
  perform pg_advisory_xact_lock(hashtextextended(p_type||public.network_normalize(trim(p_data->>'name')),0));
  execute format('select id from public.%I where public.network_normalize(trim(name))=public.network_normalize(trim($2)) and id<>$3 limit 1',p_type) into linked using uid,p_data->>'name',entity;
  if linked is not null then raise unique_violation using message='Já existe um cadastro com esse nome'; end if;
 end if;
 if p_id is not null then
  execute format('select updated_at from public.%I where id=$1 for update',p_type) into old_stamp using entity,uid;
  if old_stamp is null then raise insufficient_privilege using message='Registro indisponível'; end if;
  if p_data ? 'updated_at' and (p_data->>'updated_at')::timestamptz is distinct from old_stamp then raise exception 'Registro alterado em outra sessão. Recarregue antes de salvar.'; end if;
 else
  execute format('insert into public.%I(id,user_id,name%s) values ($1,$2,$3%s)',p_type,case when p_type='establishments' then ',kind' else '' end,case when p_type='establishments' then ',''clinic''' else '' end) using entity,uid,trim(p_data->>'name');
 end if;
 execute format('update public.%I set name=$1,active=$2 where id=$3',p_type) using trim(p_data->>'name'),coalesce((p_data->>'active')::boolean,true),entity,uid;
 if p_type='establishments' then
  update public.establishments set kind=p_data->>'kind',trade_name=nullif(trim(p_data->>'trade_name'),''),website=nullif(p_data->>'website',''),description=nullif(p_data->>'description',''),notes=nullif(p_data->>'notes','') where id=entity;
 elsif p_type='doctors' then
  update public.doctors set professional_council=p_data->>'professional_council',registration_number=p_data->>'registration_number',registration_state=p_data->>'registration_state',notes=p_data->>'notes' where id=entity;
 elsif p_type='specialties' then update public.specialties set description=p_data->>'description' where id=entity;
 else update public.health_plans set notes=p_data->>'notes' where id=entity;
 end if;
 if p_type in ('establishments','doctors') then
  fk := case when p_type='doctors' then 'doctor_id' else 'establishment_id' end;
  execute format('delete from public.contacts where %I=$1',fk) using entity,uid;
  for item in select value from jsonb_array_elements(coalesce(p_data->'contacts','[]')) loop
   execute format('insert into public.contacts(user_id,%I,kind,label,value,is_primary,notes) values ($1,$2,$3,$4,$5,$6,$7)',fk)
   using uid,entity,item->>'kind',item->>'label',trim(item->>'value'),coalesce((item->>'is_primary')::boolean,false),item->>'notes';
  end loop;
  if (select count(*) from public.contacts where is_primary and (doctor_id=entity or establishment_id=entity))>1 then raise exception 'Escolha apenas um contato principal'; end if;
  execute format('delete from public.favorites where %I=$1 and user_id=$2',fk) using entity,uid;
  if coalesce((p_data->>'favorite')::boolean,false) then execute format('insert into public.favorites(user_id,%I) values($1,$2)',fk) using uid,entity; end if;
  if p_type='establishments' then
   delete from public.addresses where establishment_id=entity;
   for item in select value from jsonb_array_elements(coalesce(p_data->'addresses','[]')) loop
    insert into public.addresses(user_id,establishment_id,postal_code,street,number,complement,neighborhood,city,state,reference,is_primary)
    values(uid,entity,nullif(regexp_replace(item->>'postal_code','[^0-9]','','g'),''),trim(item->>'street'),item->>'number',item->>'complement',item->>'neighborhood',trim(item->>'city'),upper(item->>'state'),item->>'reference',coalesce((item->>'is_primary')::boolean,false));
   end loop;
   if (select count(*) from public.addresses where establishment_id=entity and is_primary)>1 then raise exception 'Escolha apenas um endereço principal'; end if;
  end if;
  -- Replace only the owning entity's links, never the shared entities.
  foreach target in array array['specialties','health_plans',case when p_type='establishments' then 'doctors' else 'establishments' end] loop
   jt := case when target='specialties' then case when p_type='doctors' then 'doctor_specialties' else 'establishment_specialties' end
     when target='health_plans' then case when p_type='doctors' then 'doctor_health_plans' else 'establishment_health_plans' end else 'doctor_establishments' end;
   col := case target when 'specialties' then 'specialty_id' when 'health_plans' then 'health_plan_id' when 'doctors' then 'doctor_id' else 'establishment_id' end;
   execute format('delete from public.%I where %I=$1 and %I not in (select (value->>''id'')::uuid from jsonb_array_elements($2) where nullif(value->>''id'','''') is not null)',jt,fk,col) using entity,coalesce(p_data->target,'[]'::jsonb);
   for item in select value from jsonb_array_elements(coalesce(p_data->target,'[]')) loop
    linked := nullif(item->>'id','')::uuid;
    if linked is null then
     if target='establishments' then raise exception 'Selecione um estabelecimento existente'; end if;
     perform pg_advisory_xact_lock(hashtextextended(target||public.network_normalize(trim(item->>'name')),0));
     execute format('select id from public.%I where public.network_normalize(trim(name))=public.network_normalize(trim($2)) order by created_at limit 1',target) into linked using uid,item->>'name';
     if linked is null then linked := public.save_network_entity(target,null,item); end if;
    end if;
    if target='specialties' then
     execute format('insert into public.%I(user_id,%I,%I) values($1,$2,$3) on conflict do nothing',jt,fk,col) using uid,entity,linked;
    elsif jt='doctor_establishments' then
     insert into public.doctor_establishments(user_id,doctor_id,establishment_id,notes) values(uid,case when p_type='doctors' then entity else linked end,case when p_type='doctors' then linked else entity end,item->>'link_notes') on conflict(doctor_id,establishment_id) do update set notes=excluded.notes;
    else
     execute format('insert into public.%I(user_id,%I,%I,notes) values($1,$2,$3,$4) on conflict(%I,%I) do update set notes=excluded.notes',jt,fk,col,fk,col) using uid,entity,linked,item->>'link_notes';
    end if;
   end loop;
  end loop;
 end if;
 return entity;
end $$;

notify pgrst,'reload schema';
commit;
