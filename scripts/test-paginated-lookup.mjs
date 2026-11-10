import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const db=new PGlite(),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',blocked='33333333-3333-4333-8333-333333333333'
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;insert into auth.users(id) values('${a}'),('${b}'),('${blocked}');`)
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+f,'utf8'))
 await db.exec(`update public.profiles set status='active',role=case when id='${a}' then 'admin' else 'viewer' end where id<>'${blocked}';
 insert into public.doctors(user_id,name,active) select case when n%2=0 then '${a}'::uuid else '${b}'::uuid end,'Profissional '||lpad(n::text,5,'0'),n%10<>0 from generate_series(1,1053)n;
 insert into public.doctors(user_id,name) values('${a}','Último médico da lista');
 insert into public.establishments(user_id,name,kind,active) select '${b}','Clínica '||lpad(n::text,5,'0'),'clinic',n%10<>0 from generate_series(1,1053)n;
 insert into public.health_plans(user_id,name) select '${b}','Convênio '||lpad(n::text,3,'0') from generate_series(1,47)n;`)
 const user=async id=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`)
 const page=async(category,q='',cursor=null,size=20)=>(await db.query('select public.network_lookup_page($1,$2,$3,$4,$5) result',[category,q,cursor?.name??null,cursor?.id??null,size])).rows[0].result
 await user(a)
 const started=performance.now()
 for(const [category,total]of [['doctors',1054],['establishments',1053],['health_plans',47]]){
  let result=await page(category),ids=[],pages=0
  assert.equal(result.items.length,20);assert.equal(result.total,total)
  while(true){pages++;ids.push(...result.items.map(i=>i.id));assert.equal(result.total,total);if(!result.has_more){assert.equal(result.next_cursor,null);break}assert(result.next_cursor);result=await page(category,'',result.next_cursor)}
  assert.equal(ids.length,total);assert.equal(new Set(ids).size,total)
  const expected=(await db.query(`select id from public.${category} order by public.network_normalize(name),id`)).rows.map(r=>r.id)
  assert.deepEqual(ids,expected);console.log(`PASS ${category}: ${total} records across ${pages} cursor pages; exact order, no gaps or duplicates.`)
 }
 assert.equal((await page('doctors','ULTIMO MEDICO')).items[0].name,'Último médico da lista')
 assert.equal((await page('establishments','CLINICA 01053')).total,1)
 assert.equal((await page('establishments','CLINICA 01000')).total,1) // Inactive but authorized.
 assert.equal((await page('doctors','zzzz-no-results')).total,0)
 assert.equal((await page('doctors','',null,999999)).items.length,50)
 await assert.rejects(page('doctors; drop table public.doctors'),e=>e.code==='22023')
 await assert.rejects(db.query("select public.network_lookup_page('doctors','',null,$1)",[crypto.randomUUID()]),e=>e.code==='22023')
 await user(b);assert.equal((await page('doctors')).total,1054);assert.equal((await page('establishments')).total,1053)
 await user(blocked);await assert.rejects(page('doctors'),e=>e.code==='42501')
 await user('');await assert.rejects(page('doctors'),e=>e.code==='42501')
 await db.exec('reset role;set role anon');await assert.rejects(page('doctors'),e=>e.code==='42501')
 console.log(`PASS search, inactive/shared records, viewer/admin parity, blocked/anonymous denial, cursor validation and bounded pages (${Math.round(performance.now()-started)} ms).`)
}catch(e){console.error(JSON.stringify({message:e.message,code:e.code,position:e.position}));process.exitCode=1}finally{await db.close()}
