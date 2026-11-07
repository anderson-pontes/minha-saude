import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const values=Object.fromEntries(readFileSync('.env.agenda.local','utf8').trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)]}))
const endpoint='https://qvkgadxyyzyjeiwjykgr.supabase.co/functions/v1/processar-lembretes'
const denied=await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(30000)})
assert.equal(denied.status,401)
const allowed=await fetch(endpoint,{method:'POST',headers:{'x-agenda-cron-secret':values.AGENDA_CRON_SECRET},signal:AbortSignal.timeout(60000)})
if(!allowed.ok)throw Error('Agenda worker returned HTTP '+allowed.status)
const result=await allowed.json()
assert.equal(result.failed,0)
const report={unauthenticatedStatus:denied.status,authenticatedStatus:allowed.status,processing:result,recordedAt:new Date().toISOString()}
writeFileSync('data/agenda/worker-production.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
