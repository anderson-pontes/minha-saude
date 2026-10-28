-- Phase 2. Additive migration; requires explicit authorization before remote use.
begin;
alter table public.establishments add column trade_name text, add column website text, add column description text, add column active boolean not null default true;
alter table public.doctors add column active boolean not null default true;
alter table public.specialties add column active boolean not null default true;
alter table public.health_plans add column active boolean not null default true;
alter table public.contacts add column notes text;
alter table public.contacts drop constraint contacts_kind_check;
alter table public.contacts add constraint contacts_kind_check check(kind in ('phone','mobile','whatsapp','email','website','other'));
alter table public.addresses add column reference text, add column is_primary boolean not null default false;
alter table public.doctor_establishments add column notes text;
alter table public.establishment_health_plans add column notes text;
create table public.doctor_health_plans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 doctor_id uuid not null, health_plan_id uuid not null, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,id), unique(user_id,doctor_id,health_plan_id),
 foreign key(user_id,doctor_id) references public.doctors(user_id,id) on delete cascade,
 foreign key(user_id,health_plan_id) references public.health_plans(user_id,id) on delete cascade
);
create index doctor_health_plans_plan_idx on public.doctor_health_plans(user_id,health_plan_id);
create index establishments_user_recent_idx on public.establishments(user_id,created_at desc,id);
create index doctors_user_recent_idx on public.doctors(user_id,created_at desc,id);
create index specialties_user_recent_idx on public.specialties(user_id,created_at desc,id);
create index health_plans_user_recent_idx on public.health_plans(user_id,created_at desc,id);
alter table public.doctor_health_plans enable row level security;
alter table public.doctor_health_plans force row level security;
revoke all on public.doctor_health_plans from public, anon;
grant select,insert,update,delete on public.doctor_health_plans to authenticated;
create policy owner_select on public.doctor_health_plans for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.doctor_health_plans for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.doctor_health_plans for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.doctor_health_plans for delete to authenticated using ((select auth.uid())=user_id);
create trigger audit_fields before insert or update on public.doctor_health_plans for each row execute function public.set_audit_fields();

