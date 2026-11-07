begin;
-- Shared catalogue ordering cannot use author-prefixed indexes efficiently.
create index establishments_recent_shared_idx on public.establishments(created_at desc,id);
create index doctors_recent_shared_idx on public.doctors(created_at desc,id);
create index specialties_recent_shared_idx on public.specialties(created_at desc,id);
create index health_plans_recent_shared_idx on public.health_plans(created_at desc,id);

-- A card has bounded children. Full institutional graphs belong on the detail screen.
create function public.network_card(p_type text,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare doc jsonb;
begin
 if not private.is_active_member() then raise insufficient_privilege;end if;
 if p_type='establishments' then
  select jsonb_build_object('id',id,'name',name,'trade_name',trade_name,'kind',kind,'active',active,'created_at',created_at) into doc from public.establishments where id=p_id;
 elsif p_type='doctors' then
  select jsonb_build_object('id',id,'name',name,'professional_type',professional_type,'professional_council',professional_council,'registration_number',registration_number,'registration_state',registration_state,'active',active,'created_at',created_at) into doc from public.doctors where id=p_id;
 elsif p_type='specialties' then
  select jsonb_build_object('id',id,'name',name,'active',active,'created_at',created_at) into doc from public.specialties where id=p_id;
 elsif p_type='health_plans' then
  select jsonb_build_object('id',id,'name',name,'active',active,'created_at',created_at) into doc from public.health_plans where id=p_id;
 else return null;end if;
 if doc is null then return null;end if;
 if p_type in ('establishments','doctors') then
  doc:=doc||jsonb_build_object('favorite',exists(select 1 from public.favorites where user_id=(select auth.uid()) and (doctor_id=p_id or establishment_id=p_id)));
  select doc||jsonb_build_object('contacts',coalesce(jsonb_agg(to_jsonb(c)),'[]')) into doc from (
   select id,kind,label,value,is_primary,notes from (
    select c.*,row_number() over(partition by (kind='whatsapp') order by is_primary desc,created_at,id) position
    from public.contacts c where doctor_id=p_id or establishment_id=p_id
   ) ranked where position=1 order by is_primary desc,created_at,id
  ) c;
  select doc||jsonb_build_object('addresses',coalesce(jsonb_agg(to_jsonb(a)),'[]')) into doc from (
   select id,street,number,complement,neighborhood,city,state,postal_code,is_primary,reference from public.addresses
   where establishment_id=p_id or doctor_id=p_id order by is_primary desc,created_at,id limit 1
  ) a;
  if p_type='doctors' then
   select doc||jsonb_build_object('specialties',coalesce(jsonb_agg(to_jsonb(s)),'[]')) into doc from (
    select s.id,s.name from public.specialties s join public.doctor_specialties j on j.specialty_id=s.id where j.doctor_id=p_id order by s.name,s.id limit 3
   ) s;
   select doc||jsonb_build_object('establishments',coalesce(jsonb_agg(to_jsonb(e)),'[]')) into doc from (
    select e.id,e.name from public.establishments e join public.doctor_establishments j on j.establishment_id=e.id where j.doctor_id=p_id order by e.name,e.id limit 3
   ) e;
  else
   select doc||jsonb_build_object('specialties',coalesce(jsonb_agg(to_jsonb(s)),'[]')) into doc from (
    select s.id,s.name from public.specialties s join public.establishment_specialties j on j.specialty_id=s.id where j.establishment_id=p_id order by s.name,s.id limit 3
   ) s;
  end if;
 end if;
 return doc;
end $$;
revoke all on function public.network_card(text,uuid) from public,anon;
grant execute on function public.network_card(text,uuid) to authenticated;

create function public.dashboard_network(p_section text,p_size integer default 6) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.is_active_member() then raise insufficient_privilege;end if;
 if p_section not in ('recent','favorites') or p_section is null then raise exception 'Invalid dashboard section' using errcode='22023';end if;
 return (
 with candidates as materialized (
  select 'establishments' category,id,created_at from public.establishments e where p_section='recent' or exists(select 1 from public.favorites f where f.user_id=(select auth.uid()) and f.establishment_id=e.id)
  union all select 'doctors',id,created_at from public.doctors d where p_section='recent' or exists(select 1 from public.favorites f where f.user_id=(select auth.uid()) and f.doctor_id=d.id)
  union all select 'specialties',id,created_at from public.specialties where p_section='recent'
  union all select 'health_plans',id,created_at from public.health_plans where p_section='recent'
 ), page as materialized (
  select * from candidates order by created_at desc,id limit least(greatest(coalesce(p_size,6),1),12)
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('category',category,'data',public.network_card(category,id)) order by created_at desc,id) from page),'[]'),'total',(select count(*) from candidates))
 );
end $$;
revoke all on function public.dashboard_network(text,integer) from public,anon;
grant execute on function public.dashboard_network(text,integer) to authenticated;

create or replace function public.search_network(p_filters jsonb default '{}',p_page integer default 1,p_size integer default 12) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.is_active_member() then return jsonb_build_object('items','[]'::jsonb,'total',0);end if;
 -- Keep the existing RPC contract for already-published clients. Select IDs before expanding details.
 if not exists(select 1 from jsonb_each_text(coalesce(p_filters,'{}')) f where f.key in ('q','kind','specialty','doctor','plan','city','neighborhood','state') and coalesce(f.value,'')<>'') then
 return (
 with candidates as materialized (
  select 'establishments' category,id,name,created_at,active from public.establishments
  union all select 'doctors',id,name,created_at,active from public.doctors
  union all select 'specialties',id,name,created_at,active from public.specialties
  union all select 'health_plans',id,name,created_at,active from public.health_plans
 ), matches as materialized (
  select * from candidates c where (coalesce(p_filters->>'category','')='' or category=p_filters->>'category')
   and (coalesce(p_filters->>'active','')='' or active=(p_filters->>'active')::boolean)
   and (coalesce(p_filters->>'favorites','')<>'true' or exists(select 1 from public.favorites f where f.user_id=(select auth.uid()) and (f.establishment_id=c.id or f.doctor_id=c.id)))
 ), page as materialized (
  select * from matches order by case when p_filters->>'sort'='oldest' then created_at end asc,
   case when coalesce(p_filters->>'sort','newest')='newest' then created_at end desc,
   case when p_filters->>'sort'='name' then public.network_normalize(name) end asc,id
  limit least(greatest(p_size,1),50) offset (greatest(p_page,1)-1)*least(greatest(p_size,1),50)
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('category',category,'data',public.network_document(category,id))) from page),'[]'),'total',(select count(*) from matches))
 );
 end if;
 return (
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
 );
end $$;
notify pgrst,'reload schema';
commit;
