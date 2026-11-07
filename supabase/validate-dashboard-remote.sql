begin read only;
do $actor$ declare actor uuid;begin
 select id into actor from public.profiles where role='admin' and status='active' order by created_at limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('minha_saude.dashboard_migration_recorded',(exists(select 1 from supabase_migrations.schema_migrations where version='20261105000050'))::text,true);
end $actor$;
set local role authenticated;
with recent as materialized (select public.dashboard_network('recent',6) result),
 favorites as materialized (select public.dashboard_network('favorites',4) result),
 legacy as materialized (select public.search_network('{}',1,6) result)
select jsonb_build_object(
 'summary',public.network_summary(),
 'recent_items',(select jsonb_array_length(result->'items') from recent),
 'favorites_items',(select jsonb_array_length(result->'items') from favorites),
 'favorites_total',(select result->'total' from favorites),
 'expected_personal_favorites',(select count(*) from public.favorites where user_id=(select auth.uid())),
 'same_recent_ids',(select jsonb_agg(e->'data'->'id') from recent,jsonb_array_elements(result->'items') e)=(select jsonb_agg(e->'data'->'id') from legacy,jsonb_array_elements(result->'items') e),
 'bounded_card_children',not exists(select 1 from recent,jsonb_array_elements(result->'items') e where jsonb_array_length(coalesce(e->'data'->'contacts','[]'))>2 or jsonb_array_length(coalesce(e->'data'->'addresses','[]'))>1 or jsonb_array_length(coalesce(e->'data'->'specialties','[]'))>3),
 'anonymous_rpc_denied',not has_function_privilege('anon','public.dashboard_network(text,integer)','EXECUTE'),
 'security_invoker',(select not prosecdef from pg_proc where oid='public.dashboard_network(text,integer)'::regprocedure),
 'migration_recorded',current_setting('minha_saude.dashboard_migration_recorded')::boolean
) verification;
rollback;
