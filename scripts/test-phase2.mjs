import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite()
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`)
for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'))
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222'
async function user(id){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`)}
async function save(type,data,id=null){return (await db.query('select public.save_network_entity($1,$2,$3::jsonb) id',[type,id,JSON.stringify(data)])).rows[0].id}
async function doc(type,id){return (await db.query('select public.network_document($1,$2) d',[type,id])).rows[0].d}
async function search(filters={},page=1,size=12){return (await db.query('select public.search_network($1::jsonb,$2,$3) d',[JSON.stringify(filters),page,size])).rows[0].d}
await user(a)
const spec=await save('specialties',{name:'Cardiologia',description:'Coração'})
const secondSpec=await save('specialties',{name:'Clínica médica'})
const plan=await save('health_plans',{name:'Convênio Saúde'})
const doctor=await save('doctors',{name:'Dra. Lúcia',registration_number:'12345',registration_state:'SP',contacts:[{kind:'mobile',value:'11999999999',is_primary:true}],specialties:[{id:spec},{id:secondSpec}],health_plans:[{id:plan,link_notes:'Rede A'}],favorite:true})
const payload={name:'Clínica São José',kind:'clinic',active:true,trade_name:'São José',website:'https://example.invalid',description:'Atendimento',notes:'Controlado',favorite:true,
 contacts:[{kind:'phone',label:'Recepção',value:'1133333333',is_primary:true},{kind:'phone',label:'Exames',value:'1144444444'},{kind:'whatsapp',value:'11988888888'}],
 addresses:[{postal_code:'01310-100',street:'Avenida Paulista',number:'100',neighborhood:'Bela Vista',city:'São Paulo',state:'SP',reference:'Metrô',is_primary:true}],
 specialties:[{id:spec},{id:secondSpec}],doctors:[{id:doctor,link_notes:'Terças pela manhã'}],health_plans:[{id:plan,link_notes:'Confirmar cobertura'}]}
