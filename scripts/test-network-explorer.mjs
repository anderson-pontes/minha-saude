import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync} from 'node:fs'
import assert from 'node:assert/strict'
import {seedExplorer} from './network-explorer-fixture.mjs'
const db=new PGlite()
const admin='11111111-1111-4111-8111-111111111111',viewer='22222222-2222-4222-8222-222222222222'
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
insert into auth.users values('${admin}'),('${viewer}');`)
for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8'))
await db.exec(`update public.profiles set status='active',role=case when id='${admin}' then 'admin' else 'viewer' end;set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false)`)
const fixture=await seedExplorer(db)
const rpc=async(name,args,signature)=>(await db.query(`select public.${name}(${signature}) result`,args)).rows[0].result
const browse=(filters={},page=1,size=12)=>rpc('browse_network',[JSON.stringify(filters),page,size],'$1::jsonb,$2,$3')
const network=(category,filters={},page=1)=>rpc('health_plan_network',[fixture.plan,category,JSON.stringify(filters),page,12],'$1,$2,$3::jsonb,$4,$5')
const overview=await rpc('health_plan_overview',[fixture.plan],'$1')
assert.equal(overview.establishments_count,35);assert.equal(overview.doctors_count,35);assert.equal(overview.specialties_count,1);assert.equal(overview.cities_count,2)
assert.equal(overview.plan_registration,'47971/018-8');assert.match(overview.operator_name,/Caixa de Assistência/)
assert(!('establishments' in overview));assert(!('doctors' in overview))
assert.deepEqual((await browse({category:'health_plans'})).items[0].data,overview)
const first=await network('establishments',{sort:'name'}),second=await network('establishments',{sort:'name'},2)
assert.equal(first.total,35);assert.equal(first.items.length,12);assert.equal(second.items.length,12)
assert(!second.items.some(i=>first.items.some(j=>j.data.id===i.data.id)))
assert.equal(first.items[0].data.name,'Clínica 01');assert.equal((await network('establishments',{sort:'name_desc'})).items[0].data.name,'Clínica 35')
assert.equal((await network('establishments',{city:'belem',kind:'hospital'})).total,0)
assert.equal((await network('establishments',{city:'belem',kind:'clinic'})).total,18)
assert.equal((await network('doctors',{specialty:fixture.otherSpecialty})).total,0)
assert.equal((await network('doctors',{city:'sao paulo'})).total,0)
for(const q of ['Dermatologia','particular','sao paulo'])assert.equal((await network('doctors',{q})).total,0)
const doc=(await network('doctors',{doctor:fixture.doctors[0]})).items[0].data
assert.equal(doc.addresses[0].city,'Bel\u00e9m');assert.equal(doc.health_plans_count,1);assert.equal(doc.establishments_count,1);assert.equal(doc.specialties_count,1);assert.equal(doc.establishments[0].id,fixture.establishments[0]);assert.equal(doc.specialties[0].id,fixture.specialty)
assert.equal((await network('doctors',{doctor:fixture.unaccredited})).total,0)
assert.equal((await browse({category:'doctors',city:'sao paulo'})).total,1)
const lookup=await rpc('network_lookup',['doctors','',fixture.doctors[34],true],'$1,$2,$3,$4')
assert.equal(lookup.items.length,20);assert.equal(lookup.selected.id,fixture.doctors[34])
const places=await rpc('network_locations',['city','PA','','',fixture.plan],'$1,$2,$3,$4,$5');assert.equal(places.length,2)
assert.equal((await browse({},1,10000)).items.length,50)
await db.query("insert into public.contacts(establishment_id,kind,value) values($1,'whatsapp','+55 (91) 98844-9970'),($1,'email','recepcao@example.invalid')",[fixture.establishments[0]])
for(const q of ['91988449970','(91) 98844-9970','recepcao@example.invalid'])assert.equal((await browse({category:'establishments',q})).total,1)
await db.query("update public.establishments set website='https://fixture.invalid',cnpj='12345678000199' where id=$1",[fixture.establishments[0]])
for(const q of ['fixture.invalid','12345678000199'])assert.equal((await browse({category:'establishments',q})).total,1)

await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${viewer}',false)`)
assert.equal((await network('doctors')).total,35)
assert.equal((await db.query('delete from public.health_plans where id=$1 returning id',[fixture.plan])).rows.length,0)
await db.exec(`reset role;update public.profiles set status='blocked' where id='${viewer}';set role authenticated`)
await assert.rejects(network('doctors'),e=>e.code==='42501')
await assert.rejects(rpc('network_lookup',['doctors'],'$1'),e=>e.code==='42501')
assert.equal(await rpc('health_plan_overview',[fixture.plan],'$1'),null)
await db.exec('reset role;set role anon');await assert.rejects(browse(),e=>e.code==='42501')
await db.close()
console.log('PASS explorer SQL: exact distinct counts, lightweight plan, bounded pages, stable sorting, combined filters, no inferred plan acceptance, location/specialty scope, remote lookups, viewer/blocked/anonymous access.')
