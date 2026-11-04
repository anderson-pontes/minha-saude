begin read only;
do $actor$ declare actor uuid; begin
 if (select count(*) from public.profiles where role='admin' and status='active')<>1 then raise exception 'Expected one administrator';end if;
 select id into actor from public.profiles where role='admin' and status='active';
 perform set_config('request.jwt.claim.sub',actor::text,true);
end $actor$;
set local role authenticated;
with run as (
 select payload,result from public.network_import_runs where content_sha256='0dc2ea3ad205c328a251282b3115651956891d69a82474b7cd6b5ecb3a5add9d'
), mapping as (
 select jsonb_object_agg(e->>'key',e->>'id') ids from run cross join lateral jsonb_array_elements(result->'entities') e
), expected_links as (
 select l->>'table' kind,(ids->>(l->>'left'))::uuid left_id,(ids->>(l->>'right'))::uuid right_id,
 (ids->>(l->>'specialty'))::uuid specialty_id,(ids->>'health_plans:unicasf')::uuid plan_id
 from run cross join mapping cross join lateral jsonb_array_elements(payload->'links') l
 where ids ? (l->>'left') and ids ? (l->>'right') and (not(l ? 'specialty') or ids ? (l->>'specialty'))
), missing_links as (
 select * from expected_links x where not case kind
 when 'doctor_specialties' then exists(select 1 from public.doctor_specialties j where j.doctor_id=x.left_id and j.specialty_id=x.right_id)
 when 'establishment_specialties' then exists(select 1 from public.establishment_specialties j where j.establishment_id=x.left_id and j.specialty_id=x.right_id)
 when 'doctor_establishments' then exists(select 1 from public.doctor_establishments j where j.doctor_id=x.left_id and j.establishment_id=x.right_id)
 when 'doctor_health_plans' then exists(select 1 from public.doctor_health_plans j where j.doctor_id=x.left_id and j.health_plan_id=x.right_id)
 when 'establishment_health_plans' then exists(select 1 from public.establishment_health_plans j where j.establishment_id=x.left_id and j.health_plan_id=x.right_id)
 when 'doctor_establishment_health_plans' then exists(select 1 from public.doctor_establishment_health_plans j where j.doctor_id=x.left_id and j.establishment_id=x.right_id and j.health_plan_id=x.plan_id)
 when 'doctor_establishment_specialties' then exists(select 1 from public.doctor_establishment_specialties j where j.doctor_id=x.left_id and j.establishment_id=x.right_id and j.specialty_id=x.specialty_id)
 else false end
), expected_contacts as (
 select (ids->>(e->>'key'))::uuid entity_id,c->>'kind' kind,c->>'value' value
 from run cross join mapping cross join lateral jsonb_array_elements(payload->'entities') e
 cross join lateral jsonb_array_elements(coalesce(e->'data'->'contacts','[]')) c where ids ? (e->>'key')
), expected_addresses as (
 select (ids->>(e->>'key'))::uuid entity_id,a from run cross join mapping
 cross join lateral jsonb_array_elements(payload->'entities') e
 cross join lateral jsonb_array_elements(coalesce(e->'data'->'addresses','[]')) a where ids ? (e->>'key')
), plan as (select id from public.health_plans where public.import_normalize(name)='unicasf saude'),
 brasmede as (select public.network_document('establishments',id) doc from public.establishments where cnpj='02600250000198'),
 bianca as (select public.network_document('doctors',id) doc from public.doctors where professional_council='CRM' and registration_state='PA' and registration_number='10096')
select jsonb_build_object(
 'summary',public.network_summary(),
 'contacts',(select count(*) from public.contacts),
 'addresses',(select count(*) from public.addresses),
 'audit_runs',(select count(*) from public.network_import_runs),
 'expected_links',(select count(*) from expected_links),
 'missing_links',(select count(*) from missing_links),
 'missing_contacts',(select count(*) from expected_contacts e where not exists(select 1 from public.contacts c where (c.doctor_id=e.entity_id or c.establishment_id=e.entity_id) and c.kind=e.kind and c.value=e.value)),
 'missing_addresses',(select count(*) from expected_addresses e where not exists(select 1 from public.addresses a where (a.doctor_id=e.entity_id or a.establishment_id=e.entity_id)
  and public.import_normalize(a.street)=public.import_normalize(e.a->>'street') and coalesce(a.number,'')=coalesce(e.a->>'number','')
  and public.import_normalize(coalesce(a.complement,''))=public.import_normalize(coalesce(e.a->>'complement',''))
  and public.import_normalize(a.city)=public.import_normalize(e.a->>'city') and a.state=e.a->>'state')),
 'duplicate_cnpj_groups',(select count(*) from (select cnpj from public.establishments where cnpj is not null group by cnpj having count(*)>1) d),
 'duplicate_registration_groups',(select count(*) from (select professional_council,registration_state,registration_number from public.doctors where registration_number is not null group by 1,2,3 having count(*)>1) d),
 'brasmede_doctors',(select jsonb_array_length(doc->'doctors') from brasmede),
 'bianca_identity_count',(select count(*) from bianca),
 'bianca_has_own_address',(select jsonb_array_length(doc->'addresses')>0 from bianca),
 'bianca_has_clinicasf',(select exists(select 1 from jsonb_array_elements(doc->'establishments') e where e->>'cnpj'='04204285000303' and jsonb_array_length(e->'health_plans')>0) from bianca),
 'conflicting_crm_excluded',not exists(select 1 from public.doctors where professional_council='CRM' and registration_state='PA' and registration_number='15361'),
 'plan_filter_doctors',(public.search_network(jsonb_build_object('category','doctors','plan',(select id from plan)),1,1)->>'total')::integer,
 'city_neighborhood_plan_filter',(public.search_network(jsonb_build_object('category','establishments','city','Belem','neighborhood','Nazare','plan',(select id from plan)),1,1)->>'total')::integer,
 'specialty_filter',(public.search_network(jsonb_build_object('category','establishments','specialty',(select id from public.specialties where public.import_normalize(name)='cardiologia' limit 1)),1,1)->>'total')::integer,
 'doctor_filter',(public.search_network(jsonb_build_object('category','establishments','doctor',(select doc->>'id' from bianca)),1,1)->>'total')::integer,
 'skipped_identities',(select result->'skipped' from run)
) verification;
rollback;
