import {expect} from '@playwright/test'
import {mkdirSync,writeFileSync} from 'node:fs'
import {test,login,noOverflow,call} from './fixtures/network'
import type {PGlite} from '@electric-sql/pglite'

async function seed(db:PGlite) {
  const make=(type:string,data:unknown)=>call(db,'save_network_entity',[type,null,JSON.stringify(data)],'$1,$2,$3::jsonb')
  const specialtyIds=[]
  for(const name of ['Clínica médica e acompanhamento integral de doenças crônicas','Cardiologia pediátrica e ecocardiografia avançada','Neurologia','Geriatria','Dermatologia'])specialtyIds.push(await make('specialties',{name}))
  const plan=await make('health_plans',{name:'Plano de saúde com nome bastante extenso para validação',notes:'Operadora: Cooperativa de Saúde. Registro apresentado: 12345/678-9.'})
  const establishment=await make('establishments',{name:'Centro integrado de especialidades e diagnóstico de alta complexidade da região metropolitana',trade_name:'Centro de Especialidades',kind:'clinic',specialties:specialtyIds.map(id=>({id})),health_plans:[{id:plan}],addresses:[{street:'Avenida da Saúde',number:'200',neighborhood:'Bairro com nome extenso para verificar responsividade',city:'Belém',state:'PA',is_primary:true}],contacts:[{kind:'phone',label:'Recepção',value:'9133334444',is_primary:true,notes:'Fonte: documento da rede credenciada, página 1.'},{kind:'phone',label:'Agendamento',value:'9133335555'},{kind:'whatsapp',value:'91988889999'}]})
  const ids=[]
  for(let n=1;n<=25;n++)ids.push(await make('doctors',{name:n===1?'Dra. Maria Fernanda Albuquerque de Vasconcelos e Silva — atendimento especializado':`Profissional ${String(n).padStart(2,'0')}`,professional_council:'CRM',registration_number:String(20000+n),registration_state:'PA',specialties:n===1?specialtyIds.map(id=>({id})):n%3?[{id:specialtyIds[0]}]:[],establishments:n%3?[{id:establishment}]:[],health_plans:n===1?[{id:plan}]:[]}))
  return {establishment,ids,plan}
}

async function geometry(page:import('@playwright/test').Page) {
  return page.locator('.network-grid').evaluate(grid=>{
    const cards=Array.from(grid.querySelectorAll<HTMLElement>('.entity-card'))
    const columns=getComputedStyle(grid).gridTemplateColumns.split(' ').length
    return {columns,width:grid.getBoundingClientRect().width,rows:cards.map(card=>{const rect=card.getBoundingClientRect();return {top:Math.round(rect.top),height:rect.height,bottom:card.querySelector('footer')!.getBoundingClientRect().bottom}})}
  })
}