const place=await save('establishments',payload)
let d=await doc('establishments',place)
assert.equal(d.contacts.length,3);assert.equal(d.addresses[0].postal_code,'01310100');assert.equal(d.specialties.length,2)
assert.equal(d.doctors[0].id,doctor);assert.equal(d.doctors[0].link_notes,'Terças pela manhã');assert.equal(d.health_plans[0].link_notes,'Confirmar cobertura')
assert.equal(d.favorite,true)
for(const filters of [{q:'cardiologia'},{q:'LUCIA'},{q:'sao paulo'},{q:'bela vista'},{q:'convenio saude'},{city:'SÃO PAULO'},{specialty:spec},{doctor},{plan},{kind:'clinic',city:'sao',favorites:'true',active:'true'}]){
 const result=await search(filters);assert(result.items.some(e=>e.data.id===place),`Search ${JSON.stringify(filters)} should include establishment`)
}
assert((await search({q:'LUCIA'})).items.some(e=>e.data.id===doctor))
assert.equal((await search({city:'Curitiba'})).total,0)
await save('establishments',{...d,name:'Hospital atualizado',kind:'hospital',favorite:false},place)
d=await doc('establishments',place);assert.equal(d.name,'Hospital atualizado');assert.equal(d.favorite,false);assert.equal(d.contacts.length,3)
await assert.rejects(save('establishments',{...d,updated_at:'2000-01-01T00:00:00Z'},place),e=>e.message.includes('outra sessão'))
// All inserts, including quick-created shared entities, roll back if a child fails.
const before=(await search()).total
await assert.rejects(save('establishments',{...payload,name:'Rollback',contacts:[{kind:'email',value:''}],specialties:[{name:'Rollback specialty'}]}))
assert.equal((await search()).total,before)
assert.equal((await search({q:'Rollback'})).total,0)
const badDoctor={name:'Rollback doctor',specialties:[{name:'Rollback specialty'}],contacts:[{kind:'bad',value:'1'}]}
await assert.rejects(save('establishments',{name:'Rollback nested',kind:'clinic',doctors:[badDoctor]}))
assert.equal((await search({q:'Rollback'})).total,0)
// Same existing selection or quick creation reuses the entities; duplicated links are harmless.
const other=await save('establishments',{...payload,name:'Outra clínica',specialties:[{name:'CARDIOLOGIA'},{id:spec}],doctors:[{id:doctor},{id:doctor}]})
assert.equal((await doc('establishments',other)).specialties.length,1)
assert.equal((await doc('establishments',other)).doctors.length,1)
assert.equal((await db.query('select count(*)::int n from public.doctors')).rows[0].n,1)
await save('specialties',{name:'Cardiologia editada',description:'Atualizada'},spec)
assert.equal((await doc('specialties',spec)).name,'Cardiologia editada')
await assert.rejects(save('specialties',{name:'cardiologia EDITADA'}),e=>e.code==='23505')
await save('health_plans',{name:'Convênio editado',notes:'Atualizado'},plan)
assert.equal((await doc('health_plans',plan)).notes,'Atualizado')
let editedDoctor=await doc('doctors',doctor)
await save('doctors',{...editedDoctor,name:'Dra. Lúcia atualizada',contacts:[{kind:'email',value:'test@example.invalid'}],favorite:false},doctor)
editedDoctor=await doc('doctors',doctor)
assert.equal(editedDoctor.name,'Dra. Lúcia atualizada');assert.equal(editedDoctor.contacts.length,1);assert.equal(editedDoctor.contacts[0].kind,'email');assert.equal(editedDoctor.establishments.length,2)
const editedPlace=await doc('establishments',other)
await save('establishments',{...editedPlace,contacts:[],addresses:[]},other)
assert.equal((await doc('establishments',other)).contacts.length,0);assert.equal((await doc('establishments',other)).addresses.length,0)
for(let i=0;i<14;i++)await save('specialties',{name:`Paginação ${String(i).padStart(2,'0')}`})
const page1=await search({category:'specialties',sort:'name'},1,5),page2=await search({category:'specialties',sort:'name'},2,5)
assert.equal(page1.items.length,5);assert.equal(page2.items.length,5);assert(!page1.items.some(x=>page2.items.some(y=>x.data.id===y.data.id)))
const tables=(await db.query("select tablename from pg_tables where schemaname='public'")).rows.map(r=>r.tablename)
assert.equal(tables.length,12)
for(const table of tables){const row=(await db.query('select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass',[`public.${table}`])).rows[0];assert(row.relrowsecurity&&row.relforcerowsecurity)}
assert.equal((await db.query("select count(*)::int n from pg_policies where schemaname='public'")).rows[0].n,48)
await user(b)
assert.equal((await search()).total,0);assert.equal(await doc('establishments',place),null)
await assert.rejects(save('establishments',payload,place),e=>e.code==='42501')
await assert.rejects(save('establishments',{name:'Cross tenant',kind:'clinic',specialties:[{id:spec}]}),e=>e.code==='23503')
assert.equal((await search()).total,0)
await db.query('update public.establishments set name=$1 where id=$2',['Intrusão',place])
await db.query('delete from public.establishments where id=$1',[place])
await user(a)
assert.equal((await doc('establishments',place)).name,'Hospital atualizado')
await db.query('delete from public.establishments where id=$1',[place])
assert.equal(await doc('establishments',place),null)
assert.equal((await doc('doctors',doctor)).establishments.length,1)
assert(await doc('specialties',spec));assert(await doc('health_plans',plan))
assert.equal((await doc('establishments',other)).doctors[0].id,doctor)
await db.query('delete from public.specialties where id=$1',[spec])
assert(await doc('doctors',doctor));assert(await doc('establishments',other))
await db.query('delete from public.health_plans where id=$1',[plan]);assert(await doc('doctors',doctor))
await db.query('delete from public.doctors where id=$1',[doctor]);assert(await doc('establishments',other))
await db.exec('reset role;set role anon')
for(const sql of ['select public.search_network()','select public.network_summary()',`select public.network_document('establishments','${other}')`,`select public.save_network_entity('specialties',null,'{"name":"Blocked"}')`])await assert.rejects(db.exec(sql),e=>e.code==='42501')
await user('');assert.equal((await search()).total,0);await assert.rejects(save('specialties',{name:'Missing session'}),e=>e.code==='42501')
await db.close()
console.log('PASS phase 2: additive migrations; 12 tables / 48 RLS policies; transactional CRUD and rollback; two phones + WhatsApp; addresses; multiple specialties; doctors and plans; related/accent-insensitive search; combined filters; pagination; stale update protection; favorites; deletion preserves shared entities; isolation across two users; anonymous and session protection.')
