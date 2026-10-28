import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
const owner='11111111-1111-4111-8111-111111111111'
export const test=base.extend<{ db:PGlite }>({
  db:async({page},provide)=>{
    const db=new PGlite()
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('${owner}');`)
    for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'))
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false)`)
    const user={id:owner,aud:'authenticated',role:'authenticated',email:'test@example.invalid',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}
    await page.route('https://viacep.com.br/**',route=>route.fulfill({status:503,json:{message:'Controlled unavailable service'}}))
    await page.route('https://foundation-test.supabase.co/**',async route=>{
      const url=new URL(route.request().url()); const body=route.request().postDataJSON()
      if(url.pathname.includes('/token'))return route.fulfill({json:{access_token:'test-access-token',refresh_token:'test-refresh-token',expires_in:3600,token_type:'bearer',user}})
      if(url.pathname.includes('/user'))return route.fulfill({json:user})
      try {
        const fn=url.pathname.split('/rpc/')[1];let result:unknown
        if(fn==='save_network_entity')result=await call(db,'save_network_entity',[body.p_type,body.p_id,JSON.stringify(body.p_data)],'$1,$2,$3::jsonb')
        else if(fn==='search_network')result=await call(db,'search_network',[JSON.stringify(body.p_filters),body.p_page,body.p_size],'$1::jsonb,$2,$3')
        else if(fn==='network_document')result=await call(db,'network_document',[body.p_type,body.p_id],'$1,$2')
        else if(fn==='network_summary')result=await call(db,'network_summary',[],'')
        else {
          const table=url.pathname.split('/').pop();if(!['favorites','establishments','doctors','specialties','health_plans'].includes(table??''))throw new Error('Unexpected table')
          if(route.request().method()==='DELETE'){
            const key=table==='favorites'?(url.searchParams.has('doctor_id')?'doctor_id':'establishment_id'):'id'
            const id=url.searchParams.get(key)?.replace('eq.','')
            const rows=await db.query(`delete from public.${table} where ${key}=$1 returning id`,[id]);result=table==='favorites'?rows.rows:rows.rows[0]
          }else if(table==='favorites' && route.request().method()==='POST'){
            const key=body.doctor_id?'doctor_id':'establishment_id';result=(await db.query(`insert into public.favorites(${key}) values($1) returning id`,[body[key]])).rows
          }else throw new Error('Unexpected endpoint')
        }
        return route.fulfill({json:result})
      }catch(error){const e=error as {code?:string;message:string};return route.fulfill({status:400,json:{code:e.code,message:e.message}})}
    })
    await provide(db)
    await page.unrouteAll({behavior:'ignoreErrors'});await db.close()
  },
})
export async function call(db:PGlite,name:string,args:unknown[],signature:string){return (await db.query<{result:unknown}>(`select public.${name}(${signature}) result`,args)).rows[0].result}
export async function login(page:Page,path='/cadastros'){
  await page.goto(path);await page.getByLabel('E-mail',{exact:true}).fill('test@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('test-password-only');await page.getByRole('button',{name:'Entrar no meu espaço'}).click();await expect(page).not.toHaveURL(/\/login$/)
}
export async function step(page:Page,n:number){
  const navigation=page.getByRole('navigation',{name:'Etapas do cadastro'})
  if(await navigation.isVisible()){await navigation.getByRole('button',{name:new RegExp(`^${n}\\.`)}).click();return}
  for(let attempt=0;attempt<6;attempt++){
    const current=Number((await page.locator('.mobile-step-heading > span').textContent())?.match(/Etapa (\d+)/i)?.[1])
    if(current===n)return
    await page.getByRole('button',{name:current<n?'Continuar':'Voltar',exact:true}).click()
    await expect(page.locator('.mobile-step-heading > span')).toHaveText(`Etapa ${current+(current<n?1:-1)} de ${await page.locator('.professional-stepper progress').getAttribute('max')}`)
  }
  throw new Error('Could not navigate to requested form step')
}
export async function select(page:Page,label:string,name:string){await page.getByRole('combobox',{name:label,exact:true}).fill(name);await page.getByRole('option',{name,exact:true}).click()}
export async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)}

