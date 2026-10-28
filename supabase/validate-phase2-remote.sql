-- Controlled remote validation. Test identities and all data are rolled back.
begin;
select set_config('phase2test.user_a',gen_random_uuid()::text,true),set_config('phase2test.user_b',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('phase2test.user_a')::uuid),(current_setting('phase2test.user_b')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('phase2test.user_a'),true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('phase2test.user_a'),'role','authenticated')::text,true);
do $test$
declare spec uuid; spec2 uuid; doctor uuid; plan uuid; place uuid; other_place uuid; d jsonb; payload jsonb; filtered jsonb; filter jsonb; n integer; t text;
begin
 if (public.search_network()->>'total')::integer<>0 then raise exception 'Test identity A is not empty'; end if;
 spec:=public.save_network_entity('specialties',null,'{"name":"Validação Cardiologia"}');
 spec2:=public.save_network_entity('specialties',null,'{"name":"Validação Clínica médica"}');
 plan:=public.save_network_entity('health_plans',null,'{"name":"Validação Convênio"}');
 doctor:=public.save_network_entity('doctors',null,jsonb_build_object('name','Validação Dra. Lúcia','specialties',jsonb_build_array(jsonb_build_object('id',spec),jsonb_build_object('id',spec2)),
  'health_plans',jsonb_build_array(jsonb_build_object('id',plan)),'contacts',jsonb_build_array(jsonb_build_object('kind','mobile','value','11999999999')),'favorite',true));
 payload:=jsonb_build_object('name','Validação Clínica São José','kind','clinic','favorite',true,'active',true,
  'contacts','[{"kind":"phone","value":"1133333333","is_primary":true},{"kind":"phone","value":"1144444444"},{"kind":"whatsapp","value":"11988888888"}]'::jsonb,
  'addresses','[{"postal_code":"01310100","street":"Avenida Paulista","number":"100","city":"São Paulo","state":"SP","neighborhood":"Bela Vista","is_primary":true}]'::jsonb,
  'specialties',jsonb_build_array(jsonb_build_object('id',spec),jsonb_build_object('id',spec2)),
  'doctors',jsonb_build_array(jsonb_build_object('id',doctor,'link_notes','Terças de manhã')),
  'health_plans',jsonb_build_array(jsonb_build_object('id',plan,'link_notes','Validar cobertura')));
 place:=public.save_network_entity('establishments',null,payload);
 d:=public.network_document('establishments',place);
 if jsonb_array_length(d->'contacts')<>3 or jsonb_array_length(d->'addresses')<>1 or jsonb_array_length(d->'specialties')<>2 or d#>>'{doctors,0,id}'<>doctor::text or d#>>'{doctors,0,link_notes}'<>'Terças de manhã' or d->>'favorite'<>'true' then raise exception 'Aggregate read failed'; end if;
 for filter in select value from jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('q','CARDIOLOGIA'),jsonb_build_object('q','LUCIA'),jsonb_build_object('q','bela vista'),jsonb_build_object('q','CONVENIO'),
  jsonb_build_object('city','sao paulo'),jsonb_build_object('specialty',spec),jsonb_build_object('doctor',doctor),jsonb_build_object('plan',plan),
  jsonb_build_object('kind','clinic','city','SAO PAULO','favorites','true','active','true'))) loop
  filtered:=public.search_network(filter);
  if not exists(select 1 from jsonb_array_elements(filtered->'items') r where r#>>'{data,id}'=place::text) then raise exception 'Related search failed: %',filter; end if;
 end loop;
 perform public.save_network_entity('establishments',place,d||'{"name":"Validação Editada","favorite":false}'::jsonb);
 d:=public.network_document('establishments',place);
 if d->>'name'<>'Validação Editada' or d->>'favorite'<>'false' or jsonb_array_length(d->'contacts')<>3 then raise exception 'Update failed'; end if;
 begin
  perform public.save_network_entity('establishments',place,d||'{"updated_at":"2000-01-01T00:00:00Z"}'::jsonb);
  raise exception 'Stale update accepted';
 exception when raise_exception then if sqlerrm not like '%outra sessão%' then raise; end if; end;
 begin
  perform public.save_network_entity('establishments',null,'{"name":"Rollback controlado","kind":"clinic","doctors":[{"name":"Rollback médico","specialties":[{"name":"Rollback especialidade"}],"contacts":[{"kind":"invalid","value":"1"}]}]}'::jsonb);
  raise exception 'Invalid aggregate accepted';
 exception when check_violation then null; end;
 if (public.search_network('{"q":"Rollback"}')->>'total')::integer<>0 then raise exception 'Partial persistence after failure'; end if;
 other_place:=public.save_network_entity('establishments',null,payload||jsonb_build_object('name','Validação Outro local','specialties',jsonb_build_array(jsonb_build_object('name','VALIDAÇÃO CARDIOLOGIA'))));
 if (public.network_summary()->>'doctors')::integer<>1 or (public.network_summary()->>'specialties')::integer<>2 then raise exception 'Duplicate shared records'; end if;
 if jsonb_array_length(public.search_network('{}',1,2)->'items')<>2 or jsonb_array_length(public.search_network('{}',2,2)->'items')<>2 then raise exception 'Pagination failed'; end if;
 delete from public.establishments where id=place;
 if public.network_document('establishments',place) is not null or public.network_document('doctors',doctor) is null or public.network_document('specialties',spec) is null or public.network_document('health_plans',plan) is null then raise exception 'Deletion integrity failed'; end if;
 if jsonb_array_length(public.network_document('doctors',doctor)->'establishments')<>1 then raise exception 'Shared attendance lost'; end if;
 perform public.save_network_entity('specialties',spec,'{"name":"Validação Especialidade editada"}');
 perform public.save_network_entity('health_plans',plan,'{"name":"Validação Convênio editado"}');
 d:=public.network_document('doctors',doctor);
 perform public.save_network_entity('doctors',doctor,d||'{"name":"Validação Médico editado","contacts":[{"kind":"email","value":"test@example.invalid"}],"favorite":false}'::jsonb);
 if public.network_document('doctors',doctor)->>'name'<>'Validação Médico editado' then raise exception 'Doctor update failed'; end if;
 perform set_config('phase2test.place',other_place::text,true);
 perform set_config('phase2test.doctor',doctor::text,true);
 perform set_config('phase2test.spec',spec::text,true);
 perform set_config('phase2test.plan',plan::text,true);
end $test$;

select set_config('request.jwt.claim.sub',current_setting('phase2test.user_b'),true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('phase2test.user_b'),'role','authenticated')::text,true);
do $test$
declare t text; n integer; place uuid:=current_setting('phase2test.place')::uuid;
begin
 foreach t in array array['establishments','doctors','specialties','health_plans','contacts','addresses','favorites','doctor_specialties','doctor_establishments','establishment_specialties','establishment_health_plans','doctor_health_plans'] loop
  execute format('select count(*) from public.%I',t) into n;
  if n<>0 then raise exception 'Cross-user table visibility: %',t; end if;
 end loop;
 if (public.search_network()->>'total')::integer<>0 or public.network_document('establishments',place) is not null then raise exception 'Cross-user RPC visibility'; end if;
 begin
  perform public.save_network_entity('establishments',place,'{"name":"Forbidden update","kind":"clinic"}');
  raise exception 'Cross-user update accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.save_network_entity('establishments',null,jsonb_build_object('name','Forbidden link','kind','clinic','specialties',jsonb_build_array(jsonb_build_object('id',current_setting('phase2test.spec')))));
  raise exception 'Cross-user foreign key accepted';
 exception when foreign_key_violation then null; end;
 update public.establishments set name='Forbidden' where id=place; get diagnostics n=row_count;
 if n<>0 then raise exception 'Cross-user raw update'; end if;
 delete from public.establishments where id=place; get diagnostics n=row_count;
 if n<>0 then raise exception 'Cross-user raw deletion'; end if;
