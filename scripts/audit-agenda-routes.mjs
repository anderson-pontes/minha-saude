import {chromium} from '@playwright/test'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const origin='https://minha-saude-cyan.vercel.app'
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const page=await browser.newPage(),errors=[],privateRequests=[]
 page.on('pageerror',error=>errors.push(error.message))
 page.on('request',request=>{if(request.url().includes('/rpc/agenda_'))privateRequests.push(new URL(request.url()).pathname)})
 const routes=[]
 for(const path of ['/agenda','/agenda/00000000-0000-4000-8000-000000000000']){
  const response=await page.goto(origin+path,{waitUntil:'networkidle'})
  assert.equal(response.status(),200)
  await page.waitForURL('**/login')
  await page.getByLabel('E-mail',{exact:true}).waitFor()
  routes.push({path,protectedByLogin:true})
 }
 assert.deepEqual(errors,[]);assert.deepEqual(privateRequests,[])
 writeFileSync('data/agenda/production-routes.json',JSON.stringify({origin,routes,pageErrors:errors,unauthenticatedPrivateRequests:privateRequests,realUserLoginPerformed:false},null,2)+'\n')
 console.log(JSON.stringify({routes:routes.length,protectedByLogin:true,pageErrors:0,unauthenticatedPrivateRequests:0}))
}finally{await browser.close()}
