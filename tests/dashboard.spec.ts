import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { test, call, login } from './fixtures/network'
import { mkdirSync, writeFileSync } from 'node:fs'

const endpoint='**/rest/v1/rpc/dashboard_network'
const sample={items:[{category:'establishments',data:{id:'99999999-9999-4999-8999-999999999999',name:'Clínica de teste',kind:'clinic',contacts:[],addresses:[],specialties:[],favorite:true}}],total:1}
function section(page:Page,name:string){return page.getByRole('region',{name,exact:true})}

test('fast independent requests; cache on navigation; safe Network metadata',async({page,db},testInfo)=>{
  await call(db,'save_network_entity',['establishments',null,JSON.stringify({name:'Clínica recente',kind:'clinic',favorite:true})],'$1,$2,$3::jsonb')
  const network:{path:string;section:unknown;status:number;durationMs:number}[]=[]
  const starts=new Map<string,number>()
  page.on('request',request=>{if(request.url().includes('/rpc/dashboard_network'))starts.set(request.postData()||'',Date.now())})
  page.on('response',response=>{if(response.url().includes('/rpc/dashboard_network')){const request=response.request();network.push({path:new URL(response.url()).pathname,section:request.postDataJSON().p_section,status:response.status(),durationMs:Date.now()-(starts.get(request.postData()||'')||Date.now())})}})
  await login(page,'/')
  await expect(section(page,'Seus favoritos').getByRole('heading',{name:'Clínica recente'})).toBeVisible()
  await expect(section(page,'Últimos cadastros').getByText('Clínica recente')).toBeVisible()
  const count=network.length
  await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Minha rede',exact:true}).click()
  await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Início',exact:true}).click()
  await expect(section(page,'Seus favoritos').getByRole('heading',{name:'Clínica recente'})).toBeVisible()
  expect(network).toHaveLength(count)
  expect(network.filter(r=>r.status===200).map(r=>r.section).sort()).toEqual(['favorites','recent'])
  await testInfo.attach('dashboard-network.json',{body:JSON.stringify(network,null,2),contentType:'application/json'})
  mkdirSync('data/dashboard-performance',{recursive:true})
  writeFileSync('data/dashboard-performance/browser-network.json',JSON.stringify({environment:'Isolated Edge; controlled Auth; real PGlite RPC behind browser HTTP routes; not a real-user production session',requests:network},null,2)+'\n')
  // The navigation/cache assertions above are the check; capture the visible dashboard.
  // Edge's full-page compositor can stall after a rapid route round-trip.
  await page.screenshot({path:'test-results/dashboard-loaded.png',animations:'disabled'})
})

test('valid empty responses are independent empty states',async({page,db})=>{
  void db;await login(page,'/')
  await expect(section(page,'Seus favoritos').getByText('Você ainda não adicionou favoritos.')).toBeVisible()
  await expect(section(page,'Últimos cadastros').getByText('Nenhum cadastro recente encontrado.')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('slow favorites keep recent data visible; notice is not an error',async({page,db})=>{
  void db;let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve})
  await page.route(endpoint,async route=>{if(route.request().postDataJSON().p_section==='favorites'){await gate;await route.fulfill({json:sample})}else await route.fulfill({json:sample})})
  await login(page,'/')
  await expect(section(page,'Últimos cadastros').getByText('Clínica de teste')).toBeVisible()
  await expect(section(page,'Seus favoritos').getByRole('status',{name:'Carregando seus favoritos'})).toBeVisible()
  await expect(section(page,'Seus favoritos').getByText('A consulta está demorando mais que o esperado.')).toBeVisible({timeout:6000})
  await expect(section(page,'Seus favoritos').getByRole('alert')).toHaveCount(0)
  await page.screenshot({path:'test-results/dashboard-slow.png',fullPage:true})
  release()
  await expect(section(page,'Seus favoritos').getByRole('heading',{name:'Clínica de teste'})).toBeVisible()
  await expect(page.getByText('A consulta está demorando mais que o esperado.')).toHaveCount(0)
})

for(const status of [500,401,403])test(`HTTP ${status}: contextual error; bounded retry; only failed section reloads`,async({page,db})=>{
  void db;let favorites=0,recent=0,healthy=false,release=()=>{};let gate:Promise<void>|null=null
  await page.route(endpoint,async route=>{
    if(route.request().postDataJSON().p_section==='recent'){recent++;return route.fulfill({json:sample})}
    favorites++
    if(gate)await gate
    return healthy?route.fulfill({json:sample}):route.fulfill({status,json:{code:status===500?'XX000':'42501',message:'Controlled failure'}})
  })
  await login(page,'/')
  const area=section(page,'Seus favoritos')
  await expect(area.getByRole('alert')).toContainText(status===500?'Não foi possível carregar seus favoritos.':'Sua sessão precisa ser verificada.')
  expect(favorites).toBe(status===500?2:1)
  await expect(section(page,'Últimos cadastros').getByText('Clínica de teste')).toBeVisible()
  const recentBefore=recent
  healthy=true;gate=new Promise<void>(resolve=>{release=resolve})
  await area.getByRole('button',{name:'Tentar novamente'}).click()
  await expect(area.getByRole('button',{name:'Atualizando…'})).toBeDisabled()
  expect(favorites).toBe(status===500?3:2)
  release()
  await expect(area.getByRole('heading',{name:'Clínica de teste'})).toBeVisible()
  await expect(area.getByRole('alert')).toHaveCount(0)
  expect(recent).toBe(recentBefore)
})

test('network failure is bounded and does not block recent records',async({page,db})=>{
  void db;let attempts=0
  await page.route(endpoint,async route=>{if(route.request().postDataJSON().p_section==='favorites'){attempts++;return route.abort('failed')}return route.fulfill({json:sample})})
  await login(page,'/')
  await expect(section(page,'Seus favoritos').getByRole('alert')).toContainText('Parece que você está sem conexão.')
  await expect(section(page,'Últimos cadastros').getByText('Clínica de teste')).toBeVisible()
  expect(attempts).toBe(2)
})

test('read deadline terminates a stuck request',async({page,db})=>{
  test.setTimeout(45000);void db
  let requests=0
  await page.route(endpoint,async route=>{if(route.request().postDataJSON().p_section==='favorites'){requests++;return}return route.fulfill({json:sample})})
  await login(page,'/')
  await expect(section(page,'Seus favoritos').getByRole('alert')).toContainText('A consulta não respondeu a tempo.',{timeout:20000})
  expect(requests).toBe(1)
  await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Minha rede',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Minha Rede de Saúde',exact:true})).toBeVisible()
  await expect(page.getByText('A consulta não respondeu a tempo.')).toHaveCount(0)
})

