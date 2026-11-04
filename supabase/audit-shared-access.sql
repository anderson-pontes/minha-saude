-- Read-only preflight. Run with the reconnected MCP before approval/application.
select jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_object('name',tablename,'rls',rowsecurity)) from pg_tables where schemaname='public'),
 'ownership_columns',(select jsonb_agg(to_jsonb(c)) from (select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and (column_name='user_id' or table_name='profiles')) c),
 'foreign_keys',(select jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid))) from pg_constraint where connamespace='public'::regnamespace and contype='f'),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public'),
 'views',(select jsonb_agg(jsonb_build_object('name',viewname,'definition',definition)) from pg_views where schemaname='public'),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'identity_arguments',pg_get_function_identity_arguments(p.oid),'security_definer',p.prosecdef,'settings',p.proconfig,'owner',r.rolname,'owner_bypassrls',r.rolbypassrls,'anon_execute',has_function_privilege('anon',p.oid,'execute'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname in ('public','private')),
 'users',(select jsonb_agg(jsonb_build_object('id',id,'email',email,'created_at',created_at)) from auth.users),
 'approved_admin_exists',exists(select 1 from auth.users where lower(email)=lower('andersonpinheiro.developer@gmail.com')),
 'counts',jsonb_build_object('establishments',(select count(*) from public.establishments),'doctors',(select count(*) from public.doctors),'specialties',(select count(*) from public.specialties),'health_plans',(select count(*) from public.health_plans),'contacts',(select count(*) from public.contacts),'addresses',(select count(*) from public.addresses),'favorites',(select count(*) from public.favorites))
) as access_preflight;
-- Also inspect the migration list via MCP and the schema exposure settings in Data API.
