from pathlib import Path
out = ["-- Foundation: pending review and explicit authorization before remote application.\nbegin;\n", "create function public.set_audit_fields() returns trigger language plpgsql security invoker set search_path = '' as $$ begin if TG_OP = 'UPDATE' then NEW.created_at := OLD.created_at; NEW.user_id := OLD.user_id; end if; NEW.updated_at := now(); return NEW; end $$;\nrevoke all on function public.set_audit_fields() from public, anon;\n"]
tables=[]
def table(name, fields, constraints=''):
    tables.append(name)
    out.append(f'''create table public.{name} (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 {fields},
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, id){',' if constraints else ''}
 {constraints}
);\n''')
def fk(col,parent):
    return f'foreign key (user_id, {col}) references public.{parent}(user_id, id) on delete cascade'
for name,extra in [('establishments', "kind text not null check (kind in ('clinic','hospital','laboratory','office','other')), notes text"),('doctors', 'professional_council text, registration_number text, registration_state text, notes text'),('specialties','description text'),('health_plans','notes text')]:
    table(name,"name text not null check (length(trim(name)) between 1 and 200), "+extra)
    out.append(f"create index {name}_search_idx on public.{name} using gin (to_tsvector('portuguese', name));\ncreate index {name}_user_name_idx on public.{name}(user_id, lower(name));\n")
for name in ['specialties','health_plans']:
    out.append(f'create unique index {name}_name_unique on public.{name}(user_id, lower(trim(name)));\n')
table('addresses', "establishment_id uuid not null, label text, street text not null check (length(trim(street)) > 0), number text, complement text, neighborhood text, city text not null check (length(trim(city)) > 0), state text not null check (state ~ '^[A-Z]{2}$'), postal_code text check (postal_code ~ '^[0-9]{8}$'), country_code text not null default 'BR' check (country_code ~ '^[A-Z]{2}$')", fk('establishment_id','establishments'))
table('contacts', "doctor_id uuid, establishment_id uuid, kind text not null check (kind in ('phone','whatsapp','email','website','other')), label text, value text not null check (length(trim(value)) > 0), is_primary boolean not null default false", "check (num_nonnulls(doctor_id, establishment_id) = 1),\n"+fk('doctor_id','doctors')+',\n'+fk('establishment_id','establishments'))
for name,left,lp,right,rp in [('doctor_specialties','doctor_id','doctors','specialty_id','specialties'),('doctor_establishments','doctor_id','doctors','establishment_id','establishments'),('establishment_specialties','establishment_id','establishments','specialty_id','specialties'),('establishment_health_plans','establishment_id','establishments','health_plan_id','health_plans')]:
    table(name, f'{left} uuid not null, {right} uuid not null', fk(left,lp)+',\n'+fk(right,rp)+f',\nunique(user_id, {left}, {right})')
table('favorites', 'doctor_id uuid, establishment_id uuid', 'check (num_nonnulls(doctor_id, establishment_id) = 1),\n'+fk('doctor_id','doctors')+',\n'+fk('establishment_id','establishments'))
out.append('create unique index favorites_doctor_unique on public.favorites(user_id, doctor_id) where doctor_id is not null;\ncreate unique index favorites_establishment_unique on public.favorites(user_id, establishment_id) where establishment_id is not null;\n')
refs={'addresses':['establishment_id'],'contacts':['doctor_id','establishment_id'],'doctor_specialties':['doctor_id','specialty_id'],'doctor_establishments':['doctor_id','establishment_id'],'establishment_specialties':['establishment_id','specialty_id'],'establishment_health_plans':['establishment_id','health_plan_id'],'favorites':['doctor_id','establishment_id']}
for name,cols in refs.items():
    for col in cols: out.append(f'create index {name}_{col}_idx on public.{name}(user_id, {col});\n')
for name in tables:
    out.append(f'''alter table public.{name} enable row level security;
alter table public.{name} force row level security;
revoke all on public.{name} from public, anon, authenticated;
grant select, insert, update, delete on public.{name} to authenticated;
create policy owner_select on public.{name} for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_insert on public.{name} for insert to authenticated with check ((select auth.uid()) = user_id);
create policy owner_update on public.{name} for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_delete on public.{name} for delete to authenticated using ((select auth.uid()) = user_id);
create trigger audit_fields before insert or update on public.{name} for each row execute function public.set_audit_fields();\n''')
out.append('commit;\n')
# CLI creates the versioned filename; this script only fills the generated file.
files=list(Path('supabase/migrations').glob('*_foundation.sql'))
if len(files)!=1: raise SystemExit('Generate the migration with Supabase CLI first.')
files[0].write_text('\n'.join(out),encoding='utf-8')
print('Prepared', files[0], 'with',len(tables),'tables. No remote changes.')
