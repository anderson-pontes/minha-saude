import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite()
const admin='11111111-1111-4111-8111-111111111111',viewer='22222222-2222-4222-8222-222222222222'
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
insert into auth.users values('${admin}','admin@example.invalid'),('${viewer}','viewer@example.invalid');`)
for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8'))
await db.exec(`update public.profiles set status='active',role=case when id='${admin}' then 'admin' else 'viewer' end;
insert into public.establishments(user_id,name,kind) select '${admin}', 'Fixture '||n,'clinic' from generate_series(1,1500) n;
insert into public.favorites(user_id,establishment_id) select '${admin}',id from public.establishments order by id limit 2;`)
async function user(id){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`)}
async function rpc(name,args=[],signature=''){return(await db.query(`select public.${name}(${signature}) result`,args)).rows[0].result}
const dashboard=(section,size=6)=>rpc('dashboard_network',[section,size],'$1,$2')
await user(admin)
const recent=await dashboard('recent')
assert.equal(recent.items.length,6);assert.equal(recent.total,1500)
const favorites=await dashboard('favorites',4)
assert.equal(favorites.items.length,2);assert(favorites.items.every(e=>e.data.favorite))
assert.equal((await dashboard('recent',1000)).items.length,12)
await assert.rejects(dashboard('unsupported'),e=>e.code==='22023')
const id=recent.items[0].data.id
await db.exec('reset role')
await db.query(`insert into public.contacts(user_id,establishment_id,kind,value,is_primary) values($1,$2,'phone','1133334444',true),($1,$2,'phone','1133335555',false),($1,$2,'whatsapp','11999998888',false)`,[admin,id])
await user(admin)
const card=await rpc('network_card',['establishments',id],'$1,$2')
assert.equal(card.contacts.length,2);assert(card.contacts.some(c=>c.kind==='whatsapp'));assert.equal(card.contacts[0].value,'1133334444')
assert(!('user_id' in card));assert(!('doctors' in card));assert(card.health_plans.length<=3)
await user(viewer)
assert.equal((await dashboard('recent')).total,1500);assert.equal((await dashboard('favorites')).total,0)
await db.query('insert into public.favorites(establishment_id) values($1)',[id])
assert.equal((await dashboard('favorites')).total,1)
await user(admin);assert.equal((await dashboard('favorites')).total,2)
await db.exec('reset role')
// Count expensive full-detail calls: dashboard must never use it, legacy list only per selected row.
await db.exec(`create sequence public.detail_calls;grant usage,select on sequence public.detail_calls to authenticated;
create or replace function public.network_document(p_type text,p_id uuid) returns jsonb language plpgsql volatile security invoker set search_path='' as $$begin perform nextval('public.detail_calls');return jsonb_build_object('id',p_id);end$$;`)
await user(admin)
await dashboard('recent');await dashboard('favorites')
assert.equal((await db.query('select is_called from public.detail_calls')).rows[0].is_called,false)
const legacy=await rpc('search_network',['{}',1,6],'$1::jsonb,$2,$3')
assert.equal(legacy.total,1500);assert.equal(legacy.items.length,6)
assert.equal(Number((await db.query('select last_value from public.detail_calls')).rows[0].last_value),6)
const legacyFav=await rpc('search_network',['{"favorites":"true"}',1,4],'$1::jsonb,$2,$3')
assert.equal(legacyFav.total,2);assert.equal(Number((await db.query('select last_value from public.detail_calls')).rows[0].last_value),8)
await user('');await assert.rejects(dashboard('recent'),e=>e.code==='42501')
await db.exec('reset role;set role anon');await assert.rejects(dashboard('recent'),e=>e.code==='42501')
await db.close()
console.log('PASS dashboard SQL: 1500 shared entities; limited cards; primary contact + WhatsApp; personal favorites; viewer/admin/anonymous; invalid section; no full-detail work for dashboard; legacy pagination builds exactly page-size documents.')
