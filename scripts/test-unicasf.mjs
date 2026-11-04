import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const db = new PGlite()
const admin = '11111111-1111-4111-8111-111111111111', viewer = '22222222-2222-4222-8222-222222222222', blocked = '33333333-3333-4333-8333-333333333333'
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
insert into auth.users values('${admin}','admin@example.invalid'),('${viewer}','viewer@example.invalid'),('${blocked}','blocked@example.invalid');`)
for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
await db.exec(`update public.profiles set role='admin',status='active' where id='${admin}'; update public.profiles set status='active' where id='${viewer}'`)
async function user(id) { await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`) }
async function rpc(name, args, signature) { return (await db.query(`select public.${name}(${signature}) result`, args)).rows[0].result }
const preview = bundle => rpc('preview_network_import', [JSON.stringify(bundle)], '$1::jsonb')
const execute = (bundle, digest, strict = true) => rpc('execute_network_import', [JSON.stringify(bundle), digest, strict], '$1::jsonb,$2,$3')
const document = (type, id) => rpc('network_document', [type, id], '$1,$2')
const search = filters => rpc('search_network', [JSON.stringify(filters)], '$1::jsonb')
const counts = async () => (await db.query(`select (select count(*) from public.establishments)::int establishments,(select count(*) from public.doctors)::int doctors,(select count(*) from public.contacts)::int contacts,(select count(*) from public.addresses)::int addresses,(select count(*) from public.network_import_runs)::int runs`)).rows[0]
await user(admin)
const bytes = readFileSync('data/unicasf-review/import.json'), bundle = JSON.parse(bytes)
const digest = createHash('sha256').update(bytes).digest('hex')
// Existing manual fields, contacts and unrelated links must survive the import.
const bianca = await rpc('save_network_entity', ['doctors', null, JSON.stringify({ name: 'Bianca Paiva Pantoja', professional_council: 'CRM', registration_state: 'PA', registration_number: '10096', notes: 'Anotação manual importante', contacts: [{kind:'email',value:'manual@example.invalid'}], specialties: [{name:'Especialidade manual'}] })], '$1,$2,$3::jsonb')
const before = await counts()
await db.exec('begin read only')
const plan = await preview(bundle)
console.log('PASS READ ONLY preview:', plan.new, 'new;', plan.existing, 'existing;', plan.review, 'review')
await db.exec('commit')
assert.deepEqual(await counts(), before, 'Preview must run inside READ ONLY without writes')
assert.equal(plan.entities.find(e => e.key === 'doctors:CRM:PA:10096').id, bianca)
await assert.rejects(execute(bundle, digest), /Import blocked/)
assert.deepEqual(await counts(), before)
// Force a child failure AFTER entities/links have been inserted; the entire RPC rolls back.
const bad = structuredClone(bundle)
bad.links.push({table:'unsupported',left:'doctors:CRM:PA:10096',right:'health_plans:unicasf'})
await assert.rejects(execute(bad, 'b'.repeat(64), false), /Unsupported link/)
console.log('PASS full-batch transaction rollback')
assert.deepEqual(await counts(), before)
const result = await execute(bundle, digest, false)
console.log('PASS full-batch import:', result.inserted, 'inserted;', result.links_created, 'links')
const after = await counts()
assert(after.establishments > 190 && after.doctors > 1100)
assert.equal(result.skipped, plan.review)
assert.equal((await execute(bundle, digest, false)).already_imported, true)
assert.deepEqual(await counts(), after)
// Different artifact hash: strong entity resolution still avoids repeated entities/collections/links.
const again = await execute(bundle, 'c'.repeat(64), false)
console.log('PASS full-batch reimport')
assert.equal(again.inserted, 0); assert.equal(again.links_created, 0); assert.equal(again.contacts_created, 0); assert.equal(again.addresses_created, 0)
assert(Object.values(again.category_counts).every(c => c.enriched === 0), 'Unchanged entities must not be rewritten')
assert.deepEqual({...await counts(),runs:after.runs}, after)
const biancaDoc = await document('doctors', bianca)
assert.equal(biancaDoc.notes, 'Anotação manual importante')
assert(biancaDoc.contacts.some(c => c.value === 'manual@example.invalid'))
assert(biancaDoc.specialties.some(s => s.name === 'Especialidade manual'))
assert(biancaDoc.addresses.length > 0)
const clinic = biancaDoc.establishments.find(e => e.trade_name === 'CLINICASF')
assert(clinic)
assert(clinic.health_plans.some(h => h.name === 'UNICASF Saúde'))
assert(clinic.specialties.some(s => s.name === 'Geriatria'))
// Editing with the existing UI service must preserve scoped coverage and historical identity.
await rpc('save_network_entity', ['doctors', bianca, JSON.stringify(biancaDoc)], '$1,$2,$3::jsonb')
assert.equal((await document('doctors', bianca)).establishments.find(e => e.id === clinic.id).health_plans.length, clinic.health_plans.length)
const originalClinic = await document('establishments', clinic.id)
await rpc('save_network_entity', ['establishments', clinic.id, JSON.stringify(originalClinic)], '$1,$2,$3::jsonb')
assert.equal((await document('establishments', clinic.id)).cnpj, originalClinic.cnpj)
assert.equal((await document('doctors', bianca)).establishments.find(e => e.id === clinic.id).health_plans.length, clinic.health_plans.length)
const planId = clinic.health_plans[0].id
assert((await search({category:'establishments',doctor:bianca})).items.some(e => e.data.id === clinic.id))
// A local service without a named specialty must not inherit specialties from other clinics.
await db.exec('begin')
const serviceClinic = await rpc('save_network_entity', ['establishments', null, JSON.stringify({name:'Serviço local controlado',kind:'clinic',doctors:[{id:bianca}]})], '$1,$2,$3::jsonb')
await db.query('insert into public.doctor_establishment_health_plans(doctor_id,establishment_id,health_plan_id) values($1,$2,$3)', [bianca,serviceClinic,planId])
assert.deepEqual((await document('establishments',serviceClinic)).doctors[0].specialties, [])
await db.query('delete from public.doctor_establishments where doctor_id=$1 and establishment_id=$2', [bianca,serviceClinic])
assert.equal((await db.query('select count(*)::int n from public.doctor_establishment_health_plans where establishment_id=$1',[serviceClinic])).rows[0].n,0)
await db.exec('rollback')
assert((await search({category:'doctors',plan:planId})).items.length)
assert((await search({category:'establishments',city:'Belem',neighborhood:'Nazare',plan:planId})).total > 0)
assert((await search({q:'BRASMEDE'})).total > 0)
const brasmedeEntity = result.entities.find(e => e.key === 'establishments:02600250000198')
const brasmedeDoc = await document('establishments', brasmedeEntity.id)
assert.equal(brasmedeDoc.doctors.length, 38)
assert(brasmedeDoc.contacts.length >= 2)
assert(brasmedeDoc.doctors.find(d => d.name.includes('Tayanne')).specialties.every(s => s.name === 'Nutrição'))
assert((await search({category:'establishments',specialty:brasmedeDoc.specialties[0].id})).total > 0)
const biancaSnapshot = await document('doctors', bianca)
await user(viewer)
assert.deepEqual(await document('doctors', bianca), biancaSnapshot, 'Shared data visible across authorized members')
await assert.rejects(execute(bundle, 'd'.repeat(64), false), e => e.code === '42501')
await assert.rejects(preview(bundle), e => e.code === '42501')
await user(blocked)
await assert.rejects(document('doctors', bianca), e => e.code === '42501')
await db.exec('reset role; set role anon')
await assert.rejects(preview(bundle), e => e.code === '42501')
await user(admin)
const localReport = { environment:'local PGlite PostgreSQL; synthetic preexisting Bianca; NOT production', content_sha256:digest,
  dry_run:{new:plan.new,existing:plan.existing,review:plan.review}, execution:{...result,entities:undefined,preview:undefined}, counts:await counts(),
  assertions:'PASS: all migrations, READ ONLY preview, strict gate, transaction rollback after inserts, strong identity reimport without rewrites, preservation of manual data and scoped links after editing, own addresses, BRASMEDE 38 doctors/local specialties, Bianca CLINICASF, plan/specialty/city/neighborhood queries, admin/viewer/blocked/anon access.' }
writeFileSync('data/unicasf-review/local-integration.json', JSON.stringify(localReport,null,2)+'\n')
console.log(JSON.stringify(localReport,null,2))
await db.close()
