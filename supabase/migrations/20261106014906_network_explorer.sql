begin;
-- Reuse the normalized catalogue. No provider/plan model or relationship is recreated.
create function public.health_plan_members(p_plan uuid) returns table(category text,id uuid)
language sql stable security invoker set search_path='' as $$
 with members as (
  select 'establishments'::text category,establishment_id id from public.establishment_health_plans where health_plan_id=p_plan
  union select 'doctors',doctor_id from public.doctor_health_plans where health_plan_id=p_plan
  union select 'doctors',doctor_id from public.doctor_establishment_health_plans where health_plan_id=p_plan
 ), specialties as (
  select j.specialty_id id from public.establishment_specialties j join members m on m.category='establishments' and m.id=j.establishment_id
  union select j.specialty_id from public.doctor_specialties j join public.doctor_health_plans h on h.doctor_id=j.doctor_id where h.health_plan_id=p_plan
  union select j.specialty_id from public.doctor_establishment_specialties j join public.doctor_establishment_health_plans h on h.doctor_id=j.doctor_id and h.establishment_id=j.establishment_id where h.health_plan_id=p_plan
 ) select * from members union select 'specialties',id from specialties
$$;
revoke all on function public.health_plan_members(uuid) from public,anon;
grant execute on function public.health_plan_members(uuid) to authenticated;

create function public.health_plan_overview(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 with members as materialized (select * from public.health_plan_members(p_id)),
 places as (
  select a.city,a.state from public.addresses a where
   a.establishment_id in (select id from members where category='establishments')
   or a.establishment_id in (select establishment_id from public.doctor_establishment_health_plans where health_plan_id=p_id)
   or a.doctor_id in (select doctor_id from public.doctor_health_plans where health_plan_id=p_id)
 ), cities as materialized (
  select min(trim(city)) city,state from places where nullif(trim(city),'') is not null group by public.network_normalize(trim(city)),state
 ) select jsonb_build_object('id',h.id,'name',h.name,'notes',h.notes,'active',h.active,'created_at',h.created_at,'updated_at',h.updated_at,
  'operator_name',substring(h.notes from 'Operadora: (.*?)\. Registro'),
  'plan_registration',substring(h.notes from 'Registro apresentado: ([^.]+)'),
  'establishments_count',(select count(*) from members where category='establishments'),
  'doctors_count',(select count(*) from members where category='doctors'),
  'specialties_count',(select count(*) from members where category='specialties'),
  'cities_count',(select count(*) from cities),
  'cities',coalesce((select jsonb_agg(to_jsonb(c)) from (select * from cities order by city,state limit 3) c),'[]'))
 from public.health_plans h where h.id=p_id and (select private.is_active_member())
$$;
revoke all on function public.health_plan_overview(uuid) from public,anon;
grant execute on function public.health_plan_overview(uuid) to authenticated;

create function public.network_lookup(p_category text,p_q text default '',p_selected uuid default null,p_search boolean default true) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; selected jsonb;
begin
 if not private.is_active_member() then raise insufficient_privilege;end if;
 if p_category not in ('specialties','doctors','health_plans','establishments') then raise exception 'Invalid lookup category' using errcode='22023';end if;
 execute format('select jsonb_build_object(''id'',id,''name'',name) from public.%I where id=$1',p_category) into selected using p_selected;
 if p_search then
  execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]'') from (select id,name from public.%I where position(public.network_normalize($1) in public.network_normalize(name))>0 order by public.network_normalize(name),id limit 20) t',p_category) into result using left(trim(coalesce(p_q,'')),100);
 end if;
 return jsonb_build_object('items',coalesce(result,'[]'),'selected',selected);
end $$;
revoke all on function public.network_lookup(text,text,uuid,boolean) from public,anon;
grant execute on function public.network_lookup(text,text,uuid,boolean) to authenticated;

