-- Shared access. PROPOSED: requires production audit and explicit authorization.
begin;
create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;
do $$begin
 if to_regclass('public.profiles') is not null and to_regprocedure('private.manage_access(uuid,text,text)') is null then
  raise exception 'Existing profiles table requires an explicit authorization audit before adapting this migration';
 end if;
end $$;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text check(length(display_name)<=200),
 role text not null default 'viewer' check(role in ('admin','viewer')),
 status text not null default 'blocked' check(status in ('active','blocked')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
revoke all on public.profiles from public,anon,authenticated;
grant select on public.profiles to authenticated;
create or replace function private.is_active_member() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=(select auth.uid()) and status='active')
$$;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and status='active')
$$;
revoke all on function private.is_active_member(),private.is_admin() from public,anon;
grant execute on function private.is_active_member(),private.is_admin() to authenticated;
drop policy if exists profile_read on public.profiles;
create policy profile_read on public.profiles for select to authenticated using(id=(select auth.uid()) or (select private.is_admin()));

create or replace function private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id) values(new.id) on conflict do nothing;return new;end $$;
revoke all on function private.new_profile() from public,anon,authenticated;
drop trigger if exists minha_saude_new_profile on auth.users;
create trigger minha_saude_new_profile after insert on auth.users for each row execute function private.new_profile();
insert into public.profiles(id) select id from auth.users on conflict do nothing;

create or replace function private.protect_last_admin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('minha-saude/access-admin',0));
 if old.role='admin' and old.status='active' and (TG_OP='DELETE' or new.role<>'admin' or new.status<>'active') then
  if not exists(select 1 from public.profiles where id<>old.id and role='admin' and status='active') then raise exception 'O último administrador ativo deve ser preservado';end if;
 end if;
 if TG_OP='DELETE' then return old;end if;
 new.id:=old.id;new.created_at:=old.created_at;new.updated_at:=now();return new;
end $$;
revoke all on function private.protect_last_admin() from public,anon,authenticated;
drop trigger if exists protect_last_admin on public.profiles;
create trigger protect_last_admin before update or delete on public.profiles for each row execute function private.protect_last_admin();

create or replace function private.manage_access(p_id uuid,p_role text,p_status text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('minha-saude/access-admin',0));
 if not private.is_admin() then raise insufficient_privilege using message='Somente administradores ativos podem gerenciar acessos';end if;
 if p_id=auth.uid() then raise insufficient_privilege using message='Não é permitido alterar suas próprias permissões';end if;
 if p_role is null or p_status is null or p_role not in ('admin','viewer') or p_status not in ('active','blocked') then raise exception 'Permissões inválidas';end if;
 update public.profiles p set role=p_role,status=p_status where id=p_id returning to_jsonb(p) into result;
 if result is null then raise exception 'Usuário não encontrado';end if;return result;
