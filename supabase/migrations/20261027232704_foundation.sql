-- Foundation: pending review and explicit authorization before remote application.
begin;

create function public.set_audit_fields() returns trigger language plpgsql security invoker set search_path = '' as $$ begin if TG_OP = 'UPDATE' then NEW.created_at := OLD.created_at; NEW.user_id := OLD.user_id; end if; NEW.updated_at := now(); return NEW; end $$;
revoke all on function public.set_audit_fields() from public, anon;

create table public.establishments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 200), kind text not null check (kind in ('clinic','hospital','laboratory','office','other')), notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, id)
 
);

create index establishments_search_idx on public.establishments using gin (to_tsvector('portuguese', name));
create index establishments_user_name_idx on public.establishments(user_id, lower(name));

create table public.doctors (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 200), professional_council text, registration_number text, registration_state text, notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, id)
 
);

create index doctors_search_idx on public.doctors using gin (to_tsvector('portuguese', name));
create index doctors_user_name_idx on public.doctors(user_id, lower(name));

create table public.specialties (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 200), description text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, id)
 
);

create index specialties_search_idx on public.specialties using gin (to_tsvector('portuguese', name));
create index specialties_user_name_idx on public.specialties(user_id, lower(name));

create table public.health_plans (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 200), notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, id)
 
);

create index health_plans_search_idx on public.health_plans using gin (to_tsvector('portuguese', name));
create index health_plans_user_name_idx on public.health_plans(user_id, lower(name));

create unique index specialties_name_unique on public.specialties(user_id, lower(trim(name)));

create unique index health_plans_name_unique on public.health_plans(user_id, lower(trim(name)));

create table public.addresses (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 establishment_id uuid not null, label text, street text not null check (length(trim(street)) > 0), number text, complement text, neighborhood text, city text not null check (length(trim(city)) > 0), state text not null check (state ~ '^[A-Z]{2}$'), postal_code text check (postal_code ~ '^[0-9]{8}$'), country_code text not null default 'BR' check (country_code ~ '^[A-Z]{2}$'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, id),
 foreign key (user_id, establishment_id) references public.establishments(user_id, id) on delete cascade
);

create table public.contacts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 doctor_id uuid, establishment_id uuid, kind text not null check (kind in ('phone','whatsapp','email','website','other')), label text, value text not null check (length(trim(value)) > 0), is_primary boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, id),
 check (num_nonnulls(doctor_id, establishment_id) = 1),
foreign key (user_id, doctor_id) references public.doctors(user_id, id) on delete cascade,
foreign key (user_id, establishment_id) references public.establishments(user_id, id) on delete cascade
);

create table public.doctor_specialties (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 doctor_id uuid not null, specialty_id uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, id),
 foreign key (user_id, doctor_id) references public.doctors(user_id, id) on delete cascade,
foreign key (user_id, specialty_id) references public.specialties(user_id, id) on delete cascade,
unique(user_id, doctor_id, specialty_id)
);

create table public.doctor_establishments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 doctor_id uuid not null, establishment_id uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, id),
 foreign key (user_id, doctor_id) references public.doctors(user_id, id) on delete cascade,
foreign key (user_id, establishment_id) references public.establishments(user_id, id) on delete cascade,
unique(user_id, doctor_id, establishment_id)
);

create table public.establishment_specialties (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 establishment_id uuid not null, specialty_id uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, id),
 foreign key (user_id, establishment_id) references public.establishments(user_id, id) on delete cascade,
foreign key (user_id, specialty_id) references public.specialties(user_id, id) on delete cascade,
unique(user_id, establishment_id, specialty_id)
);

create table public.establishment_health_plans (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 establishment_id uuid not null, health_plan_id uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, id),
 foreign key (user_id, establishment_id) references public.establishments(user_id, id) on delete cascade,
foreign key (user_id, health_plan_id) references public.health_plans(user_id, id) on delete cascade,
unique(user_id, establishment_id, health_plan_id)
);

create table public.favorites (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 doctor_id uuid, establishment_id uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id, id),
 check (num_nonnulls(doctor_id, establishment_id) = 1),
foreign key (user_id, doctor_id) references public.doctors(user_id, id) on delete cascade,
foreign key (user_id, establishment_id) references public.establishments(user_id, id) on delete cascade
);

create unique index favorites_doctor_unique on public.favorites(user_id, doctor_id) where doctor_id is not null;
create unique index favorites_establishment_unique on public.favorites(user_id, establishment_id) where establishment_id is not null;

create index addresses_establishment_id_idx on public.addresses(user_id, establishment_id);

create index contacts_doctor_id_idx on public.contacts(user_id, doctor_id);

create index contacts_establishment_id_idx on public.contacts(user_id, establishment_id);

create index doctor_specialties_doctor_id_idx on public.doctor_specialties(user_id, doctor_id);

create index doctor_specialties_specialty_id_idx on public.doctor_specialties(user_id, specialty_id);

create index doctor_establishments_doctor_id_idx on public.doctor_establishments(user_id, doctor_id);

create index doctor_establishments_establishment_id_idx on public.doctor_establishments(user_id, establishment_id);

create index establishment_specialties_establishment_id_idx on public.establishment_specialties(user_id, establishment_id);

create index establishment_specialties_specialty_id_idx on public.establishment_specialties(user_id, specialty_id);

create index establishment_health_plans_establishment_id_idx on public.establishment_health_plans(user_id, establishment_id);

create index establishment_health_plans_health_plan_id_idx on public.establishment_health_plans(user_id, health_plan_id);

create index favorites_doctor_id_idx on public.favorites(user_id, doctor_id);

create index favorites_establishment_id_idx on public.favorites(user_id, establishment_id);

