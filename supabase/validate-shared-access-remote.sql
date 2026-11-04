-- Controlled PostgreSQL role/claim validation; no real Auth login/JWT is created.
-- All disposable identities and application records are rolled back.
begin;
select set_config('sharedtest.admin',(select id::text from auth.users where lower(email)=lower('andersonpinheiro.developer@gmail.com')),true),
 set_config('sharedtest.admin2',gen_random_uuid()::text,true),
 set_config('sharedtest.viewer',gen_random_uuid()::text,true),
 set_config('sharedtest.blocked',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('sharedtest.admin2')::uuid),(current_setting('sharedtest.viewer')::uuid),(current_setting('sharedtest.blocked')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('sharedtest.admin'),true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('sharedtest.admin'),'role','authenticated')::text,true);
do $test$
declare place uuid;
begin
 if public.get_my_profile()->>'role'<>'admin' or public.get_my_profile()->>'status'<>'active' then raise exception 'Bootstrap administrator unavailable';end if;
 if (public.admin_list_users()->>'total')::integer<>4 then raise exception 'Administrative list failed';end if;
 perform public.admin_set_access(current_setting('sharedtest.viewer')::uuid,'viewer','active');
 perform public.admin_set_access(current_setting('sharedtest.admin2')::uuid,'admin','active');
 begin
  perform public.admin_set_access(current_setting('sharedtest.admin')::uuid,'viewer','blocked');
  raise exception 'Self-demotion accepted';
 exception when insufficient_privilege then null;end;
 place:=public.save_network_entity('establishments',null,jsonb_build_object('name','Shared validation '||gen_random_uuid(),'kind','clinic','favorite',true));
 perform set_config('sharedtest.place',place::text,true);
end $test$;
select set_config('request.jwt.claim.sub',current_setting('sharedtest.admin2'),true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('sharedtest.admin2'),'role','authenticated')::text,true);
do $test$
declare doctor uuid;
begin
 doctor:=public.save_network_entity('doctors',null,jsonb_build_object('name','Shared doctor '||gen_random_uuid(),'establishments',jsonb_build_array(jsonb_build_object('id',current_setting('sharedtest.place')))));
 if not exists(select 1 from public.doctor_establishments where doctor_id=doctor and establishment_id=current_setting('sharedtest.place')::uuid) then raise exception 'Cross-author association missing';end if;
 if (select user_id from public.establishments where id=current_setting('sharedtest.place')::uuid)<>current_setting('sharedtest.admin')::uuid then raise exception 'Original author changed';end if;
end $test$;
select set_config('request.jwt.claim.sub',current_setting('sharedtest.viewer'),true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('sharedtest.viewer'),'role','authenticated')::text,true);
do $test$
declare n integer;
begin
 if public.network_document('establishments',current_setting('sharedtest.place')::uuid) is null then raise exception 'Viewer cannot read shared record';end if;
 if (public.search_network()->>'total')::integer<>3 then raise exception 'Viewer search failed';end if;
 if (select count(*) from public.favorites)<>0 then raise exception 'Another user favorites exposed';end if;
 insert into public.favorites(establishment_id) values(current_setting('sharedtest.place')::uuid);
 if (select count(*) from public.favorites)<>1 then raise exception 'Viewer favorite failed';end if;
 update public.establishments set name='Forbidden edit' where id=current_setting('sharedtest.place')::uuid;
 get diagnostics n=row_count;if n<>0 then raise exception 'Viewer direct update accepted';end if;
 delete from public.establishments where id=current_setting('sharedtest.place')::uuid;
 get diagnostics n=row_count;if n<>0 then raise exception 'Viewer direct delete accepted';end if;
 begin
  insert into public.specialties(name) values('Forbidden insert');raise exception 'Viewer direct insert accepted';
 exception when insufficient_privilege then null;end;
 begin
  perform public.save_network_entity('specialties',null,'{"name":"Forbidden RPC"}'::jsonb);raise exception 'Viewer RPC write accepted';
 exception when insufficient_privilege then null;end;
 begin
  perform public.admin_set_access(current_setting('sharedtest.viewer')::uuid,'admin','active');raise exception 'Viewer self-promotion accepted';
 exception when insufficient_privilege then null;end;
 begin
  update public.profiles set role='admin' where id=current_setting('sharedtest.viewer')::uuid;raise exception 'Direct profile escalation accepted';
 exception when insufficient_privilege then null;end;
 begin
  perform public.admin_list_users();raise exception 'Viewer administrative list accepted';
 exception when insufficient_privilege then null;end;
end $test$;
select set_config('request.jwt.claim.sub',current_setting('sharedtest.blocked'),true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('sharedtest.blocked'),'role','authenticated')::text,true);
do $test$
begin
 if (select count(*) from public.specialties)<>0 or (select count(*) from public.establishments)<>0 then raise exception 'Blocked identity can read records';end if;
 begin
  perform public.network_document('establishments',current_setting('sharedtest.place')::uuid);raise exception 'Blocked identity can read RPC';
 exception when insufficient_privilege then null;end;
 if (public.search_network()->>'total')::integer<>0 then raise exception 'Blocked identity can search';end if;
 begin
  perform public.save_network_entity('specialties',null,'{"name":"Blocked RPC"}'::jsonb);raise exception 'Blocked RPC write accepted';
 exception when insufficient_privilege then null;end;
end $test$;
select set_config('request.jwt.claim.sub',current_setting('sharedtest.admin'),true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('sharedtest.admin'),'role','authenticated')::text,true);
do $test$
begin
 if (select count(*) from public.favorites)<>1 then raise exception 'Administrator favorites changed by viewer';end if;
 perform public.admin_set_access(current_setting('sharedtest.viewer')::uuid,'viewer','blocked');
end $test$;
select set_config('request.jwt.claim.sub',current_setting('sharedtest.viewer'),true);
do $test$
begin
 if (select count(*) from public.establishments)<>0 or (select count(*) from public.favorites)<>0 then raise exception 'Revoked identity retains access with same claims';end if;
end $test$;
select set_config('request.jwt.claim.sub',current_setting('sharedtest.admin'),true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('sharedtest.admin'),'role','authenticated')::text,true);
do $test$
declare document jsonb;n integer;
begin
 document:=public.network_document('establishments',current_setting('sharedtest.place')::uuid);
 perform public.save_network_entity('establishments',current_setting('sharedtest.place')::uuid,document||'{"name":"Shared validation edited"}'::jsonb);
 if (select name from public.establishments where id=current_setting('sharedtest.place')::uuid)<>'Shared validation edited' then raise exception 'Administrator update failed';end if;
 delete from public.establishments where id=current_setting('sharedtest.place')::uuid;
 get diagnostics n=row_count;if n<>1 then raise exception 'Administrator delete failed';end if;
end $test$;
reset role;
set local role anon;
do $test$
begin
 begin
  perform public.get_my_profile();raise exception 'Anonymous profile RPC accepted';
 exception when insufficient_privilege then null;end;
 begin
  perform public.search_network();raise exception 'Anonymous search RPC accepted';
 exception when insufficient_privilege then null;end;
end $test$;
reset role;
select 'PASS: admin CRUD, shared cross-author links, viewer read-only access, independent favorites, blocked/revoked users, no self-escalation and anonymous denial; test data rolled back' result;
rollback;