end $$;
create or replace function private.list_users(p_page integer,p_size integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise insufficient_privilege using message='Somente administradores ativos podem listar usuários';end if;
 return jsonb_build_object('total',(select count(*) from public.profiles),'items',coalesce((select jsonb_agg(to_jsonb(t)) from (
  select p.id,u.email,p.display_name,p.role,p.status,p.created_at,p.updated_at from public.profiles p join auth.users u on u.id=p.id order by p.created_at,p.id limit least(greatest(p_size,1),50) offset (greatest(p_page,1)-1)*least(greatest(p_size,1),50)
 ) t),'[]'));
end $$;
revoke all on function private.manage_access(uuid,text,text),private.list_users(integer,integer) from public,anon;
grant execute on function private.manage_access(uuid,text,text),private.list_users(integer,integer) to authenticated;
create or replace function public.get_my_profile() returns jsonb language sql stable security invoker set search_path='' as $$select to_jsonb(p) from public.profiles p where id=(select auth.uid())$$;
create or replace function public.admin_list_users(p_page integer default 1,p_size integer default 20) returns jsonb language sql stable security invoker set search_path='' as $$select private.list_users(p_page,p_size)$$;
create or replace function public.admin_set_access(p_id uuid,p_role text,p_status text) returns jsonb language sql security invoker set search_path='' as $$select private.manage_access(p_id,p_role,p_status)$$;
revoke all on function public.get_my_profile(),public.admin_list_users(integer,integer),public.admin_set_access(uuid,text,text) from public,anon;
grant execute on function public.get_my_profile(),public.admin_list_users(integer,integer),public.admin_set_access(uuid,text,text) to authenticated;
do $$begin if exists(select 1 from pg_policies where schemaname='public' and tablename='establishments' and policyname not in ('owner_select','owner_insert','owner_update','owner_delete','shared_read','admin_insert','admin_update','admin_delete','personal_read','personal_insert','personal_update','personal_delete')) then raise exception 'Unexpected policy on establishments: audit required';end if;end $$;
drop policy if exists owner_select on public.establishments;
drop policy if exists owner_insert on public.establishments;
drop policy if exists owner_update on public.establishments;
drop policy if exists owner_delete on public.establishments;
drop policy if exists shared_read on public.establishments;
drop policy if exists admin_insert on public.establishments;
drop policy if exists admin_update on public.establishments;
drop policy if exists admin_delete on public.establishments;
drop policy if exists personal_read on public.establishments;
drop policy if exists personal_insert on public.establishments;
drop policy if exists personal_update on public.establishments;
drop policy if exists personal_delete on public.establishments;
alter table public.establishments enable row level security;
alter table public.establishments force row level security;
revoke all on public.establishments from public,anon,authenticated;
grant select,insert,update,delete on public.establishments to authenticated;
create policy shared_read on public.establishments for select to authenticated using ((select private.is_active_member()));
create policy admin_insert on public.establishments for insert to authenticated with check ((select private.is_admin()) and user_id=(select auth.uid()));
create policy admin_update on public.establishments for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.establishments for delete to authenticated using ((select private.is_admin()));
comment on column public.establishments.user_id is 'Historical author; never a shared-data authorization predicate.';
alter table public.establishments drop constraint if exists establishments_user_id_fkey;
alter table public.establishments add constraint establishments_user_id_fkey foreign key(user_id) references auth.users(id) on delete restrict;
do $$begin if exists(select 1 from pg_policies where schemaname='public' and tablename='doctors' and policyname not in ('owner_select','owner_insert','owner_update','owner_delete','shared_read','admin_insert','admin_update','admin_delete','personal_read','personal_insert','personal_update','personal_delete')) then raise exception 'Unexpected policy on doctors: audit required';end if;end $$;
drop policy if exists owner_select on public.doctors;
drop policy if exists owner_insert on public.doctors;
drop policy if exists owner_update on public.doctors;
drop policy if exists owner_delete on public.doctors;
drop policy if exists shared_read on public.doctors;
drop policy if exists admin_insert on public.doctors;
drop policy if exists admin_update on public.doctors;
drop policy if exists admin_delete on public.doctors;
drop policy if exists personal_read on public.doctors;
drop policy if exists personal_insert on public.doctors;
drop policy if exists personal_update on public.doctors;
drop policy if exists personal_delete on public.doctors;
alter table public.doctors enable row level security;
alter table public.doctors force row level security;
revoke all on public.doctors from public,anon,authenticated;
grant select,insert,update,delete on public.doctors to authenticated;
create policy shared_read on public.doctors for select to authenticated using ((select private.is_active_member()));
create policy admin_insert on public.doctors for insert to authenticated with check ((select private.is_admin()) and user_id=(select auth.uid()));
create policy admin_update on public.doctors for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.doctors for delete to authenticated using ((select private.is_admin()));
comment on column public.doctors.user_id is 'Historical author; never a shared-data authorization predicate.';
alter table public.doctors drop constraint if exists doctors_user_id_fkey;
alter table public.doctors add constraint doctors_user_id_fkey foreign key(user_id) references auth.users(id) on delete restrict;
do $$begin if exists(select 1 from pg_policies where schemaname='public' and tablename='specialties' and policyname not in ('owner_select','owner_insert','owner_update','owner_delete','shared_read','admin_insert','admin_update','admin_delete','personal_read','personal_insert','personal_update','personal_delete')) then raise exception 'Unexpected policy on specialties: audit required';end if;end $$;
drop policy if exists owner_select on public.specialties;
drop policy if exists owner_insert on public.specialties;
drop policy if exists owner_update on public.specialties;
drop policy if exists owner_delete on public.specialties;
drop policy if exists shared_read on public.specialties;
drop policy if exists admin_insert on public.specialties;
drop policy if exists admin_update on public.specialties;
drop policy if exists admin_delete on public.specialties;
drop policy if exists personal_read on public.specialties;
drop policy if exists personal_insert on public.specialties;
drop policy if exists personal_update on public.specialties;
drop policy if exists personal_delete on public.specialties;
alter table public.specialties enable row level security;
alter table public.specialties force row level security;
revoke all on public.specialties from public,anon,authenticated;
grant select,insert,update,delete on public.specialties to authenticated;
create policy shared_read on public.specialties for select to authenticated using ((select private.is_active_member()));
create policy admin_insert on public.specialties for insert to authenticated with check ((select private.is_admin()) and user_id=(select auth.uid()));
create policy admin_update on public.specialties for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.specialties for delete to authenticated using ((select private.is_admin()));
comment on column public.specialties.user_id is 'Historical author; never a shared-data authorization predicate.';
alter table public.specialties drop constraint if exists specialties_user_id_fkey;
alter table public.specialties add constraint specialties_user_id_fkey foreign key(user_id) references auth.users(id) on delete restrict;
do $$begin if exists(select 1 from pg_policies where schemaname='public' and tablename='health_plans' and policyname not in ('owner_select','owner_insert','owner_update','owner_delete','shared_read','admin_insert','admin_update','admin_delete','personal_read','personal_insert','personal_update','personal_delete')) then raise exception 'Unexpected policy on health_plans: audit required';end if;end $$;
drop policy if exists owner_select on public.health_plans;
drop policy if exists owner_insert on public.health_plans;
drop policy if exists owner_update on public.health_plans;
drop policy if exists owner_delete on public.health_plans;
drop policy if exists shared_read on public.health_plans;
drop policy if exists admin_insert on public.health_plans;
drop policy if exists admin_update on public.health_plans;
drop policy if exists admin_delete on public.health_plans;
drop policy if exists personal_read on public.health_plans;
drop policy if exists personal_insert on public.health_plans;
drop policy if exists personal_update on public.health_plans;
drop policy if exists personal_delete on public.health_plans;
alter table public.health_plans enable row level security;
alter table public.health_plans force row level security;
revoke all on public.health_plans from public,anon,authenticated;
grant select,insert,update,delete on public.health_plans to authenticated;
create policy shared_read on public.health_plans for select to authenticated using ((select private.is_active_member()));
create policy admin_insert on public.health_plans for insert to authenticated with check ((select private.is_admin()) and user_id=(select auth.uid()));
create policy admin_update on public.health_plans for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.health_plans for delete to authenticated using ((select private.is_admin()));
comment on column public.health_plans.user_id is 'Historical author; never a shared-data authorization predicate.';
alter table public.health_plans drop constraint if exists health_plans_user_id_fkey;
alter table public.health_plans add constraint health_plans_user_id_fkey foreign key(user_id) references auth.users(id) on delete restrict;
do $$begin if exists(select 1 from pg_policies where schemaname='public' and tablename='contacts' and policyname not in ('owner_select','owner_insert','owner_update','owner_delete','shared_read','admin_insert','admin_update','admin_delete','personal_read','personal_insert','personal_update','personal_delete')) then raise exception 'Unexpected policy on contacts: audit required';end if;end $$;
drop policy if exists owner_select on public.contacts;
drop policy if exists owner_insert on public.contacts;
drop policy if exists owner_update on public.contacts;
drop policy if exists owner_delete on public.contacts;
drop policy if exists shared_read on public.contacts;
drop policy if exists admin_insert on public.contacts;
drop policy if exists admin_update on public.contacts;
drop policy if exists admin_delete on public.contacts;
drop policy if exists personal_read on public.contacts;
drop policy if exists personal_insert on public.contacts;
drop policy if exists personal_update on public.contacts;
drop policy if exists personal_delete on public.contacts;
alter table public.contacts enable row level security;
alter table public.contacts force row level security;
revoke all on public.contacts from public,anon,authenticated;
grant select,insert,update,delete on public.contacts to authenticated;
create policy shared_read on public.contacts for select to authenticated using ((select private.is_active_member()));
create policy admin_insert on public.contacts for insert to authenticated with check ((select private.is_admin()) and user_id=(select auth.uid()));
create policy admin_update on public.contacts for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.contacts for delete to authenticated using ((select private.is_admin()));
comment on column public.contacts.user_id is 'Historical author; never a shared-data authorization predicate.';
alter table public.contacts drop constraint if exists contacts_user_id_fkey;
alter table public.contacts add constraint contacts_user_id_fkey foreign key(user_id) references auth.users(id) on delete restrict;
do $$begin if exists(select 1 from pg_policies where schemaname='public' and tablename='addresses' and policyname not in ('owner_select','owner_insert','owner_update','owner_delete','shared_read','admin_insert','admin_update','admin_delete','personal_read','personal_insert','personal_update','personal_delete')) then raise exception 'Unexpected policy on addresses: audit required';end if;end $$;
drop policy if exists owner_select on public.addresses;
drop policy if exists owner_insert on public.addresses;
drop policy if exists owner_update on public.addresses;
drop policy if exists owner_delete on public.addresses;
drop policy if exists shared_read on public.addresses;
drop policy if exists admin_insert on public.addresses;
drop policy if exists admin_update on public.addresses;
drop policy if exists admin_delete on public.addresses;
drop policy if exists personal_read on public.addresses;
drop policy if exists personal_insert on public.addresses;
drop policy if exists personal_update on public.addresses;
drop policy if exists personal_delete on public.addresses;
alter table public.addresses enable row level security;
alter table public.addresses force row level security;
revoke all on public.addresses from public,anon,authenticated;
grant select,insert,update,delete on public.addresses to authenticated;
create policy shared_read on public.addresses for select to authenticated using ((select private.is_active_member()));
create policy admin_insert on public.addresses for insert to authenticated with check ((select private.is_admin()) and user_id=(select auth.uid()));
create policy admin_update on public.addresses for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.addresses for delete to authenticated using ((select private.is_admin()));
comment on column public.addresses.user_id is 'Historical author; never a shared-data authorization predicate.';
alter table public.addresses drop constraint if exists addresses_user_id_fkey;
alter table public.addresses add constraint addresses_user_id_fkey foreign key(user_id) references auth.users(id) on delete restrict;
do $$begin if exists(select 1 from pg_policies where schemaname='public' and tablename='doctor_specialties' and policyname not in ('owner_select','owner_insert','owner_update','owner_delete','shared_read','admin_insert','admin_update','admin_delete','personal_read','personal_insert','personal_update','personal_delete')) then raise exception 'Unexpected policy on doctor_specialties: audit required';end if;end $$;
drop policy if exists owner_select on public.doctor_specialties;
drop policy if exists owner_insert on public.doctor_specialties;
drop policy if exists owner_update on public.doctor_specialties;
drop policy if exists owner_delete on public.doctor_specialties;
drop policy if exists shared_read on public.doctor_specialties;
drop policy if exists admin_insert on public.doctor_specialties;
drop policy if exists admin_update on public.doctor_specialties;
drop policy if exists admin_delete on public.doctor_specialties;
drop policy if exists personal_read on public.doctor_specialties;
drop policy if exists personal_insert on public.doctor_specialties;
drop policy if exists personal_update on public.doctor_specialties;
drop policy if exists personal_delete on public.doctor_specialties;
alter table public.doctor_specialties enable row level security;
alter table public.doctor_specialties force row level security;
revoke all on public.doctor_specialties from public,anon,authenticated;
grant select,insert,update,delete on public.doctor_specialties to authenticated;
create policy shared_read on public.doctor_specialties for select to authenticated using ((select private.is_active_member()));
create policy admin_insert on public.doctor_specialties for insert to authenticated with check ((select private.is_admin()) and user_id=(select auth.uid()));
create policy admin_update on public.doctor_specialties for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.doctor_specialties for delete to authenticated using ((select private.is_admin()));
comment on column public.doctor_specialties.user_id is 'Historical author; never a shared-data authorization predicate.';
alter table public.doctor_specialties drop constraint if exists doctor_specialties_user_id_fkey;
alter table public.doctor_specialties add constraint doctor_specialties_user_id_fkey foreign key(user_id) references auth.users(id) on delete restrict;
do $$begin if exists(select 1 from pg_policies where schemaname='public' and tablename='doctor_establishments' and policyname not in ('owner_select','owner_insert','owner_update','owner_delete','shared_read','admin_insert','admin_update','admin_delete','personal_read','personal_insert','personal_update','personal_delete')) then raise exception 'Unexpected policy on doctor_establishments: audit required';end if;end $$;
drop policy if exists owner_select on public.doctor_establishments;
drop policy if exists owner_insert on public.doctor_establishments;
drop policy if exists owner_update on public.doctor_establishments;
drop policy if exists owner_delete on public.doctor_establishments;
drop policy if exists shared_read on public.doctor_establishments;
drop policy if exists admin_insert on public.doctor_establishments;
drop policy if exists admin_update on public.doctor_establishments;
drop policy if exists admin_delete on public.doctor_establishments;
drop policy if exists personal_read on public.doctor_establishments;
drop policy if exists personal_insert on public.doctor_establishments;
drop policy if exists personal_update on public.doctor_establishments;
drop policy if exists personal_delete on public.doctor_establishments;
alter table public.doctor_establishments enable row level security;
alter table public.doctor_establishments force row level security;
revoke all on public.doctor_establishments from public,anon,authenticated;
grant select,insert,update,delete on public.doctor_establishments to authenticated;
create policy shared_read on public.doctor_establishments for select to authenticated using ((select private.is_active_member()));
create policy admin_insert on public.doctor_establishments for insert to authenticated with check ((select private.is_admin()) and user_id=(select auth.uid()));
create policy admin_update on public.doctor_establishments for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.doctor_establishments for delete to authenticated using ((select private.is_admin()));
comment on column public.doctor_establishments.user_id is 'Historical author; never a shared-data authorization predicate.';
alter table public.doctor_establishments drop constraint if exists doctor_establishments_user_id_fkey;
alter table public.doctor_establishments add constraint doctor_establishments_user_id_fkey foreign key(user_id) references auth.users(id) on delete restrict;
do $$begin if exists(select 1 from pg_policies where schemaname='public' and tablename='establishment_specialties' and policyname not in ('owner_select','owner_insert','owner_update','owner_delete','shared_read','admin_insert','admin_update','admin_delete','personal_read','personal_insert','personal_update','personal_delete')) then raise exception 'Unexpected policy on establishment_specialties: audit required';end if;end $$;
drop policy if exists owner_select on public.establishment_specialties;
drop policy if exists owner_insert on public.establishment_specialties;
drop policy if exists owner_update on public.establishment_specialties;
drop policy if exists owner_delete on public.establishment_specialties;
drop policy if exists shared_read on public.establishment_specialties;
drop policy if exists admin_insert on public.establishment_specialties;
drop policy if exists admin_update on public.establishment_specialties;
drop policy if exists admin_delete on public.establishment_specialties;
drop policy if exists personal_read on public.establishment_specialties;
drop policy if exists personal_insert on public.establishment_specialties;
drop policy if exists personal_update on public.establishment_specialties;
drop policy if exists personal_delete on public.establishment_specialties;
alter table public.establishment_specialties enable row level security;
alter table public.establishment_specialties force row level security;
revoke all on public.establishment_specialties from public,anon,authenticated;
grant select,insert,update,delete on public.establishment_specialties to authenticated;
create policy shared_read on public.establishment_specialties for select to authenticated using ((select private.is_active_member()));
create policy admin_insert on public.establishment_specialties for insert to authenticated with check ((select private.is_admin()) and user_id=(select auth.uid()));
create policy admin_update on public.establishment_specialties for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.establishment_specialties for delete to authenticated using ((select private.is_admin()));
comment on column public.establishment_specialties.user_id is 'Historical author; never a shared-data authorization predicate.';
alter table public.establishment_specialties drop constraint if exists establishment_specialties_user_id_fkey;
alter table public.establishment_specialties add constraint establishment_specialties_user_id_fkey foreign key(user_id) references auth.users(id) on delete restrict;
do $$begin if exists(select 1 from pg_policies where schemaname='public' and tablename='establishment_health_plans' and policyname not in ('owner_select','owner_insert','owner_update','owner_delete','shared_read','admin_insert','admin_update','admin_delete','personal_read','personal_insert','personal_update','personal_delete')) then raise exception 'Unexpected policy on establishment_health_plans: audit required';end if;end $$;
drop policy if exists owner_select on public.establishment_health_plans;
drop policy if exists owner_insert on public.establishment_health_plans;
drop policy if exists owner_update on public.establishment_health_plans;
drop policy if exists owner_delete on public.establishment_health_plans;
drop policy if exists shared_read on public.establishment_health_plans;
drop policy if exists admin_insert on public.establishment_health_plans;
drop policy if exists admin_update on public.establishment_health_plans;
drop policy if exists admin_delete on public.establishment_health_plans;
drop policy if exists personal_read on public.establishment_health_plans;
drop policy if exists personal_insert on public.establishment_health_plans;
drop policy if exists personal_update on public.establishment_health_plans;
drop policy if exists personal_delete on public.establishment_health_plans;
alter table public.establishment_health_plans enable row level security;
alter table public.establishment_health_plans force row level security;
revoke all on public.establishment_health_plans from public,anon,authenticated;
grant select,insert,update,delete on public.establishment_health_plans to authenticated;
create policy shared_read on public.establishment_health_plans for select to authenticated using ((select private.is_active_member()));
create policy admin_insert on public.establishment_health_plans for insert to authenticated with check ((select private.is_admin()) and user_id=(select auth.uid()));
create policy admin_update on public.establishment_health_plans for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.establishment_health_plans for delete to authenticated using ((select private.is_admin()));
comment on column public.establishment_health_plans.user_id is 'Historical author; never a shared-data authorization predicate.';
alter table public.establishment_health_plans drop constraint if exists establishment_health_plans_user_id_fkey;
alter table public.establishment_health_plans add constraint establishment_health_plans_user_id_fkey foreign key(user_id) references auth.users(id) on delete restrict;
do $$begin if exists(select 1 from pg_policies where schemaname='public' and tablename='doctor_health_plans' and policyname not in ('owner_select','owner_insert','owner_update','owner_delete','shared_read','admin_insert','admin_update','admin_delete','personal_read','personal_insert','personal_update','personal_delete')) then raise exception 'Unexpected policy on doctor_health_plans: audit required';end if;end $$;
drop policy if exists owner_select on public.doctor_health_plans;
drop policy if exists owner_insert on public.doctor_health_plans;
drop policy if exists owner_update on public.doctor_health_plans;
drop policy if exists owner_delete on public.doctor_health_plans;
drop policy if exists shared_read on public.doctor_health_plans;
drop policy if exists admin_insert on public.doctor_health_plans;
drop policy if exists admin_update on public.doctor_health_plans;
drop policy if exists admin_delete on public.doctor_health_plans;
drop policy if exists personal_read on public.doctor_health_plans;
drop policy if exists personal_insert on public.doctor_health_plans;
drop policy if exists personal_update on public.doctor_health_plans;
drop policy if exists personal_delete on public.doctor_health_plans;
alter table public.doctor_health_plans enable row level security;
alter table public.doctor_health_plans force row level security;
revoke all on public.doctor_health_plans from public,anon,authenticated;
grant select,insert,update,delete on public.doctor_health_plans to authenticated;
create policy shared_read on public.doctor_health_plans for select to authenticated using ((select private.is_active_member()));
create policy admin_insert on public.doctor_health_plans for insert to authenticated with check ((select private.is_admin()) and user_id=(select auth.uid()));
create policy admin_update on public.doctor_health_plans for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy admin_delete on public.doctor_health_plans for delete to authenticated using ((select private.is_admin()));
comment on column public.doctor_health_plans.user_id is 'Historical author; never a shared-data authorization predicate.';
alter table public.doctor_health_plans drop constraint if exists doctor_health_plans_user_id_fkey;
alter table public.doctor_health_plans add constraint doctor_health_plans_user_id_fkey foreign key(user_id) references auth.users(id) on delete restrict;
do $$begin if exists(select 1 from pg_policies where schemaname='public' and tablename='favorites' and policyname not in ('owner_select','owner_insert','owner_update','owner_delete','shared_read','admin_insert','admin_update','admin_delete','personal_read','personal_insert','personal_update','personal_delete')) then raise exception 'Unexpected policy on favorites: audit required';end if;end $$;
drop policy if exists owner_select on public.favorites;
drop policy if exists owner_insert on public.favorites;
drop policy if exists owner_update on public.favorites;
drop policy if exists owner_delete on public.favorites;
drop policy if exists shared_read on public.favorites;
drop policy if exists admin_insert on public.favorites;
drop policy if exists admin_update on public.favorites;
drop policy if exists admin_delete on public.favorites;
drop policy if exists personal_read on public.favorites;
drop policy if exists personal_insert on public.favorites;
drop policy if exists personal_update on public.favorites;
drop policy if exists personal_delete on public.favorites;
alter table public.favorites enable row level security;
alter table public.favorites force row level security;
revoke all on public.favorites from public,anon,authenticated;
grant select,insert,update,delete on public.favorites to authenticated;
create policy personal_read on public.favorites for select to authenticated using (((select private.is_active_member()) and user_id=(select auth.uid())));
create policy personal_insert on public.favorites for insert to authenticated with check (((select private.is_active_member()) and user_id=(select auth.uid())));
create policy personal_update on public.favorites for update to authenticated using (((select private.is_active_member()) and user_id=(select auth.uid()))) with check (((select private.is_active_member()) and user_id=(select auth.uid())));
create policy personal_delete on public.favorites for delete to authenticated using (((select private.is_active_member()) and user_id=(select auth.uid())));
alter table public.contacts drop constraint if exists contacts_user_id_doctor_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.contacts'::regclass and conname='contacts_doctor_id_shared_fkey') then alter table public.contacts add constraint contacts_doctor_id_shared_fkey foreign key(doctor_id) references public.doctors(id) on delete cascade;end if;end $$;
create index if not exists contacts_doctor_id_shared_idx on public.contacts(doctor_id);
alter table public.contacts drop constraint if exists contacts_user_id_establishment_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.contacts'::regclass and conname='contacts_establishment_id_shared_fkey') then alter table public.contacts add constraint contacts_establishment_id_shared_fkey foreign key(establishment_id) references public.establishments(id) on delete cascade;end if;end $$;
create index if not exists contacts_establishment_id_shared_idx on public.contacts(establishment_id);
alter table public.addresses drop constraint if exists addresses_user_id_establishment_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.addresses'::regclass and conname='addresses_establishment_id_shared_fkey') then alter table public.addresses add constraint addresses_establishment_id_shared_fkey foreign key(establishment_id) references public.establishments(id) on delete cascade;end if;end $$;
create index if not exists addresses_establishment_id_shared_idx on public.addresses(establishment_id);
alter table public.doctor_specialties drop constraint if exists doctor_specialties_user_id_doctor_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.doctor_specialties'::regclass and conname='doctor_specialties_doctor_id_shared_fkey') then alter table public.doctor_specialties add constraint doctor_specialties_doctor_id_shared_fkey foreign key(doctor_id) references public.doctors(id) on delete cascade;end if;end $$;
create index if not exists doctor_specialties_doctor_id_shared_idx on public.doctor_specialties(doctor_id);
alter table public.doctor_specialties drop constraint if exists doctor_specialties_user_id_specialty_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.doctor_specialties'::regclass and conname='doctor_specialties_specialty_id_shared_fkey') then alter table public.doctor_specialties add constraint doctor_specialties_specialty_id_shared_fkey foreign key(specialty_id) references public.specialties(id) on delete cascade;end if;end $$;
create index if not exists doctor_specialties_specialty_id_shared_idx on public.doctor_specialties(specialty_id);
create unique index if not exists doctor_specialties_shared_unique on public.doctor_specialties(doctor_id,specialty_id);
alter table public.doctor_establishments drop constraint if exists doctor_establishments_user_id_doctor_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.doctor_establishments'::regclass and conname='doctor_establishments_doctor_id_shared_fkey') then alter table public.doctor_establishments add constraint doctor_establishments_doctor_id_shared_fkey foreign key(doctor_id) references public.doctors(id) on delete cascade;end if;end $$;
create index if not exists doctor_establishments_doctor_id_shared_idx on public.doctor_establishments(doctor_id);
alter table public.doctor_establishments drop constraint if exists doctor_establishments_user_id_establishment_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.doctor_establishments'::regclass and conname='doctor_establishments_establishment_id_shared_fkey') then alter table public.doctor_establishments add constraint doctor_establishments_establishment_id_shared_fkey foreign key(establishment_id) references public.establishments(id) on delete cascade;end if;end $$;
create index if not exists doctor_establishments_establishment_id_shared_idx on public.doctor_establishments(establishment_id);
create unique index if not exists doctor_establishments_shared_unique on public.doctor_establishments(doctor_id,establishment_id);
alter table public.establishment_specialties drop constraint if exists establishment_specialties_user_id_establishment_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.establishment_specialties'::regclass and conname='establishment_specialties_establishment_id_shared_fkey') then alter table public.establishment_specialties add constraint establishment_specialties_establishment_id_shared_fkey foreign key(establishment_id) references public.establishments(id) on delete cascade;end if;end $$;
create index if not exists establishment_specialties_establishment_id_shared_idx on public.establishment_specialties(establishment_id);
alter table public.establishment_specialties drop constraint if exists establishment_specialties_user_id_specialty_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.establishment_specialties'::regclass and conname='establishment_specialties_specialty_id_shared_fkey') then alter table public.establishment_specialties add constraint establishment_specialties_specialty_id_shared_fkey foreign key(specialty_id) references public.specialties(id) on delete cascade;end if;end $$;
create index if not exists establishment_specialties_specialty_id_shared_idx on public.establishment_specialties(specialty_id);
create unique index if not exists establishment_specialties_shared_unique on public.establishment_specialties(establishment_id,specialty_id);
alter table public.establishment_health_plans drop constraint if exists establishment_health_plans_user_id_establishment_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.establishment_health_plans'::regclass and conname='establishment_health_plans_establishment_id_shared_fkey') then alter table public.establishment_health_plans add constraint establishment_health_plans_establishment_id_shared_fkey foreign key(establishment_id) references public.establishments(id) on delete cascade;end if;end $$;
create index if not exists establishment_health_plans_establishment_id_shared_idx on public.establishment_health_plans(establishment_id);
alter table public.establishment_health_plans drop constraint if exists establishment_health_plans_user_id_health_plan_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.establishment_health_plans'::regclass and conname='establishment_health_plans_health_plan_id_shared_fkey') then alter table public.establishment_health_plans add constraint establishment_health_plans_health_plan_id_shared_fkey foreign key(health_plan_id) references public.health_plans(id) on delete cascade;end if;end $$;
create index if not exists establishment_health_plans_health_plan_id_shared_idx on public.establishment_health_plans(health_plan_id);
create unique index if not exists establishment_health_plans_shared_unique on public.establishment_health_plans(establishment_id,health_plan_id);
alter table public.doctor_health_plans drop constraint if exists doctor_health_plans_user_id_doctor_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.doctor_health_plans'::regclass and conname='doctor_health_plans_doctor_id_shared_fkey') then alter table public.doctor_health_plans add constraint doctor_health_plans_doctor_id_shared_fkey foreign key(doctor_id) references public.doctors(id) on delete cascade;end if;end $$;
create index if not exists doctor_health_plans_doctor_id_shared_idx on public.doctor_health_plans(doctor_id);
alter table public.doctor_health_plans drop constraint if exists doctor_health_plans_user_id_health_plan_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.doctor_health_plans'::regclass and conname='doctor_health_plans_health_plan_id_shared_fkey') then alter table public.doctor_health_plans add constraint doctor_health_plans_health_plan_id_shared_fkey foreign key(health_plan_id) references public.health_plans(id) on delete cascade;end if;end $$;
create index if not exists doctor_health_plans_health_plan_id_shared_idx on public.doctor_health_plans(health_plan_id);
create unique index if not exists doctor_health_plans_shared_unique on public.doctor_health_plans(doctor_id,health_plan_id);
alter table public.favorites drop constraint if exists favorites_user_id_doctor_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.favorites'::regclass and conname='favorites_doctor_id_shared_fkey') then alter table public.favorites add constraint favorites_doctor_id_shared_fkey foreign key(doctor_id) references public.doctors(id) on delete cascade;end if;end $$;
create index if not exists favorites_doctor_id_shared_idx on public.favorites(doctor_id);
alter table public.favorites drop constraint if exists favorites_user_id_establishment_id_fkey;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.favorites'::regclass and conname='favorites_establishment_id_shared_fkey') then alter table public.favorites add constraint favorites_establishment_id_shared_fkey foreign key(establishment_id) references public.establishments(id) on delete cascade;end if;end $$;
create index if not exists favorites_establishment_id_shared_idx on public.favorites(establishment_id);
create or replace function public.save_network_entity(p_type text,p_id uuid,p_data jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare uid uuid := auth.uid(); entity uuid := coalesce(p_id,gen_random_uuid()); old_stamp timestamptz; item jsonb; linked uuid; jt text; fk text; target text; col text;
begin
 if not private.is_admin() then raise insufficient_privilege using message='Somente administradores ativos podem salvar cadastros'; end if;
 if p_type not in ('establishments','doctors','specialties','health_plans') then raise exception 'Tipo inválido'; end if;
 if length(trim(coalesce(p_data->>'name',''))) not between 1 and 200 then raise exception 'Informe um nome de até 200 caracteres'; end if;
 if p_type in ('specialties','health_plans') then
  perform pg_advisory_xact_lock(hashtextextended(p_type||public.network_normalize(trim(p_data->>'name')),0));
  execute format('select id from public.%I where public.network_normalize(trim(name))=public.network_normalize(trim($2)) and id<>$3 limit 1',p_type) into linked using uid,p_data->>'name',entity;
  if linked is not null then raise unique_violation using message='Já existe um cadastro com esse nome'; end if;
 end if;
 if p_id is not null then
  execute format('select updated_at from public.%I where id=$1 for update',p_type) into old_stamp using entity,uid;
  if old_stamp is null then raise insufficient_privilege using message='Registro indisponível'; end if;
  if p_data ? 'updated_at' and (p_data->>'updated_at')::timestamptz is distinct from old_stamp then raise exception 'Registro alterado em outra sessão. Recarregue antes de salvar.'; end if;
 else
  execute format('insert into public.%I(id,user_id,name%s) values ($1,$2,$3%s)',p_type,case when p_type='establishments' then ',kind' else '' end,case when p_type='establishments' then ',''clinic''' else '' end) using entity,uid,trim(p_data->>'name');
 end if;
 execute format('update public.%I set name=$1,active=$2 where id=$3',p_type) using trim(p_data->>'name'),coalesce((p_data->>'active')::boolean,true),entity,uid;
 if p_type='establishments' then
  update public.establishments set kind=p_data->>'kind',trade_name=nullif(trim(p_data->>'trade_name'),''),website=nullif(p_data->>'website',''),description=nullif(p_data->>'description',''),notes=nullif(p_data->>'notes','') where id=entity;
 elsif p_type='doctors' then
  update public.doctors set professional_council=p_data->>'professional_council',registration_number=p_data->>'registration_number',registration_state=p_data->>'registration_state',notes=p_data->>'notes' where id=entity;
 elsif p_type='specialties' then update public.specialties set description=p_data->>'description' where id=entity;
 else update public.health_plans set notes=p_data->>'notes' where id=entity;
 end if;
 if p_type in ('establishments','doctors') then
  fk := case when p_type='doctors' then 'doctor_id' else 'establishment_id' end;
  execute format('delete from public.contacts where %I=$1',fk) using entity,uid;
  for item in select value from jsonb_array_elements(coalesce(p_data->'contacts','[]')) loop
   execute format('insert into public.contacts(user_id,%I,kind,label,value,is_primary,notes) values ($1,$2,$3,$4,$5,$6,$7)',fk)
   using uid,entity,item->>'kind',item->>'label',trim(item->>'value'),coalesce((item->>'is_primary')::boolean,false),item->>'notes';
  end loop;
  if (select count(*) from public.contacts where is_primary and (doctor_id=entity or establishment_id=entity))>1 then raise exception 'Escolha apenas um contato principal'; end if;
  execute format('delete from public.favorites where %I=$1 and user_id=$2',fk) using entity,uid;
  if coalesce((p_data->>'favorite')::boolean,false) then execute format('insert into public.favorites(user_id,%I) values($1,$2)',fk) using uid,entity; end if;
  if p_type='establishments' then
   delete from public.addresses where establishment_id=entity;
   for item in select value from jsonb_array_elements(coalesce(p_data->'addresses','[]')) loop
    insert into public.addresses(user_id,establishment_id,postal_code,street,number,complement,neighborhood,city,state,reference,is_primary)
    values(uid,entity,nullif(regexp_replace(item->>'postal_code','[^0-9]','','g'),''),trim(item->>'street'),item->>'number',item->>'complement',item->>'neighborhood',trim(item->>'city'),upper(item->>'state'),item->>'reference',coalesce((item->>'is_primary')::boolean,false));
   end loop;
   if (select count(*) from public.addresses where establishment_id=entity and is_primary)>1 then raise exception 'Escolha apenas um endereço principal'; end if;
  end if;
  -- Replace only the owning entity's links, never the shared entities.
  foreach target in array array['specialties','health_plans',case when p_type='establishments' then 'doctors' else 'establishments' end] loop
   jt := case when target='specialties' then case when p_type='doctors' then 'doctor_specialties' else 'establishment_specialties' end
     when target='health_plans' then case when p_type='doctors' then 'doctor_health_plans' else 'establishment_health_plans' end else 'doctor_establishments' end;
   col := case target when 'specialties' then 'specialty_id' when 'health_plans' then 'health_plan_id' when 'doctors' then 'doctor_id' else 'establishment_id' end;
   execute format('delete from public.%I where %I=$1',jt,fk) using entity,uid;
   for item in select value from jsonb_array_elements(coalesce(p_data->target,'[]')) loop
    linked := nullif(item->>'id','')::uuid;
    if linked is null then
     if target='establishments' then raise exception 'Selecione um estabelecimento existente'; end if;
     perform pg_advisory_xact_lock(hashtextextended(target||public.network_normalize(trim(item->>'name')),0));
     execute format('select id from public.%I where public.network_normalize(trim(name))=public.network_normalize(trim($2)) order by created_at limit 1',target) into linked using uid,item->>'name';
     if linked is null then linked := public.save_network_entity(target,null,item); end if;
    end if;
    if target='specialties' then
     execute format('insert into public.%I(user_id,%I,%I) values($1,$2,$3) on conflict do nothing',jt,fk,col) using uid,entity,linked;
    else
     execute format('insert into public.%I(user_id,%I,%I,notes) values($1,$2,$3,$4) on conflict do nothing',jt,fk,col) using uid,entity,linked,item->>'link_notes';
    end if;
   end loop;
  end loop;
 end if;
 return entity;
end $$;
create or replace function public.network_document(p_type text,p_id uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare doc jsonb; fk text;
begin
 if not private.is_active_member() then raise insufficient_privilege using message='Acesso não autorizado';end if;
 if p_type not in ('establishments','doctors','specialties','health_plans') then return null; end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1',p_type) into doc using p_id;
 if doc is null then return null; end if;
 if p_type in ('establishments','doctors') then
  select doc || jsonb_build_object('contacts',coalesce(jsonb_agg(to_jsonb(c) order by is_primary desc,created_at),'[]')) into doc from public.contacts c where (doctor_id=p_id or establishment_id=p_id);
  select doc || jsonb_build_object('favorite',exists(select 1 from public.favorites where (select private.is_active_member()) and (doctor_id=p_id or establishment_id=p_id))) into doc;
  if p_type='establishments' then
   select doc || jsonb_build_object('addresses',coalesce(jsonb_agg(to_jsonb(a) order by is_primary desc,created_at),'[]')) into doc from public.addresses a where establishment_id=p_id;
   select doc || jsonb_build_object('specialties',coalesce(jsonb_agg(to_jsonb(s)),'[]')) into doc from public.specialties s join public.establishment_specialties j on j.specialty_id=s.id where j.establishment_id=p_id;
   select doc || jsonb_build_object('doctors',coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('link_notes',j.notes,'specialties',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.specialties s join public.doctor_specialties ds on ds.specialty_id=s.id where ds.doctor_id=d.id))),'[]')) into doc from public.doctors d join public.doctor_establishments j on j.doctor_id=d.id where j.establishment_id=p_id;
   select doc || jsonb_build_object('health_plans',coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('link_notes',j.notes)),'[]')) into doc from public.health_plans h join public.establishment_health_plans j on j.health_plan_id=h.id where j.establishment_id=p_id;
  else
   select doc || jsonb_build_object('specialties',coalesce(jsonb_agg(to_jsonb(s)),'[]')) into doc from public.specialties s join public.doctor_specialties j on j.specialty_id=s.id where j.doctor_id=p_id;
   select doc || jsonb_build_object('establishments',coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('link_notes',j.notes,'addresses',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.addresses a where a.establishment_id=e.id),'specialties',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.specialties s join public.establishment_specialties es on es.specialty_id=s.id where es.establishment_id=e.id))),'[]')) into doc from public.establishments e join public.doctor_establishments j on j.establishment_id=e.id where j.doctor_id=p_id;
   select doc || jsonb_build_object('health_plans',coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('link_notes',j.notes)),'[]')) into doc from public.health_plans h join public.doctor_health_plans j on j.health_plan_id=h.id where j.doctor_id=p_id;
  end if;
 else
  select doc || jsonb_build_object('establishments',coalesce(jsonb_agg(to_jsonb(e)),'[]')) into doc from public.establishments e where exists(select 1 from public.establishment_specialties j where p_type='specialties' and j.specialty_id=p_id and j.establishment_id=e.id) or exists(select 1 from public.establishment_health_plans j where p_type='health_plans' and j.health_plan_id=p_id and j.establishment_id=e.id);
  select doc || jsonb_build_object('doctors',coalesce(jsonb_agg(to_jsonb(d)),'[]')) into doc from public.doctors d where exists(select 1 from public.doctor_specialties j where p_type='specialties' and j.specialty_id=p_id and j.doctor_id=d.id) or exists(select 1 from public.doctor_health_plans j where p_type='health_plans' and j.health_plan_id=p_id and j.doctor_id=d.id);
 end if;
 return doc;
