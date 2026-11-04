import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
const admin = '11111111-1111-4111-8111-111111111111'
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
insert into auth.users values('${admin}','admin@example.invalid');`)
for (const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8'))
await db.exec(`update public.profiles set role='admin',status='active' where id='${admin}'`)
const directory = 'data/unicasf-review/transport'
for (const f of readdirSync(directory).filter(f=>/^chunk-\d+\.sql$/.test(f)).sort()) await db.exec(readFileSync(`${directory}/${f}`,'utf8'))
const result = await db.exec(readFileSync(`${directory}/preview.sql`,'utf8'))
const preview = result.flatMap(r=>r.rows).find(r=>r.preview_result)?.preview_result
assert.equal(preview.new,1450);assert.equal(preview.review,17);assert.equal(preview.existing,0)
const counts = (await db.query('select (select count(*) from public.establishments)::int establishments,(select count(*) from public.doctors)::int doctors,(select count(*) from public.network_import_runs)::int runs')).rows[0]
assert.deepEqual(counts,{establishments:0,doctors:0,runs:0})
await db.exec('set role authenticated')
await assert.rejects(db.query('select data from private.network_import_chunks'),e=>e.code==='42501')
await db.exec('reset role')
await db.exec("update private.network_import_chunks set data='X'||substring(data from 2) where chunk_index=0")
await assert.rejects(db.exec(readFileSync(`${directory}/preview.sql`,'utf8')),/Payload checksum mismatch/)
await db.exec('rollback')
console.log('PASS private chunk transport: exact reconstruction; READ ONLY preview; 1450 new / 17 review; no catalogue/audit writes; authenticated access denied; corrupted upload rejected.')
await db.close()