alter table public.establishments enable row level security;
alter table public.establishments force row level security;
revoke all on public.establishments from public, anon, authenticated;
grant select, insert, update, delete on public.establishments to authenticated;
create policy owner_select on public.establishments for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_insert on public.establishments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy owner_update on public.establishments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_delete on public.establishments for delete to authenticated using ((select auth.uid()) = user_id);
create trigger audit_fields before insert or update on public.establishments for each row execute function public.set_audit_fields();

alter table public.doctors enable row level security;
alter table public.doctors force row level security;
revoke all on public.doctors from public, anon, authenticated;
grant select, insert, update, delete on public.doctors to authenticated;
create policy owner_select on public.doctors for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_insert on public.doctors for insert to authenticated with check ((select auth.uid()) = user_id);
create policy owner_update on public.doctors for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_delete on public.doctors for delete to authenticated using ((select auth.uid()) = user_id);
create trigger audit_fields before insert or update on public.doctors for each row execute function public.set_audit_fields();

alter table public.specialties enable row level security;
alter table public.specialties force row level security;
revoke all on public.specialties from public, anon, authenticated;
grant select, insert, update, delete on public.specialties to authenticated;
create policy owner_select on public.specialties for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_insert on public.specialties for insert to authenticated with check ((select auth.uid()) = user_id);
create policy owner_update on public.specialties for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_delete on public.specialties for delete to authenticated using ((select auth.uid()) = user_id);
create trigger audit_fields before insert or update on public.specialties for each row execute function public.set_audit_fields();

alter table public.health_plans enable row level security;
alter table public.health_plans force row level security;
revoke all on public.health_plans from public, anon, authenticated;
grant select, insert, update, delete on public.health_plans to authenticated;
create policy owner_select on public.health_plans for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_insert on public.health_plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy owner_update on public.health_plans for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_delete on public.health_plans for delete to authenticated using ((select auth.uid()) = user_id);
create trigger audit_fields before insert or update on public.health_plans for each row execute function public.set_audit_fields();

alter table public.addresses enable row level security;
alter table public.addresses force row level security;
revoke all on public.addresses from public, anon, authenticated;
grant select, insert, update, delete on public.addresses to authenticated;
create policy owner_select on public.addresses for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_insert on public.addresses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy owner_update on public.addresses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_delete on public.addresses for delete to authenticated using ((select auth.uid()) = user_id);
create trigger audit_fields before insert or update on public.addresses for each row execute function public.set_audit_fields();

alter table public.contacts enable row level security;
alter table public.contacts force row level security;
revoke all on public.contacts from public, anon, authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
create policy owner_select on public.contacts for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_insert on public.contacts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy owner_update on public.contacts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_delete on public.contacts for delete to authenticated using ((select auth.uid()) = user_id);
create trigger audit_fields before insert or update on public.contacts for each row execute function public.set_audit_fields();

alter table public.doctor_specialties enable row level security;
alter table public.doctor_specialties force row level security;
revoke all on public.doctor_specialties from public, anon, authenticated;
grant select, insert, update, delete on public.doctor_specialties to authenticated;
create policy owner_select on public.doctor_specialties for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_insert on public.doctor_specialties for insert to authenticated with check ((select auth.uid()) = user_id);
create policy owner_update on public.doctor_specialties for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_delete on public.doctor_specialties for delete to authenticated using ((select auth.uid()) = user_id);
create trigger audit_fields before insert or update on public.doctor_specialties for each row execute function public.set_audit_fields();

alter table public.doctor_establishments enable row level security;
alter table public.doctor_establishments force row level security;
revoke all on public.doctor_establishments from public, anon, authenticated;
grant select, insert, update, delete on public.doctor_establishments to authenticated;
create policy owner_select on public.doctor_establishments for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_insert on public.doctor_establishments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy owner_update on public.doctor_establishments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_delete on public.doctor_establishments for delete to authenticated using ((select auth.uid()) = user_id);
create trigger audit_fields before insert or update on public.doctor_establishments for each row execute function public.set_audit_fields();

alter table public.establishment_specialties enable row level security;
alter table public.establishment_specialties force row level security;
revoke all on public.establishment_specialties from public, anon, authenticated;
grant select, insert, update, delete on public.establishment_specialties to authenticated;
create policy owner_select on public.establishment_specialties for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_insert on public.establishment_specialties for insert to authenticated with check ((select auth.uid()) = user_id);
create policy owner_update on public.establishment_specialties for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_delete on public.establishment_specialties for delete to authenticated using ((select auth.uid()) = user_id);
create trigger audit_fields before insert or update on public.establishment_specialties for each row execute function public.set_audit_fields();

alter table public.establishment_health_plans enable row level security;
alter table public.establishment_health_plans force row level security;
revoke all on public.establishment_health_plans from public, anon, authenticated;
grant select, insert, update, delete on public.establishment_health_plans to authenticated;
create policy owner_select on public.establishment_health_plans for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_insert on public.establishment_health_plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy owner_update on public.establishment_health_plans for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_delete on public.establishment_health_plans for delete to authenticated using ((select auth.uid()) = user_id);
create trigger audit_fields before insert or update on public.establishment_health_plans for each row execute function public.set_audit_fields();

alter table public.favorites enable row level security;
alter table public.favorites force row level security;
revoke all on public.favorites from public, anon, authenticated;
grant select, insert, update, delete on public.favorites to authenticated;
create policy owner_select on public.favorites for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_insert on public.favorites for insert to authenticated with check ((select auth.uid()) = user_id);
create policy owner_update on public.favorites for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_delete on public.favorites for delete to authenticated using ((select auth.uid()) = user_id);
create trigger audit_fields before insert or update on public.favorites for each row execute function public.set_audit_fields();

commit;
