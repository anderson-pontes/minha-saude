begin;
-- Bounded location summaries follow explicit credentialed attendance links.
create or replace function public.network_card(p_type text,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare doc jsonb;
begin
 if not private.is_active_member() then raise insufficient_privilege;end if;
 if p_type='health_plans' then return public.health_plan_overview(p_id);end if;
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
   where establishment_id=p_id or doctor_id=p_id or (p_type='doctors' and establishment_id in(select establishment_id from public.doctor_establishments where doctor_id=p_id)) order by (doctor_id=p_id) desc nulls last,is_primary desc,created_at,id limit 1
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
 if p_type='doctors' then
  doc:=doc||jsonb_build_object('specialties_count',(select count(*) from public.doctor_specialties where doctor_id=p_id),'establishments_count',(select count(*) from public.doctor_establishments where doctor_id=p_id),'health_plans_count',(select count(*) from (select health_plan_id from public.doctor_health_plans where doctor_id=p_id union select health_plan_id from public.doctor_establishment_health_plans where doctor_id=p_id) plans));
  select doc||jsonb_build_object('health_plans',coalesce(jsonb_agg(to_jsonb(h)),'[]')) into doc from (
   select id,name from public.health_plans where id in (select health_plan_id from public.doctor_health_plans where doctor_id=p_id union select health_plan_id from public.doctor_establishment_health_plans where doctor_id=p_id) order by name,id limit 3
  ) h;
 elsif p_type='establishments' then
  doc:=doc||jsonb_build_object('specialties_count',(select count(*) from public.establishment_specialties where establishment_id=p_id),'doctors_count',(select count(*) from public.doctor_establishments where establishment_id=p_id),'health_plans_count',(select count(*) from public.establishment_health_plans where establishment_id=p_id));
  select doc||jsonb_build_object('health_plans',coalesce(jsonb_agg(to_jsonb(h)),'[]')) into doc from (
   select h.id,h.name from public.health_plans h join public.establishment_health_plans j on j.health_plan_id=h.id where j.establishment_id=p_id order by h.name,h.id limit 3
  ) h;
 end if;
 return doc;
end $$;
revoke all on function public.network_card(text,uuid) from public,anon;
grant execute on function public.network_card(text,uuid) to authenticated;


create or replace function public.network_scoped_card(p_type text,p_id uuid,p_plan uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare doc jsonb;
begin
 doc:=public.network_card(p_type,p_id);
 if p_plan is null or p_type<>'doctors' or doc is null then return doc;end if;
 -- A doctor's own address is eligible only for a direct plan link; otherwise use a credentialed local address.
 select doc||jsonb_build_object('addresses',coalesce(jsonb_agg(to_jsonb(a)),'[]')) into doc from (
  select a.id,a.street,a.number,a.complement,a.neighborhood,a.city,a.state,a.postal_code,a.is_primary,a.reference from public.addresses a
  where (a.doctor_id=p_id and exists(select 1 from public.doctor_health_plans h where h.doctor_id=p_id and h.health_plan_id=p_plan))
   or a.establishment_id in(select establishment_id from public.doctor_establishment_health_plans where doctor_id=p_id and health_plan_id=p_plan)
  order by (a.doctor_id=p_id) desc nulls last,a.is_primary desc,a.created_at,a.id limit 1
 ) a;

 select doc||jsonb_build_object('establishments',coalesce(jsonb_agg(to_jsonb(e)),'[]'),'establishments_count',(select count(distinct establishment_id) from public.doctor_establishment_health_plans where doctor_id=p_id and health_plan_id=p_plan)) into doc from (
  select e.id,e.name from public.establishments e where e.id in (select establishment_id from public.doctor_establishment_health_plans where doctor_id=p_id and health_plan_id=p_plan) order by e.name,e.id limit 3
 ) e;
 with ids as materialized (
  select specialty_id id from public.doctor_specialties where doctor_id=p_id and exists(select 1 from public.doctor_health_plans where doctor_id=p_id and health_plan_id=p_plan)
  union select s.specialty_id from public.doctor_establishment_specialties s join public.doctor_establishment_health_plans h on h.doctor_id=s.doctor_id and h.establishment_id=s.establishment_id where h.doctor_id=p_id and h.health_plan_id=p_plan
 ) select doc||jsonb_build_object('specialties_count',(select count(*) from ids),'specialties',coalesce((select jsonb_agg(to_jsonb(s)) from (select id,name from public.specialties where id in(select id from ids) order by name,id limit 3) s),'[]')) into doc;
 return doc;
end $$;
revoke all on function public.network_scoped_card(text,uuid,uuid) from public,anon;
grant execute on function public.network_scoped_card(text,uuid,uuid) to authenticated;


notify pgrst,'reload schema';
commit;
