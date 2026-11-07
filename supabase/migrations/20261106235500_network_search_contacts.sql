begin;
-- Keep contact/website/CNPJ search while building only the selected page of compact cards.
create or replace function public.browse_network(p_filters jsonb default '{}',p_page integer default 1,p_size integer default 12) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.is_active_member() then raise insufficient_privilege;end if;
 return (
 with params as materialized (
  select public.network_normalize(left(trim(coalesce(p_filters->>'q','')),150)) q,
   nullif(p_filters->>'plan','')::uuid plan,nullif(p_filters->>'doctor','')::uuid doctor,nullif(p_filters->>'specialty','')::uuid specialty
 ), members as materialized (select m.* from params p cross join lateral public.health_plan_members(p.plan) m where p.plan is not null),
 entities as materialized (
  select 'establishments'::text category,id,name,concat_ws(' ',trade_name,website,cnpj) trade_name,kind,active,created_at from public.establishments
  union all select 'doctors',id,name,concat_ws(' ',professional_council,registration_number,registration_state),null,active,created_at from public.doctors
  union all select 'specialties',id,name,null,null,active,created_at from public.specialties
  union all select 'health_plans',id,name,notes,null,active,created_at from public.health_plans
 ), named as materialized (
  select e.category,e.id from entities e cross join params p where p.q<>'' and position(p.q in public.network_normalize(concat_ws(' ',e.name,e.trade_name)))>0
 ), located as materialized (
  select a.establishment_id,a.doctor_id from public.addresses a cross join params p where
   (p.q<>'' and position(p.q in public.network_normalize(concat_ws(' ',a.street,a.neighborhood,a.city,a.state,a.postal_code)))>0)
  union all
  select c.establishment_id,c.doctor_id from public.contacts c cross join params p where p.q<>'' and (
   position(p.q in public.network_normalize(concat_ws(' ',c.value,c.label)))>0
   or (c.kind in ('phone','mobile','whatsapp') and length(regexp_replace(p.q,'\D','','g'))>=8
    and position(regexp_replace(p.q,'\D','','g') in regexp_replace(c.value,'\D','','g'))>0))

 ), matches as materialized (
  select e.* from entities e cross join params p where
   (coalesce(p_filters->>'category','')='' or e.category=p_filters->>'category')
   and (coalesce(p_filters->>'kind','')='' or e.kind=p_filters->>'kind')
   and (coalesce(p_filters->>'active','')='' or e.active=(p_filters->>'active')::boolean)
   and (coalesce(p_filters->>'favorites','')<>'true' or exists(select 1 from public.favorites f where f.user_id=(select auth.uid()) and (f.doctor_id=e.id or f.establishment_id=e.id)))
   and (p.plan is null or (e.category='health_plans' and e.id=p.plan) or exists(select 1 from members m where m.category=e.category and m.id=e.id))
   and (p.doctor is null or case e.category
    when 'doctors' then e.id=p.doctor
    when 'establishments' then exists(select 1 from public.doctor_establishments j where j.doctor_id=p.doctor and j.establishment_id=e.id)
    when 'specialties' then exists(select 1 from public.doctor_specialties j where j.doctor_id=p.doctor and j.specialty_id=e.id)
    when 'health_plans' then exists(select 1 from public.doctor_health_plans j where j.doctor_id=p.doctor and j.health_plan_id=e.id) or exists(select 1 from public.doctor_establishment_health_plans j where j.doctor_id=p.doctor and j.health_plan_id=e.id)
    else false end)
   and (p.specialty is null or case e.category
    when 'specialties' then e.id=p.specialty
    when 'establishments' then exists(select 1 from public.establishment_specialties j where j.establishment_id=e.id and j.specialty_id=p.specialty)
    when 'doctors' then (p.plan is null and exists(select 1 from public.doctor_specialties j where j.doctor_id=e.id and j.specialty_id=p.specialty))
     or exists(select 1 from public.doctor_specialties j join public.doctor_health_plans h on h.doctor_id=j.doctor_id where j.doctor_id=e.id and j.specialty_id=p.specialty and h.health_plan_id=p.plan)
     or exists(select 1 from public.doctor_establishment_specialties j join public.doctor_establishment_health_plans h on h.doctor_id=j.doctor_id and h.establishment_id=j.establishment_id where j.doctor_id=e.id and j.specialty_id=p.specialty and h.health_plan_id=p.plan)
    when 'health_plans' then exists(select 1 from public.health_plan_members(e.id) m where m.category='specialties' and m.id=p.specialty)
    else false end)
   and (p.q='' or exists(select 1 from named n where n.category=e.category and n.id=e.id)
    or (e.category='establishments' and (
     e.id in (select j.establishment_id from public.doctor_establishments j join named n on n.category='doctors' and n.id=j.doctor_id)
     or e.id in(select j.establishment_id from public.establishment_specialties j join named n on n.category='specialties' and n.id=j.specialty_id)
     or e.id in(select j.establishment_id from public.establishment_health_plans j join named n on n.category='health_plans' and n.id=j.health_plan_id)
     or e.id in(select establishment_id from located)))
    or (e.category='doctors' and (
     e.id in(select j.doctor_id from public.doctor_establishments j join named n on n.category='establishments' and n.id=j.establishment_id where p.plan is null or exists(select 1 from public.doctor_establishment_health_plans h where h.doctor_id=j.doctor_id and h.establishment_id=j.establishment_id and h.health_plan_id=p.plan))
     or e.id in(select j.doctor_id from public.doctor_specialties j join named n on n.category='specialties' and n.id=j.specialty_id where p.plan is null or exists(select 1 from public.doctor_health_plans h where h.doctor_id=j.doctor_id and h.health_plan_id=p.plan) or exists(select 1 from public.doctor_establishment_specialties s join public.doctor_establishment_health_plans h on h.doctor_id=s.doctor_id and h.establishment_id=s.establishment_id where s.doctor_id=j.doctor_id and s.specialty_id=j.specialty_id and h.health_plan_id=p.plan))
     or e.id in(select j.doctor_id from public.doctor_health_plans j join named n on n.category='health_plans' and n.id=j.health_plan_id)
     or e.id in(select j.doctor_id from public.doctor_establishment_health_plans j join named n on n.category='health_plans' and n.id=j.health_plan_id)
     or e.id in(select doctor_id from located where p.plan is null or exists(select 1 from public.doctor_health_plans h where h.doctor_id=located.doctor_id and h.health_plan_id=p.plan))
     or e.id in(select j.doctor_id from public.doctor_establishments j join located a on a.establishment_id=j.establishment_id where p.plan is null or exists(select 1 from public.doctor_establishment_health_plans h where h.doctor_id=j.doctor_id and h.establishment_id=j.establishment_id and h.health_plan_id=p.plan))))
    or (e.category='specialties' and e.id in(select j.specialty_id from public.doctor_specialties j join named n on n.category='doctors' and n.id=j.doctor_id))
   )
   and (not exists(select 1 from jsonb_each_text(p_filters) f where f.key in ('state','city','neighborhood') and coalesce(f.value,'')<>'') or exists(
    select 1 from public.addresses a where
     (case e.category
      when 'establishments' then a.establishment_id=e.id
      when 'doctors' then (a.doctor_id=e.id and (p.plan is null or exists(select 1 from public.doctor_health_plans h where h.doctor_id=e.id and h.health_plan_id=p.plan)))
       or a.establishment_id in(select j.establishment_id from public.doctor_establishments j where j.doctor_id=e.id
        and (p.plan is null or exists(select 1 from public.doctor_establishment_health_plans h where h.doctor_id=e.id and h.establishment_id=j.establishment_id and h.health_plan_id=p.plan))
        and (p.specialty is null or p.plan is null or exists(select 1 from public.doctor_establishment_specialties s where s.doctor_id=e.id and s.establishment_id=j.establishment_id and s.specialty_id=p.specialty)))
      when 'specialties' then a.establishment_id in(select j.establishment_id from public.establishment_specialties j where j.specialty_id=e.id and (p.plan is null or exists(select 1 from public.establishment_health_plans h where h.establishment_id=j.establishment_id and h.health_plan_id=p.plan)))
      when 'health_plans' then a.establishment_id in(select establishment_id from public.establishment_health_plans where health_plan_id=e.id)
       or a.establishment_id in(select establishment_id from public.doctor_establishment_health_plans where health_plan_id=e.id)
       or a.doctor_id in(select doctor_id from public.doctor_health_plans where health_plan_id=e.id)
      else false end)
     and (coalesce(p_filters->>'state','')='' or a.state=upper(p_filters->>'state'))
     and (coalesce(p_filters->>'city','')='' or public.network_normalize(trim(a.city))=public.network_normalize(trim(p_filters->>'city')))
     and (coalesce(p_filters->>'neighborhood','')='' or public.network_normalize(trim(a.neighborhood))=public.network_normalize(trim(p_filters->>'neighborhood')))
   ))
 ), page as materialized (
  select * from matches order by
   case when p_filters->>'sort'='oldest' then created_at end asc,
   case when coalesce(p_filters->>'sort','newest')='newest' then created_at end desc,
   case when p_filters->>'sort'='name' then public.network_normalize(name) end asc,
   case when p_filters->>'sort'='name_desc' then public.network_normalize(name) end desc,id
  limit least(greatest(coalesce(p_size,12),1),50) offset (greatest(coalesce(p_page,1),1)-1)*least(greatest(coalesce(p_size,12),1),50)
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('category',category,'data',public.network_scoped_card(category,id,(select plan from params)))) from page),'[]'),'total',(select count(*) from matches))
 );
end $$;
revoke all on function public.browse_network(jsonb,integer,integer) from public,anon;
grant execute on function public.browse_network(jsonb,integer,integer) to authenticated;


notify pgrst,'reload schema';
commit;