end $test$;

select set_config('request.jwt.claim.sub',current_setting('phase2test.user_a'),true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('phase2test.user_a'),'role','authenticated')::text,true);
do $test$
begin
 if public.network_document('establishments',current_setting('phase2test.place')::uuid)->>'name'<>'Validação Outro local' then raise exception 'Owner data changed by another user'; end if;
 delete from public.doctors where id=current_setting('phase2test.doctor')::uuid;
 delete from public.specialties where id=current_setting('phase2test.spec')::uuid;
 delete from public.health_plans where id=current_setting('phase2test.plan')::uuid;
 if public.network_document('establishments',current_setting('phase2test.place')::uuid) is null then raise exception 'Shared entity deletion removed establishment'; end if;
end $test$;

set local role anon;
do $test$
begin
 begin perform public.search_network();raise exception 'Anonymous RPC allowed';exception when insufficient_privilege then null;end;
 begin perform public.network_summary();raise exception 'Anonymous summary allowed';exception when insufficient_privilege then null;end;
 begin perform count(*) from public.establishments;raise exception 'Anonymous table access allowed';exception when insufficient_privilege then null;end;
end $test$;
reset role;
rollback;
select jsonb_build_object('status','passed_and_rolled_back','tables',(select count(*) from pg_tables where schemaname='public'),
 'policies',(select count(*) from pg_policies where schemaname='public'),
 'remaining_data',jsonb_build_object('establishments',(select count(*) from public.establishments),'doctors',(select count(*) from public.doctors),'specialties',(select count(*) from public.specialties),'health_plans',(select count(*) from public.health_plans),'contacts',(select count(*) from public.contacts),'addresses',(select count(*) from public.addresses),'favorites',(select count(*) from public.favorites))) as remote_validation;