create function public.network_normalize(value text) returns text language sql immutable strict security invoker set search_path='' as $$
 select translate(lower(value),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')
$$;

create function public.save_network_entity(p_type text,p_id uuid,p_data jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare uid uuid := auth.uid(); entity uuid := coalesce(p_id,gen_random_uuid()); old_stamp timestamptz; item jsonb; linked uuid; jt text; fk text; target text; col text;
begin
 if uid is null then raise insufficient_privilege using message='Sessão necessária'; end if;
 if p_type not in ('establishments','doctors','specialties','health_plans') then raise exception 'Tipo inválido'; end if;
 if length(trim(coalesce(p_data->>'name',''))) not between 1 and 200 then raise exception 'Informe um nome de até 200 caracteres'; end if;
 if p_type in ('specialties','health_plans') then
  perform pg_advisory_xact_lock(hashtextextended(uid::text||p_type||public.network_normalize(trim(p_data->>'name')),0));
  execute format('select id from public.%I where user_id=$1 and public.network_normalize(trim(name))=public.network_normalize(trim($2)) and id<>$3 limit 1',p_type) into linked using uid,p_data->>'name',entity;
  if linked is not null then raise unique_violation using message='Já existe um cadastro com esse nome'; end if;
 end if;
 if p_id is not null then
  execute format('select updated_at from public.%I where id=$1 and user_id=$2 for update',p_type) into old_stamp using entity,uid;
  if old_stamp is null then raise insufficient_privilege using message='Registro indisponível'; end if;
  if p_data ? 'updated_at' and (p_data->>'updated_at')::timestamptz is distinct from old_stamp then raise exception 'Registro alterado em outra sessão. Recarregue antes de salvar.'; end if;
 else
  execute format('insert into public.%I(id,user_id,name%s) values ($1,$2,$3%s)',p_type,case when p_type='establishments' then ',kind' else '' end,case when p_type='establishments' then ',''clinic''' else '' end) using entity,uid,trim(p_data->>'name');
 end if;
 execute format('update public.%I set name=$1,active=$2 where id=$3 and user_id=$4',p_type) using trim(p_data->>'name'),coalesce((p_data->>'active')::boolean,true),entity,uid;
 if p_type='establishments' then
  update public.establishments set kind=p_data->>'kind',trade_name=nullif(trim(p_data->>'trade_name'),''),website=nullif(p_data->>'website',''),description=nullif(p_data->>'description',''),notes=nullif(p_data->>'notes','') where id=entity and user_id=uid;
 elsif p_type='doctors' then
  update public.doctors set professional_council=p_data->>'professional_council',registration_number=p_data->>'registration_number',registration_state=p_data->>'registration_state',notes=p_data->>'notes' where id=entity and user_id=uid;
 elsif p_type='specialties' then update public.specialties set description=p_data->>'description' where id=entity and user_id=uid;
 else update public.health_plans set notes=p_data->>'notes' where id=entity and user_id=uid;
 end if;
 if p_type in ('establishments','doctors') then
  fk := case when p_type='doctors' then 'doctor_id' else 'establishment_id' end;
  execute format('delete from public.contacts where %I=$1 and user_id=$2',fk) using entity,uid;
  for item in select value from jsonb_array_elements(coalesce(p_data->'contacts','[]')) loop
   execute format('insert into public.contacts(user_id,%I,kind,label,value,is_primary,notes) values ($1,$2,$3,$4,$5,$6,$7)',fk)
   using uid,entity,item->>'kind',item->>'label',trim(item->>'value'),coalesce((item->>'is_primary')::boolean,false),item->>'notes';
  end loop;
  if (select count(*) from public.contacts where user_id=uid and is_primary and (doctor_id=entity or establishment_id=entity))>1 then raise exception 'Escolha apenas um contato principal'; end if;
  execute format('delete from public.favorites where %I=$1 and user_id=$2',fk) using entity,uid;
  if coalesce((p_data->>'favorite')::boolean,false) then execute format('insert into public.favorites(user_id,%I) values($1,$2)',fk) using uid,entity; end if;
  if p_type='establishments' then
   delete from public.addresses where establishment_id=entity and user_id=uid;
   for item in select value from jsonb_array_elements(coalesce(p_data->'addresses','[]')) loop
    insert into public.addresses(user_id,establishment_id,postal_code,street,number,complement,neighborhood,city,state,reference,is_primary)
    values(uid,entity,nullif(regexp_replace(item->>'postal_code','[^0-9]','','g'),''),trim(item->>'street'),item->>'number',item->>'complement',item->>'neighborhood',trim(item->>'city'),upper(item->>'state'),item->>'reference',coalesce((item->>'is_primary')::boolean,false));
   end loop;
   if (select count(*) from public.addresses where establishment_id=entity and user_id=uid and is_primary)>1 then raise exception 'Escolha apenas um endereço principal'; end if;
  end if;
  -- Replace only the owning entity's links, never the shared entities.
  foreach target in array array['specialties','health_plans',case when p_type='establishments' then 'doctors' else 'establishments' end] loop
   jt := case when target='specialties' then case when p_type='doctors' then 'doctor_specialties' else 'establishment_specialties' end
     when target='health_plans' then case when p_type='doctors' then 'doctor_health_plans' else 'establishment_health_plans' end else 'doctor_establishments' end;
   col := case target when 'specialties' then 'specialty_id' when 'health_plans' then 'health_plan_id' when 'doctors' then 'doctor_id' else 'establishment_id' end;
   execute format('delete from public.%I where %I=$1 and user_id=$2',jt,fk) using entity,uid;
   for item in select value from jsonb_array_elements(coalesce(p_data->target,'[]')) loop
    linked := nullif(item->>'id','')::uuid;
    if linked is null then
     if target='establishments' then raise exception 'Selecione um estabelecimento existente'; end if;
     perform pg_advisory_xact_lock(hashtextextended(uid::text||target||public.network_normalize(trim(item->>'name')),0));
     execute format('select id from public.%I where user_id=$1 and public.network_normalize(trim(name))=public.network_normalize(trim($2)) order by created_at limit 1',target) into linked using uid,item->>'name';
     if linked is null then linked := public.save_network_entity(target,null,item); end if;
    end if;
    if target='specialties' then
     execute format('insert into public.%I(user_id,%I,%I) values($1,$2,$3) on conflict do nothing',jt,fk,col) using uid,entity,linked;
    else
     execute format('insert into public.%I(user_id,%I,%I,notes) values($1,$2,$3,$4) on conflict do nothing',jt,fk,col) using uid,entity,linked,item->>'link_notes';
    end if;
   end loop;
  end loop;
 end if;
 return entity;
end $$;
create function public.network_document(p_type text,p_id uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare doc jsonb; fk text;
begin
 if p_type not in ('establishments','doctors','specialties','health_plans') then return null; end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 and user_id=(select auth.uid())',p_type) into doc using p_id;
 if doc is null then return null; end if;
 if p_type in ('establishments','doctors') then
  select doc || jsonb_build_object('contacts',coalesce(jsonb_agg(to_jsonb(c) order by is_primary desc,created_at),'[]')) into doc from public.contacts c where user_id=(select auth.uid()) and (doctor_id=p_id or establishment_id=p_id);
  select doc || jsonb_build_object('favorite',exists(select 1 from public.favorites where user_id=(select auth.uid()) and (doctor_id=p_id or establishment_id=p_id))) into doc;
  if p_type='establishments' then
   select doc || jsonb_build_object('addresses',coalesce(jsonb_agg(to_jsonb(a) order by is_primary desc,created_at),'[]')) into doc from public.addresses a where establishment_id=p_id and user_id=(select auth.uid());
   select doc || jsonb_build_object('specialties',coalesce(jsonb_agg(to_jsonb(s)),'[]')) into doc from public.specialties s join public.establishment_specialties j on j.specialty_id=s.id and j.user_id=s.user_id where j.establishment_id=p_id;
   select doc || jsonb_build_object('doctors',coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('link_notes',j.notes,'specialties',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.specialties s join public.doctor_specialties ds on ds.specialty_id=s.id and ds.user_id=s.user_id where ds.doctor_id=d.id))),'[]')) into doc from public.doctors d join public.doctor_establishments j on j.doctor_id=d.id and j.user_id=d.user_id where j.establishment_id=p_id;
   select doc || jsonb_build_object('health_plans',coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('link_notes',j.notes)),'[]')) into doc from public.health_plans h join public.establishment_health_plans j on j.health_plan_id=h.id and j.user_id=h.user_id where j.establishment_id=p_id;
  else
   select doc || jsonb_build_object('specialties',coalesce(jsonb_agg(to_jsonb(s)),'[]')) into doc from public.specialties s join public.doctor_specialties j on j.specialty_id=s.id and j.user_id=s.user_id where j.doctor_id=p_id;
   select doc || jsonb_build_object('establishments',coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('link_notes',j.notes,'addresses',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.addresses a where a.establishment_id=e.id),'specialties',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.specialties s join public.establishment_specialties es on es.specialty_id=s.id and es.user_id=s.user_id where es.establishment_id=e.id))),'[]')) into doc from public.establishments e join public.doctor_establishments j on j.establishment_id=e.id and j.user_id=e.user_id where j.doctor_id=p_id;
   select doc || jsonb_build_object('health_plans',coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('link_notes',j.notes)),'[]')) into doc from public.health_plans h join public.doctor_health_plans j on j.health_plan_id=h.id and j.user_id=h.user_id where j.doctor_id=p_id;
  end if;
 else
  select doc || jsonb_build_object('establishments',coalesce(jsonb_agg(to_jsonb(e)),'[]')) into doc from public.establishments e where exists(select 1 from public.establishment_specialties j where p_type='specialties' and j.specialty_id=p_id and j.establishment_id=e.id) or exists(select 1 from public.establishment_health_plans j where p_type='health_plans' and j.health_plan_id=p_id and j.establishment_id=e.id);
  select doc || jsonb_build_object('doctors',coalesce(jsonb_agg(to_jsonb(d)),'[]')) into doc from public.doctors d where exists(select 1 from public.doctor_specialties j where p_type='specialties' and j.specialty_id=p_id and j.doctor_id=d.id) or exists(select 1 from public.doctor_health_plans j where p_type='health_plans' and j.health_plan_id=p_id and j.doctor_id=d.id);
 end if;
 return doc;
