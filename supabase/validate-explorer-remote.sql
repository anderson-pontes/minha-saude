begin read only;
do $actor$ declare actor uuid;begin
 select id into actor from public.profiles where role='admin' and status='active' order by created_at limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('minha_saude.explorer_versions',(select jsonb_agg(version order by version)::text from supabase_migrations.schema_migrations where version in('20261106014906','20261106235136','20261106235500','20261106235906')),true);
end $actor$;
set local role authenticated;
with plan as (select id from public.health_plans where public.network_normalize(name) like '%unicasf%' limit 1),
 overview as materialized(select public.health_plan_overview(id) result from plan),
 first_page as materialized(select public.health_plan_network(id,'doctors','{"sort":"name"}',1,12) result from plan),
 second_page as materialized(select public.health_plan_network(id,'doctors','{"sort":"name"}',2,12) result from plan)
select jsonb_build_object(
 'migrations',current_setting('minha_saude.explorer_versions')::jsonb,
 'summary',public.network_summary(),
 'plan_counts',(select jsonb_build_object('establishments',result->'establishments_count','doctors',result->'doctors_count','specialties',result->'specialties_count','cities',result->'cities_count') from overview),
 'summary_has_provider_arrays',(select result?'establishments' or result?'doctors' from overview),
 'first_page_items',(select jsonb_array_length(result->'items') from first_page),
 'second_page_items',(select jsonb_array_length(result->'items') from second_page),
 'page_overlap',(select count(*) from first_page a,second_page b,jsonb_array_elements(a.result->'items') x,jsonb_array_elements(b.result->'items') y where x->'data'->>'id'=y->'data'->>'id'),
 'unscoped_doctor_places',(select count(*) from first_page a,plan p,jsonb_array_elements(a.result->'items') i cross join lateral jsonb_array_elements(i->'data'->'establishments') e where not exists(select 1 from public.doctor_establishment_health_plans h where h.doctor_id=(i->'data'->>'id')::uuid and h.establishment_id=(e->>'id')::uuid and h.health_plan_id=p.id)),
 'privileged_public_functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('health_plan_members','health_plan_overview','network_lookup','network_locations','network_scoped_card','browse_network','health_plan_network') and p.prosecdef)
) checks;
rollback;
