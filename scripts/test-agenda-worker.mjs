import assert from 'node:assert/strict'
import {processReminders,allowedPushEndpoint} from '../supabase/functions/_shared/reminder-worker.mjs'
const id='11111111-1111-4111-8111-111111111111'
assert(allowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'))
for(const url of ['http://fcm.googleapis.com/x','https://fcm.googleapis.com.evil.test/x','https://127.0.0.1/x','https://fcm.googleapis.com@evil.test/x'])assert(!allowedPushEndpoint(url))
async function scenario(statuses){
 let claimed=false;const outcomes=[],requests=[];let done=false
 const rpc=async(name,args)=>{
  if(name==='agenda_claim'){if(claimed)return [];claimed=true;return [{id,canal:'push',reserva:id}]}
  if(name==='agenda_process'){if(args.p_outcome){done=true;outcomes.push(args.p_outcome);return {finished:true}}return {appointment:id,tag:id,subscriptions:statuses.map((_,i)=>({id:String(i),endpoint:'https://fcm.googleapis.com/fcm/send/'+i,keys:{}}))}}
  if(name==='agenda_push_result')requests.push(args.p_status)
 }
 const result=await processReminders({rpc,send:async subscription=>statuses[Number(subscription.id)]})
 assert(done);return {outcomes,requests,result}
}
let r=await scenario([201,410]);assert.deepEqual(r.requests,['aceito','expirado']);assert.deepEqual(r.outcomes,['aceito_pelo_push'])
r=await scenario([503]);assert.deepEqual(r.outcomes,['falhou']);assert.equal(r.result.failed,1)
r=await scenario([]);assert.deepEqual(r.outcomes,['sem_dispositivo'])
r=await scenario([410]);assert.deepEqual(r.outcomes,['sem_dispositivo']);assert.deepEqual(r.requests,['expirado'])
let claimed=false,processed=0
await processReminders({rpc:async(name)=>{if(name==='agenda_claim'){if(claimed)return [];claimed=true;return [{id,reserva:id,canal:'interno'}]}processed++;return null},send:async()=>{throw Error('Must not send cancelled reminder')}})
assert.equal(processed,1)
console.log('PASS worker: endpoint allowlist/SSRF, accepted vs delivery distinction, expired device, transient failure, no-device path, cancelled reservation and generic payload.')
