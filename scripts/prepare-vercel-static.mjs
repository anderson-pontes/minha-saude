// Static-only Build Output API package. Provider PDFs/JSON, source SQL and env files stay local.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const reportDirectory=process.argv[2]||'data/dashboard-performance'
assert(['data/dashboard-performance','data/network-explorer','data/product-design'].includes(reportDirectory),'Unsupported report directory')
const workspace=realpathSync(process.cwd())
const output=resolve(workspace,'.vercel/output')
assert.equal(realpathSync(dirname(output)),join(workspace,'.vercel'))
assert(!existsSync(output)||!lstatSync(output).isSymbolicLink(),'Refuse a symlink output directory')
const dist=resolve(workspace,'dist')
function files(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(directory,e.name)):[join(directory,e.name)])}
const assets=files(dist)
const allowed=new Set(['.html','.js','.css','.woff','.woff2','.png','.svg','.webmanifest','.ico','.txt'])
assert(assets.every(file=>allowed.has(extname(file))&&!relative(dist,file).split(/[\\/]/).some(part=>part.startsWith('.'))),'Only reviewed static asset types may be deployed')
process.loadEnvFile('.env')
assert.equal(process.env.VITE_SUPABASE_URL,'https://qvkgadxyyzyjeiwjykgr.supabase.co')
assert(process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'))
const javascript=assets.filter(f=>f.endsWith('.js')).map(f=>readFileSync(f,'utf8')).join('\n')
assert(javascript.includes(process.env.VITE_SUPABASE_URL)&&javascript.includes(process.env.VITE_SUPABASE_PUBLISHABLE_KEY),'Build must target the authorized Supabase project')
assert(!javascript.includes('foundation-test.supabase.co')&&!javascript.includes('[SENSITIVE]'),'Refuse test or placeholder configuration')
// This exact generated folder was resolved and checked above; never remove the parent with env/settings.
rmSync(output,{recursive:true,force:true})
mkdirSync(output,{recursive:true})
cpSync(dist,join(output,'static'),{recursive:true})
const existing=JSON.parse(readFileSync('vercel.json','utf8'))
const routes=existing.headers.map(rule=>({src:rule.source==='/(.*)'?'^/(.*)$':rule.source==='/assets/(.*)'?'^/assets/(.*)$':'^'+rule.source.replaceAll('.','\\.')+'$',headers:Object.fromEntries(rule.headers.map(h=>[h.key,h.value])),continue:true}))
routes.push({handle:'filesystem'})
routes.push({src:'^'+existing.rewrites[0].source+'$',dest:'/index.html'})
writeFileSync(join(output,'config.json'),JSON.stringify({version:3,routes},null,2)+'\n')
const report={project:'minha-saude',method:'Static-only Build Output API v3; no new project or bypass secret',files:assets.map(f=>({path:relative(dist,f).replaceAll('\\','/'),sha256:createHash('sha256').update(readFileSync(f)).digest('hex')})),supabase_project_verified:true,provider_data_included:false,env_files_included:false}
mkdirSync(reportDirectory,{recursive:true})
writeFileSync(join(reportDirectory,'deployment-inputs.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({files:assets.length,output,providerDataIncluded:false,envFilesIncluded:false,supabaseProjectVerified:true}))