end $$;

create or replace function public.search_network(p_filters jsonb default '{}',p_page integer default 1,p_size integer default 12) returns jsonb language sql stable security invoker set search_path='' as $$
 with entities as (
  select 'establishments' as category,id,name,created_at,active from public.establishments where (select private.is_active_member())
  union all select 'doctors',id,name,created_at,active from public.doctors where (select private.is_active_member())
  union all select 'specialties',id,name,created_at,active from public.specialties where (select private.is_active_member())
  union all select 'health_plans',id,name,created_at,active from public.health_plans where (select private.is_active_member())
 ), docs as not materialized (
  select *,public.network_document(category,id) as data from entities where
   (coalesce(p_filters->>'category','')='' or category=p_filters->>'category') and
   (coalesce(p_filters->>'active','')='' or active=(p_filters->>'active')::boolean)
 ), matches as not materialized (
 select * from docs where
  (coalesce(p_filters->>'q','')='' or position(public.network_normalize(p_filters->>'q') in public.network_normalize(data::text))>0) and
  (coalesce(p_filters->>'kind','')='' or data->>'kind'=p_filters->>'kind') and
  (coalesce(p_filters->>'favorites','')<>'true' or data->>'favorite'='true') and
  (coalesce(p_filters->>'specialty','')='' or data->'specialties' @> jsonb_build_array(jsonb_build_object('id',p_filters->>'specialty')) or (category='specialties' and id::text=p_filters->>'specialty')) and
  (coalesce(p_filters->>'doctor','')='' or data->'doctors' @> jsonb_build_array(jsonb_build_object('id',p_filters->>'doctor')) or (category='doctors' and id::text=p_filters->>'doctor')) and
  (coalesce(p_filters->>'plan','')='' or data->'health_plans' @> jsonb_build_array(jsonb_build_object('id',p_filters->>'plan')) or (category='health_plans' and id::text=p_filters->>'plan')) and
  not exists(select 1 from jsonb_each_text(p_filters) f where f.key in ('city','neighborhood','state') and f.value<>'' and not exists(
    select 1 from jsonb_array_elements(coalesce(data->'addresses','[]') || coalesce((select jsonb_agg(a) from jsonb_array_elements(coalesce(data->'establishments','[]')) e cross join lateral jsonb_array_elements(coalesce(e->'addresses','[]')) a),'[]')) a
    where position(public.network_normalize(f.value) in public.network_normalize(coalesce(a->>f.key,'')))>0))
 ), page as (
  select category,data from matches order by case when p_filters->>'sort'='oldest' then created_at end asc,
   case when coalesce(p_filters->>'sort','newest')='newest' then created_at end desc,
   case when p_filters->>'sort'='name' then public.network_normalize(name) end asc,id
  limit least(greatest(p_size,1),50) offset (greatest(p_page,1)-1)*least(greatest(p_size,1),50)
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'total',(select count(*) from matches))
$$;
create or replace function public.network_summary() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('establishments',(select count(*) from public.establishments),'doctors',(select count(*) from public.doctors),'specialties',(select count(*) from public.specialties),'health_plans',(select count(*) from public.health_plans))
$$;
do $$begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  execute 'revoke execute on function public.rls_auto_enable() from public,anon,authenticated';
 end if;
end $$;
notify pgrst, 'reload schema';
commit;
