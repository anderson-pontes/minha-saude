"""Prepare reviewed SQL only. Never connects to or mutates a remote database."""
from pathlib import Path
import re

shared=['establishments','doctors','specialties','health_plans','contacts','addresses','doctor_specialties','doctor_establishments','establishment_specialties','establishment_health_plans','doctor_health_plans']
refs={'contacts':[('doctor_id','doctors'),('establishment_id','establishments')],'addresses':[('establishment_id','establishments')],'doctor_specialties':[('doctor_id','doctors'),('specialty_id','specialties')],'doctor_establishments':[('doctor_id','doctors'),('establishment_id','establishments')],'establishment_specialties':[('establishment_id','establishments'),('specialty_id','specialties')],'establishment_health_plans':[('establishment_id','establishments'),('health_plan_id','health_plans')],'doctor_health_plans':[('doctor_id','doctors'),('health_plan_id','health_plans')],'favorites':[('doctor_id','doctors'),('establishment_id','establishments')]}
phase2=next(Path('supabase/migrations').glob('*_phase2_network.sql')).read_text(encoding='utf-8')
sql="""-- Shared access. PROPOSED: requires production audit and explicit authorization.
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
"""

for table in shared+['favorites']:
    # Refuse unexpected permissive policies rather than silently retaining an access bypass.
    names="'owner_select','owner_insert','owner_update','owner_delete','shared_read','admin_insert','admin_update','admin_delete','personal_read','personal_insert','personal_update','personal_delete'"
    sql+=f"do $$begin if exists(select 1 from pg_policies where schemaname='public' and tablename='{table}' and policyname not in ({names})) then raise exception 'Unexpected policy on {table}: audit required';end if;end $$;\n"
    for policy in ['owner_select','owner_insert','owner_update','owner_delete','shared_read','admin_insert','admin_update','admin_delete','personal_read','personal_insert','personal_update','personal_delete']:
        sql+=f'drop policy if exists {policy} on public.{table};\n'
    sql+=f'alter table public.{table} enable row level security;\nalter table public.{table} force row level security;\n'
    sql+=f'revoke all on public.{table} from public,anon,authenticated;\ngrant select,insert,update,delete on public.{table} to authenticated;\n'
    if table=='favorites':
        owner='((select private.is_active_member()) and user_id=(select auth.uid()))'
        sql+=f'create policy personal_read on public.favorites for select to authenticated using ({owner});\ncreate policy personal_insert on public.favorites for insert to authenticated with check ({owner});\ncreate policy personal_update on public.favorites for update to authenticated using ({owner}) with check ({owner});\ncreate policy personal_delete on public.favorites for delete to authenticated using ({owner});\n'
    else:
        sql+=f'create policy shared_read on public.{table} for select to authenticated using ((select private.is_active_member()));\ncreate policy admin_insert on public.{table} for insert to authenticated with check ((select private.is_admin()) and user_id=(select auth.uid()));\ncreate policy admin_update on public.{table} for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));\ncreate policy admin_delete on public.{table} for delete to authenticated using ((select private.is_admin()));\n'
        sql+=f'comment on column public.{table}.user_id is \'Historical author; never a shared-data authorization predicate.\';\n'
        # Preserve historical authors: deleting an Auth account cannot cascade shared content.
        sql+=f'alter table public.{table} drop constraint if exists {table}_user_id_fkey;\nalter table public.{table} add constraint {table}_user_id_fkey foreign key(user_id) references auth.users(id) on delete restrict;\n'

for table, links in refs.items():
    for column,parent in links:
        sql+=f'alter table public.{table} drop constraint if exists {table}_user_id_{column}_fkey;\n'
        sql+=f"do $$begin if not exists(select 1 from pg_constraint where conrelid='public.{table}'::regclass and conname='{table}_{column}_shared_fkey') then alter table public.{table} add constraint {table}_{column}_shared_fkey foreign key({column}) references public.{parent}(id) on delete cascade;end if;end $$;\n"
        sql+=f'create index if not exists {table}_{column}_shared_idx on public.{table}({column});\n'
    if table not in ['contacts','addresses','favorites']:
        sql+=f"create unique index if not exists {table}_shared_unique on public.{table}({','.join(c for c,_ in links)});\n"

save=phase2[phase2.index('create function public.save_network_entity'):phase2.index('create function public.network_document')]
save=save.replace('create function','create or replace function',1)
save=save.replace("if uid is null then raise insufficient_privilege using message='Sessão necessária'; end if;", "if not private.is_admin() then raise insufficient_privilege using message='Somente administradores ativos podem salvar cadastros'; end if;")
# Protect favorites predicates; shared entities use RLS, never author-based access.
favorite_lines={}
lines=save.splitlines()
for i,line in enumerate(lines):
    if 'public.favorites' in line:
        tag=f'__FAVORITE_{i}__';favorite_lines[tag]=line;lines[i]=tag