end $$;

create function public.search_network(p_filters jsonb default '{}',p_page integer default 1,p_size integer default 12) returns jsonb language sql stable security invoker set search_path='' as $$
 with entities as (
  select 'establishments' as category,id,name,created_at,active from public.establishments where user_id=(select auth.uid())
  union all select 'doctors',id,name,created_at,active from public.doctors where user_id=(select auth.uid())
  union all select 'specialties',id,name,created_at,active from public.specialties where user_id=(select auth.uid())
  union all select 'health_plans',id,name,created_at,active from public.health_plans where user_id=(select auth.uid())
 ), docs as not materialized (
  select *,public.network_document(category,id) as data from entities where
   (coalesce(p_filters->>'category','')='' or category=p_filters->>'category') and
   (coalesce(p_filters->>'active','')='' or active=(p_filters->>'active')::boolean)
 ), matches as not materialized (
 select * from docs where
  (coalesce(p_filters->>'q','')='' or position(public.network_normalize(p_filters->>'q') in public.network_normalize(data::text))>0) and
  (coalesce(p_filters->>'kind','')='' or data->>'kind'=p_filters->>'kind') and
  (coalesce(p_filters->>'favorites','')<>'true' or data->>'favorite'='true') and
  (coalesce(p_filters->>'specialty','')='' or data->'specialties' @> jsonb_build_array(jsonb_build_object('id',p_filters->>'specialty')) or (category='specialties' and id::text=p_filters->>'specialty')) and
  (coalesce(p_filters->>'doctor','')='' or data->'doctors' @> jsonb_build_array(jsonb_build_object('id',p_filters->>'doctor')) or (category='doctors' and id::text=p_filters->>'doctor')) and
  (coalesce(p_filters->>'plan','')='' or data->'health_plans' @> jsonb_build_array(jsonb_build_object('id',p_filters->>'plan')) or (category='health_plans' and id::text=p_filters->>'plan')) and
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
create function public.network_summary() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('establishments',(select count(*) from public.establishments),'doctors',(select count(*) from public.doctors),'specialties',(select count(*) from public.specialties),'health_plans',(select count(*) from public.health_plans))
$$;
revoke all on function public.network_normalize(text) from public,anon;
grant execute on function public.network_normalize(text) to authenticated;
revoke all on function public.save_network_entity(text,uuid,jsonb) from public,anon;
grant execute on function public.save_network_entity(text,uuid,jsonb) to authenticated;
revoke all on function public.network_document(text,uuid) from public,anon;
grant execute on function public.network_document(text,uuid) to authenticated;
revoke all on function public.search_network(jsonb,integer,integer) from public,anon;
grant execute on function public.search_network(jsonb,integer,integer) to authenticated;
revoke all on function public.network_summary() from public,anon;
grant execute on function public.network_summary() to authenticated;
notify pgrst, 'reload schema';
commit;