create function public.network_locations(p_field text,p_state text default '',p_city text default '',p_q text default '',p_plan uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.is_active_member() then raise insufficient_privilege;end if;
 if p_field not in ('state','city','neighborhood') then raise exception 'Invalid location field' using errcode='22023';end if;
 return (with options as (
  select case p_field when 'state' then a.state when 'city' then trim(a.city) else trim(a.neighborhood) end name from public.addresses a
  where (coalesce(p_state,'')='' or a.state=upper(p_state))
   and (coalesce(p_city,'')='' or public.network_normalize(trim(a.city))=public.network_normalize(trim(p_city)))
   and (p_plan is null or a.establishment_id in (select establishment_id from public.establishment_health_plans where health_plan_id=p_plan)
    or a.establishment_id in (select establishment_id from public.doctor_establishment_health_plans where health_plan_id=p_plan)
    or a.doctor_id in (select doctor_id from public.doctor_health_plans where health_plan_id=p_plan))
 ), distinct_options as (
  select min(name) name from options where nullif(name,'') is not null and position(public.network_normalize(left(coalesce(p_q,''),100)) in public.network_normalize(name))>0 group by public.network_normalize(name)
 ) select coalesce(jsonb_agg(jsonb_build_object('id',name,'name',name)),'[]') from (select name from distinct_options order by public.network_normalize(name) limit 30) page);
end $$;
revoke all on function public.network_locations(text,text,text,text,uuid) from public,anon;
grant execute on function public.network_locations(text,text,text,text,uuid) to authenticated;

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
 if p_type='doctors' then
  doc:=doc||jsonb_build_object('specialties_count',(select count(*) from public.doctor_specialties where doctor_id=p_id),'establishments_count',(select count(*) from public.doctor_establishments where doctor_id=p_id));
  select doc||jsonb_build_object('health_plans',coalesce(jsonb_agg(to_jsonb(h)),'[]')) into doc from (
   select id,name from public.health_plans where id in (select health_plan_id from public.doctor_health_plans where doctor_id=p_id union select health_plan_id from public.doctor_establishment_health_plans where doctor_id=p_id) order by name,id limit 3
  ) h;
 elsif p_type='establishments' then
  doc:=doc||jsonb_build_object('specialties_count',(select count(*) from public.establishment_specialties where establishment_id=p_id),'doctors_count',(select count(*) from public.doctor_establishments where establishment_id=p_id));
  select doc||jsonb_build_object('health_plans',coalesce(jsonb_agg(to_jsonb(h)),'[]')) into doc from (
   select h.id,h.name from public.health_plans h join public.establishment_health_plans j on j.health_plan_id=h.id where j.establishment_id=p_id order by h.name,h.id limit 3
  ) h;
 end if;
 return doc;
end $$;
revoke all on function public.network_card(text,uuid) from public,anon;
grant execute on function public.network_card(text,uuid) to authenticated;


create function public.network_scoped_card(p_type text,p_id uuid,p_plan uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare doc jsonb;
begin
 doc:=public.network_card(p_type,p_id);
 if p_plan is null or p_type<>'doctors' or doc is null then return doc;end if;
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

create function public.browse_network(p_filters jsonb default '{}',p_page integer default 1,p_size integer default 12) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.is_active_member() then raise insufficient_privilege;end if;
 return (
 with params as materialized (
  select public.network_normalize(left(trim(coalesce(p_filters->>'q','')),150)) q,
   nullif(p_filters->>'plan','')::uuid plan,nullif(p_filters->>'doctor','')::uuid doctor,nullif(p_filters->>'specialty','')::uuid specialty
 ), members as materialized (select m.* from params p cross join lateral public.health_plan_members(p.plan) m where p.plan is not null),
 entities as materialized (
  select 'establishments'::text category,id,name,trade_name,kind,active,created_at from public.establishments
  union all select 'doctors',id,name,concat_ws(' ',professional_council,registration_number),null,active,created_at from public.doctors
  union all select 'specialties',id,name,null,null,active,created_at from public.specialties
  union all select 'health_plans',id,name,notes,null,active,created_at from public.health_plans
 ), named as materialized (
  select e.category,e.id from entities e cross join params p where p.q<>'' and position(p.q in public.network_normalize(concat_ws(' ',e.name,e.trade_name)))>0
 ), located as materialized (
  select a.establishment_id,a.doctor_id from public.addresses a cross join params p where
   (p.q<>'' and position(p.q in public.network_normalize(concat_ws(' ',a.street,a.neighborhood,a.city,a.state,a.postal_code)))>0)
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

create function public.health_plan_network(p_plan uuid,p_category text default 'establishments',p_filters jsonb default '{}',p_page integer default 1,p_size integer default 12) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.is_active_member() then raise insufficient_privilege;end if;
 if p_category not in ('establishments','doctors','specialties') then raise exception 'Invalid network tab' using errcode='22023';end if;
 return public.browse_network(coalesce(p_filters,'{}')||jsonb_build_object('plan',p_plan,'category',p_category),p_page,p_size);
end $$;
revoke all on function public.health_plan_network(uuid,text,jsonb,integer,integer) from public,anon;
grant execute on function public.health_plan_network(uuid,text,jsonb,integer,integer) to authenticated;



notify pgrst,'reload schema';
commit;
