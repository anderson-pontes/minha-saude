import { test,expect } from '@playwright/test'
import sharp from 'sharp'
import {readFileSync} from 'node:fs'

test('production manifest, branded icons and Vercel routing',async({request})=>{
 const result=await request.get('/manifest.webmanifest');expect(result.headers()['content-type']).toContain('application/manifest+json')
 const manifest=await result.json();expect(manifest).toMatchObject({name:'Minha Saúde',short_name:'Minha Saúde',start_url:'/',scope:'/',display:'standalone',theme_color:'#0F766E',lang:'pt-BR'})
 for(const icon of manifest.icons){const r=await request.get(icon.src);expect(r.headers()['content-type']).toContain('image/png');const info=await sharp(await r.body()).metadata();const size=Number(icon.sizes.split('x')[0]);expect(info.width).toBe(size);expect(info.height).toBe(size)}
 expect(manifest.icons.some((i:{purpose:string})=>i.purpose==='maskable')).toBe(true)
 const apple=await request.get('/icons/apple-touch-icon.png');expect((await sharp(await apple.body()).metadata()).width).toBe(180)
 const config=JSON.parse(readFileSync('vercel.json','utf8'));const rule=new RegExp(`^${config.rewrites[0].source}$`)
 for(const path of ['/manifest.webmanifest','/sw.js','/push-events.js','/icons/pwa-192.png','/assets/main.js'])expect(rule.test(path)).toBe(false)
 expect(rule.test('/estabelecimentos/example')).toBe(true)
 const sw=await request.get('/sw.js');expect(sw.headers()['content-type']).toContain('javascript');expect(sw.headers()['service-worker-allowed']).toBe('/')
 expect(await sw.text()).toContain('push-events.js')
 const push=await request.get('/push-events.js');expect(push.headers()['content-type']).toContain('javascript');expect(await push.text()).toContain('notificationclick')
})

test('service worker caches only static resources and offline shows honest feedback',async({page,context})=>{
 await page.goto('/login');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload()
 await expect(page.getByRole('heading',{name:'Seu cuidado começa aqui.'})).toBeVisible()
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true)
 await context.route('https://*.supabase.co/**',route=>route.fulfill({json:{private_marker:'must-not-be-cached'}}))
 const value=await page.evaluate(async()=>{const r=await fetch('https://qvkgadxyyzyjeiwjykgr.supabase.co/rest/v1/establishments');return r.json()})
 expect(value.private_marker).toBe('must-not-be-cached')
 const cached=await page.evaluate(async()=>{const urls:string[]=[];for(const key of await caches.keys()){for(const request of await (await caches.open(key)).keys())urls.push(request.url)}return urls})
 expect(cached.length).toBeGreaterThan(0);expect(cached.every(url=>new URL(url).origin===locationOrigin)).toBe(true)
 expect(cached.some(value=>{const url=new URL(value);return url.hostname.endsWith('.supabase.co')||/^\/(rest|auth)\/v1(?:\/|$)/.test(url.pathname)})).toBe(false)
 await context.setOffline(true);await page.reload();await expect(page.getByText(/Você está sem internet/)).toBeVisible()
 await context.setOffline(false);await expect(page.getByText(/Você está sem internet/)).not.toBeVisible()
 expect(await page.evaluate(()=>navigator.serviceWorker.getRegistrations().then(r=>r.length))).toBe(1)
})
const locationOrigin='http://127.0.0.1:4176'

test('new worker version prompts before activation and reload',async({page,request})=>{
 await page.goto('/login');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload()
 await request.post('/__test/version')
 await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration?.update()})
 await expect(page.getByRole('complementary',{name:'Atualização disponível'})).toBeVisible({timeout:15000})
 const reload=page.waitForEvent('load');await page.getByRole('button',{name:'Atualizar',exact:true}).click();await reload
 await expect(page.getByRole('complementary',{name:'Atualização disponível'})).not.toBeVisible()
})