for(const width of [360,390,768,1024,1280,1440,1920,2560])test(`fluid catalogue, equal rows and compact details at ${width}px`,async({page,db},info)=>{
  test.setTimeout(45000)
  const fixture=await seed(db);await page.setViewportSize({width,height:1000});await login(page,'/medicos?sort=name')
  await expect(page.locator('.network-grid .entity-card')).toHaveCount(12)
  await noOverflow(page)
  const metrics=await geometry(page)
  expect(metrics.columns).toBe(width<640?1:width<1280?2:width<1920?3:width<2560?4:5)
  const groups=new Map<number,typeof metrics.rows>()
  for(const row of metrics.rows){const group=groups.get(row.top)??[];group.push(row);groups.set(row.top,group)}
  for(const group of groups.values()){expect(Math.max(...group.map(r=>r.height))-Math.min(...group.map(r=>r.height))).toBeLessThan(2);expect(Math.max(...group.map(r=>r.bottom))-Math.min(...group.map(r=>r.bottom))).toBeLessThan(2)}
  const main=await page.locator('main').boundingBox();expect(main!.width).toBeGreaterThan(width-(width>=1200?226:width>=768?74:2))
  const first=page.locator('.network-grid .entity-card').first()
  await expect(first.getByRole('link',{name:'+3 especialidades',exact:true})).toBeVisible()
  await expect(first.locator('.specialty-chip')).toHaveCount(2)
  for(const selector of ['h2','.card-establishment strong','.specialty-chip>span'])expect(await first.locator(selector).evaluateAll(elements=>elements.every(el=>el.getBoundingClientRect().height<=parseFloat(getComputedStyle(el).lineHeight)*2+1))).toBe(true)
  await page.screenshot({path:`test-results/product-network-${width}.png`})
  await page.getByRole('button',{name:'Tabela',exact:true}).click();await expect(page.locator('.explorer-table')).toBeVisible();await noOverflow(page)
  await page.getByRole('button',{name:'Cards',exact:true}).click()
  await page.getByLabel('Busca universal').fill('Profissional 05');await page.getByLabel('Busca universal').press('Enter')
  await expect(page.locator('.entity-card')).toHaveCount(1)
  await page.getByRole('button',{name:'Limpar busca',exact:true}).click();await expect(page).not.toHaveURL(/q=/)
  await page.goto(`/estabelecimentos/${fixture.establishment}`)
  await expect(page.locator('.contact-item')).toHaveCount(3)
  const contact=page.locator('.contact-item').first();expect((await contact.boundingBox())!.height).toBeLessThan(width<768?175:140)
  await contact.getByText('Fonte e observações',{exact:true}).click();await expect(contact).toContainText('Fonte: documento')
  const related=page.getByRole('region',{name:'Médicos',exact:true})
  await expect(related.locator('.related-item')).toHaveCount(8)
  await expect(related).toContainText('17 vínculos')
  await related.getByRole('button',{name:'Próxima em Médicos',exact:true}).click();await expect(related).toContainText('9–16 de 17')
  await noOverflow(page)
  await page.screenshot({path:`test-results/product-detail-${width}.png`})
  mkdirSync('data/product-design',{recursive:true});writeFileSync(`data/product-design/layout-${width}.json`,JSON.stringify({viewport:width,...metrics},null,2)+'\n')
  await info.attach('layout.json',{body:JSON.stringify(metrics),contentType:'application/json'})
})

test('mobile navigation traps focus, closes on Escape and outside, and restores its trigger',async({page,db})=>{
  void db;await page.setViewportSize({width:390,height:844});await login(page,'/cadastros')
  const trigger=page.getByRole('button',{name:'Abrir menu de navegação'});await trigger.click()
  const drawer=page.getByRole('dialog',{name:'Menu de navegação'})
  await expect(drawer).toBeVisible();expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden')
  for(let n=0;n<12;n++)await page.keyboard.press('Tab')
  expect(await drawer.evaluate(el=>el.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape');await expect(drawer).not.toBeVisible();await expect(trigger).toBeFocused()
  await trigger.click();await page.mouse.click(380,400);await expect(drawer).not.toBeVisible();await expect(trigger).toBeFocused()
  await trigger.click();await drawer.getByRole('link',{name:'Convênios',exact:true}).click();await expect(page).toHaveURL(/convenios$/);await expect(drawer).not.toBeVisible()
  await noOverflow(page)
})

test('large catalogue keeps page requests and rendered cards bounded',async({page,db})=>{
  await db.exec("insert into public.doctors(name) select 'Profissional de volume '||lpad(n::text,4,'0') from generate_series(1,2000) n")
  const sizes:number[]=[]
  page.on('request',request=>{if(request.url().endsWith('/rpc/browse_network'))sizes.push(request.postDataJSON().p_size)})
  await page.setViewportSize({width:1920,height:1080});await login(page,'/medicos?sort=name')
  await expect(page.getByText('2000 cadastros encontrados',{exact:true})).toBeVisible()
  await expect(page.locator('.network-grid .entity-card')).toHaveCount(12)
  const first=await page.locator('.record-title').first().textContent()
  await page.getByRole('button',{name:'Próxima',exact:true}).click()
  await expect(page.getByText('Página 2 de 167',{exact:true})).toBeVisible()
  await expect(page.locator('.record-title').first()).not.toHaveText(first!)
  await expect(page.locator('.network-grid .entity-card')).toHaveCount(12)
  expect(sizes).toEqual([12,12]);await noOverflow(page)
})

