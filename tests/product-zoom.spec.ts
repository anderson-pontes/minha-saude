import {chromium,expect} from '@playwright/test'
import {mkdirSync,writeFileSync} from 'node:fs'
import {test as networkTest,login,noOverflow} from './fixtures/network'
import {seedExplorer} from '../scripts/network-explorer-fixture.mjs'

// Test-only extension in a temporary browser profile. Never loaded by the product.
declare const chrome:{tabs:{query:(query:{active:boolean;currentWindow:boolean})=>Promise<{id:number}[]>;setZoom:(id:number,factor:number)=>Promise<void>;getZoom:(id:number)=>Promise<number>}}
const test=networkTest.extend({context:async({browserName},provide,info)=>{
  if(browserName!=='chromium')throw new Error('Native zoom harness requires Chromium')
  const extension=info.outputPath('extension');mkdirSync(extension,{recursive:true})
  writeFileSync(extension+'/manifest.json',JSON.stringify({manifest_version:3,name:'Isolated native zoom test',version:'1.0',background:{service_worker:'background.js'}}))
  writeFileSync(extension+'/background.js','chrome.runtime.onInstalled.addListener(()=>{});')
  const context=await chromium.launchPersistentContext(info.outputPath('profile'),{channel:'msedge',headless:true,viewport:null,args:['--window-size=1440,1000','--disable-extensions-except='+extension,'--load-extension='+extension]})
  try{await provide(context)}finally{await context.close()}
}})
for(const zoom of [1.25,1.5,2])test(`native browser zoom ${zoom*100}% preserves reflow, filters and table`,async({page,context,db},info)=>{
  await seedExplorer(db);await login(page,'/medicos?sort=name');await expect(page.locator('.network-grid .entity-card')).toHaveCount(12)
  const before=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio}))
  const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'))??await context.waitForEvent('serviceworker')
  const actual=await worker.evaluate(async factor=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.tabs.setZoom(tab.id,factor);return chrome.tabs.getZoom(tab.id)},zoom)
  expect(actual).toBe(zoom)
  await expect.poll(()=>page.evaluate(()=>devicePixelRatio)).toBeCloseTo(before.dpr*zoom,2)
  const after=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio}))
  expect(Math.abs(after.width-before.width/zoom)).toBeLessThan(2)
  await noOverflow(page)
  await page.getByRole('button',{name:/^Filtros/}).click();const dialog=page.getByRole('dialog',{name:'Filtrar minha rede'})
  await expect(dialog.getByRole('button',{name:'Aplicar filtros'})).toBeInViewport()
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible()
  await page.getByRole('button',{name:'Tabela',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(12);await noOverflow(page)
  await page.getByRole('button',{name:'Cards',exact:true}).click();await expect(page.locator('.network-grid .entity-card')).toHaveCount(12)
  // Capture the physical viewport directly; Playwright's CSS clip crops native zoom captures.
  const cdp=await context.newCDPSession(page)
  const capture=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true})
  writeFileSync(`test-results/product-native-zoom-${zoom}.png`,Buffer.from(capture.data,'base64'));await cdp.detach()
  mkdirSync('data/product-design',{recursive:true});writeFileSync(`data/product-design/zoom-${zoom}.json`,JSON.stringify({method:'Native browser zoom through chrome.tabs.setZoom in isolated temporary profile',requested:zoom,actual,before,after,noPageOverflow:true},null,2)+'\n')
  await info.attach('native-zoom.json',{body:JSON.stringify({actual,before,after}),contentType:'application/json'})
})
