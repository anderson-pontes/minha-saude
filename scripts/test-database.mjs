import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
await db.exec(`create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');`)
const migration = readdirSync('supabase/migrations').find(f => f.endsWith('_foundation.sql'))
await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'))
const tables = (await db.query(`select tablename from pg_tables where schemaname='public'`)).rows.map(r => r.tablename)
assert.equal(tables.length, 11)
for (const table of tables) {
  const security = (await db.query(`select relrowsecurity, relforcerowsecurity from pg_class where oid=$1::regclass`, [`public.${table}`])).rows[0]
  assert.equal(security.relrowsecurity, true); assert.equal(security.relforcerowsecurity, true)
  assert.equal((await db.query(`select count(*)::int n from pg_policies where schemaname='public' and tablename=$1`, [table])).rows[0].n, 4)
}
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222'
async function user(id) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`) }
async function rejects(sql, code) { await assert.rejects(db.exec(sql), e => e.code === code) }
await user(a)
await db.exec(`insert into public.establishments(id,name,kind) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A','clinic');
insert into public.doctors(id,name) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Doutor A');`)
await rejects(`insert into public.specialties(name,user_id) values ('spoof','${b}')`, '42501')
await db.exec(`insert into public.contacts(doctor_id,kind,value) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','phone','123');`)
await rejects(`insert into public.contacts(kind,value) values ('phone','123')`, '23514')
await user(b)
for (const table of tables) assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0)
await db.exec(`insert into public.doctors(id,name) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Doutor B')`)
await rejects(`insert into public.doctor_establishments(doctor_id,establishment_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')`, '23503')
await db.exec(`update public.doctors set name='intrusion' where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; delete from public.establishments;`)
await user(a)
assert.equal((await db.query('select name from public.doctors')).rows[0].name, 'Doutor A')
assert.equal((await db.query('select count(*)::int n from public.establishments')).rows[0].n, 1)
await db.exec(`update public.doctors set name='Atualizado' where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'`)
assert.equal((await db.query('select name from public.doctors')).rows[0].name, 'Atualizado')
await db.exec(`delete from public.doctors where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'`)
assert.equal((await db.query('select count(*)::int n from public.contacts')).rows[0].n, 0)
await db.exec(`reset role; set role anon;`)
for (const table of tables) await rejects(`select * from public.${table}`, '42501')
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','',false);`)
assert.equal((await db.query('select * from public.establishments')).rows.length, 0)
await rejects(`insert into public.specialties(name,user_id) values ('no session','${a}')`, '42501')
await db.close()
console.log('PASS: migration runs; 11 tables, 44 policies, ownership, cross-user FK, CRUD, cascade, anonymous and missing-session protection.')
