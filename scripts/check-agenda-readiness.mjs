import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import assert from 'node:assert/strict'
const parse=file=>JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''))
const raw=parse('data/agenda/remote-readiness.json'),r=raw.rows?.[0]?.agenda_readiness??raw
assert.equal(r.tables.length,6);assert(r.tables.every(t=>t.rls&&t.force_rls))
assert.deepEqual(r.worker_permissions,{anonymous:false,authenticated:false,service_role:true})
assert.deepEqual(r.browser_permissions,{insert_reminder:false,insert_notification:false,update_read_at:true,update_notification_owner:false})
assert(r.cron.active);assert.equal(r.cron.schedule,'* * * * *');assert.equal(r.migrations.length,3)
assert(r.cron_runs.length>0&&r.cron_runs.every(run=>run.status==='succeeded'))
assert(r.worker_http.length>0&&r.worker_http.every(response=>response.status_code===200&&!response.timed_out))
const before=parse('data/agenda/advisors-before.json').results,after=parse('data/agenda/advisors-after.json').results
const previous=new Set(before.map(a=>a.cacheKey));assert(after.every(a=>previous.has(a.cacheKey)))
writeFileSync('data/agenda/remote-readiness.json',JSON.stringify(r,null,2)+'\n')
mkdirSync('data/agenda/screenshots',{recursive:true})
console.log('PASS remote readiness: 6 forced-RLS tables; worker service-role only; no browser insert of reminders/notifications; 3 migrations applied; Cron succeeded; HTTP 200; no new security advisors.')