test('unmount aborts an in-flight request without an error on the next page',async({page,db})=>{
  void db;const failures:string[]=[]
  page.on('requestfailed',request=>{if(request.url().includes('/rpc/dashboard_network'))failures.push(request.failure()?.errorText||'')})
  await page.route(endpoint,async route=>{if(route.request().postDataJSON().p_section==='favorites')return;return route.fulfill({json:sample})})
  await login(page,'/')
  await expect(section(page,'Seus favoritos').getByRole('status',{name:'Carregando seus favoritos'})).toBeVisible()
  await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Minha rede',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Minha Rede de Saúde',exact:true})).toBeVisible()
  await expect.poll(()=>failures.length).toBeGreaterThan(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('background failure retains cached records and recovery updates them',async({page,db})=>{
  await call(db,'save_network_entity',['establishments',null,JSON.stringify({name:'Favorito em cache',kind:'clinic',favorite:true})],'$1,$2,$3::jsonb')
  await login(page,'/')
  const area=section(page,'Seus favoritos')
  await expect(area.getByRole('heading',{name:'Favorito em cache'})).toBeVisible()
  let fail=true
  await page.route(endpoint,route=>route.request().postDataJSON().p_section==='favorites' && fail
    ? route.fulfill({status:500,json:{code:'XX000',message:'Controlled outage'}}):route.fallback())
  await area.getByRole('button',{name:'Desfavoritar',exact:true}).click()
  await expect(area.getByRole('alert')).toContainText('Os dados carregados anteriormente continuam disponíveis.')
  await expect(area.getByRole('heading',{name:'Favorito em cache'})).toBeVisible()
  fail=false
  await area.getByRole('button',{name:'Tentar novamente'}).click()
  await expect(area.getByText('Você ainda não adicionou favoritos.')).toBeVisible()
})

test('mobile reduced-motion skeletons and compact errors fit the viewport',async({page,db})=>{
  void db;await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'})
  let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve})
  await page.route(endpoint,async route=>{if(route.request().postDataJSON().p_section==='favorites'){await gate;return route.fulfill({status:403,json:{code:'42501',message:'Denied'}})}return route.fulfill({json:sample})})
  await login(page,'/')
  await expect(section(page,'Seus favoritos').getByRole('status',{name:'Carregando seus favoritos'})).toBeVisible()
  expect(await page.locator('.skeleton-icon').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none')
  await page.screenshot({path:'test-results/dashboard-mobile-skeleton.png',fullPage:true})
  release()
  await expect(section(page,'Seus favoritos').getByRole('alert')).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:'test-results/dashboard-mobile-error.png',fullPage:true})
})

test('authentication gate prevents premature requests',async({page,db})=>{
  void db;let requested=0,release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/rest/v1/rpc/get_my_profile',async route=>{await gate;return route.fulfill({json:{id:'11111111-1111-4111-8111-111111111111',role:'admin',status:'active'}})})
  await page.route(endpoint,route=>{requested++;return route.fulfill({json:{items:[],total:0}})})
  await login(page,'/')
  expect(requested).toBe(0)
  release()
  await expect(section(page,'Últimos cadastros').getByText('Nenhum cadastro recente encontrado.')).toBeVisible()
  expect(requested).toBe(2)
})

test('favorite mutations and new records invalidate dashboard cache',async({page,db})=>{
  const id=await call(db,'save_network_entity',['establishments',null,JSON.stringify({name:'Contato favorito',kind:'clinic',favorite:true})],'$1,$2,$3::jsonb')
  await login(page,'/')
  await section(page,'Seus favoritos').getByRole('button',{name:'Desfavoritar',exact:true}).click()
  await expect(section(page,'Seus favoritos').getByText('Você ainda não adicionou favoritos.')).toBeVisible()
  await page.goto(`/estabelecimentos/${id}`)
  await page.getByRole('button',{name:'Favoritar',exact:true}).click()
  await expect(page.getByRole('button',{name:'Desfavoritar',exact:true})).toBeVisible()
  await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Início',exact:true}).click()
  await expect(section(page,'Seus favoritos').getByRole('heading',{name:'Contato favorito'})).toBeVisible()
  await page.goto('/estabelecimentos/novo')
  await page.getByLabel('Nome do estabelecimento').fill('Novo registro rápido')
  await page.getByRole('button',{name:'Salvar estabelecimento',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Novo registro rápido'})).toBeVisible()
  await page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Início',exact:true}).click()
  await expect(section(page,'Últimos cadastros').getByText('Novo registro rápido')).toBeVisible()
})