save='\n'.join(lines)
save=save.replace(' and user_id=$2','').replace(' and user_id=$4','').replace(' and user_id=uid','').replace('where user_id=uid and is_primary','where is_primary')
save=save.replace('where user_id=$1 and public.network_normalize(trim(name))=public.network_normalize(trim($2))','where public.network_normalize(trim(name))=public.network_normalize(trim($2))')
# The name query still binds uid as $1 for compatibility, but does not use it as ownership.
save=save.replace("uid::text||p_type||", "p_type||").replace("uid::text||target||", "target||")
for tag,line in favorite_lines.items():save=save.replace(tag,line)
sql+=save+'\n'

rest=phase2[phase2.index('create function public.network_document'):phase2.index('revoke all on function public.network_normalize')]
rest=rest.replace('create function','create or replace function')
rest=rest.replace("if p_type not in ('establishments','doctors','specialties','health_plans') then return null; end if;", "if not private.is_active_member() then raise insufficient_privilege using message='Acesso não autorizado';end if;\n if p_type not in ('establishments','doctors','specialties','health_plans') then return null; end if;")
rest=rest.replace('where id=$1 and user_id=(select auth.uid())','where id=$1')
rest=rest.replace('from public.contacts c where user_id=(select auth.uid()) and','from public.contacts c where')
rest=rest.replace(' and user_id=(select auth.uid())','')
rest=re.sub(r' and (j|ds|es)\.user_id=[a-z]\.user_id','',rest)
rest=rest.replace(' where user_id=(select auth.uid())',' where (select private.is_active_member())')
sql+=rest
sql+="""do $$begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  execute 'revoke execute on function public.rls_auto_enable() from public,anon,authenticated';
 end if;
end $$;
notify pgrst, 'reload schema';
commit;
"""
target=next(Path('supabase/migrations').glob('*_shared_access.sql'))
target.write_text(sql,encoding='utf-8')

# A separate, privileged bootstrap script targets the explicitly chosen existing account.
Path('supabase/bootstrap-first-admin.sql').write_text("""-- Run only after audit and explicit approval. Never callable by the frontend.
begin;
do $$declare target uuid;begin
 select id into target from auth.users where lower(email)=lower('andersonpinheiro.developer@gmail.com');
 if target is null then raise exception 'The approved Auth account must exist before bootstrap';end if;
 if exists(select 1 from public.profiles where role='admin' and status='active' and id<>target) then raise exception 'Active administrators already exist; use administrative access management';end if;
 update public.profiles set role='admin',status='active' where id=target;
 if not found then raise exception 'Profile missing: migration must be applied first';end if;
end $$;
commit;
""",encoding='utf-8')

rollback="-- REVIEWED manual rollback only; refuses cross-author links that need reconciliation.\nbegin;\n"
for table,links in refs.items():
    for column,parent in links:
        rollback+=f"do $$begin if exists(select 1 from public.{table} c join public.{parent} p on p.id=c.{column} where c.user_id<>p.user_id) then raise exception 'Rollback requires preservation review: cross-author {table}.{column}';end if;end $$;\n"
for table,links in refs.items():
    for column,parent in links:
        rollback+=f'alter table public.{table} drop constraint if exists {table}_{column}_shared_fkey;\nalter table public.{table} add constraint {table}_user_id_{column}_fkey foreign key(user_id,{column}) references public.{parent}(user_id,id) on delete cascade;\n'
for table in shared+['favorites']:
    for policy in ['shared_read','admin_insert','admin_update','admin_delete','personal_read','personal_insert','personal_update','personal_delete']:
        rollback+=f'drop policy if exists {policy} on public.{table};\n'
    for cmd in ['select','insert','update','delete']:
        rollback+=f'drop policy if exists owner_{cmd} on public.{table};\ncreate policy owner_{cmd} on public.{table} for {cmd} to authenticated '
        if cmd in ['select','update','delete']:rollback+='using ((select auth.uid())=user_id) '
        if cmd in ['insert','update']:rollback+='with check ((select auth.uid())=user_id) '
        rollback+=';\n'
rollback+=phase2[phase2.index('create function public.save_network_entity'):phase2.index('revoke all on function public.network_normalize')].replace('create function','create or replace function')
rollback+="notify pgrst,'reload schema';\ncommit;\n"
next(Path('supabase/rollback').glob('*_shared_access_rollback.sql')).write_text(rollback,encoding='utf-8')
print('Prepared local migration, guarded rollback, and explicit bootstrap. No remote changes.')
