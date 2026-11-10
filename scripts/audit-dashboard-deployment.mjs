import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const origin='https://minha-saude-cyan.vercel.app'
const directory=process.argv[2]||'data/dashboard-performance'
if(!['data/dashboard-performance','data/network-explorer','data/product-design','data/filter-selects','data/agenda','data/agenda-filters'].includes(directory))throw new Error('Unsupported report directory')
const inputs=JSON.parse(readFileSync(`${directory}/deployment-inputs.json`,'utf8'))
const checks=[]
for(let offset=0;offset<inputs.files.length;offset+=5){
  const batch=await Promise.all(inputs.files.slice(offset,offset+5).map(async file=>{
    const started=performance.now()
    const response=await fetch(new URL('/'+file.path,origin),{signal:AbortSignal.timeout(20000)})
    assert.equal(response.status,200,file.path)
    assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),file.sha256,file.path)
    return {path:'/'+file.path,status:response.status,durationMs:Math.round(performance.now()-started),hashMatches:true}
  }))
  checks.push(...batch)
}
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
  const page=await browser.newPage()
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(origin+'/login',{waitUntil:'networkidle'})
  await page.getByLabel('E-mail',{exact:true}).waitFor()
  await page.getByLabel('Senha',{exact:true}).waitFor()
  assert.deepEqual(errors,[])
  const report={origin,recorded_at:new Date().toISOString(),staticFilesChecked:checks.length,checks,loginRendered:true,pageErrors:errors,realUserLoginPerformed:false}
  writeFileSync(`${directory}/production-assets.json`,JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({origin,staticFilesChecked:checks.length,allHashesMatch:true,loginRendered:true,pageErrors:0}))
}finally{await browser.close()}
