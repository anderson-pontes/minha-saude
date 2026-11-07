export const allowedPushEndpoint = endpoint => /^https:\/\/([a-z0-9-]+\.)*(push\.services\.mozilla\.com|fcm\.googleapis\.com|web\.push\.apple\.com|notify\.windows\.com)\//.test(endpoint)

// Bounded worker, injectable for deterministic tests. No medical content is sent to push services.
export async function processReminders({rpc,send,now=()=>Date.now(),budgetMs=45000}) {
 const started=now(),stats={claimed:0,internal:0,pushAccepted:0,failed:0,skipped:0}
 // Claim small batches as we go so unprocessed work is not stranded by the execution deadline.
 for(let batch=0;batch<10&&now()-started<budgetMs;batch++) {
  const jobs=await rpc('agenda_claim',{p_limit:2})
  if(!jobs.length)break
  stats.claimed+=jobs.length
  await Promise.all(jobs.map(async job=>{
   const args={p_id:job.id,p_token:job.reserva}
   try {
    const data=await rpc('agenda_process',args)
    if(!data){stats.skipped++;return}
    if(data.interno){stats.internal++;return}
    let failed=false,accepted=0
    for(const subscription of data.subscriptions) {
     if(now()-started>=budgetMs){failed=true;break}
     // Recheck status/preferences/token before each external side effect.
     const eligible=await rpc('agenda_process',args)
     if(!eligible){stats.skipped++;return}
     if(!eligible.subscriptions.some(s=>s.id===subscription.id))continue
     let outcome='falhou'
     try {
      if(!allowedPushEndpoint(subscription.endpoint))outcome='expirado'
      else {
       const response=await send(subscription,{appointment:data.appointment,tag:data.tag})
       outcome=response>=200&&response<300?'aceito':[404,410].includes(response)?'expirado':'falhou'
      }
     }catch { outcome='falhou' }
     await rpc('agenda_push_result',{...args,p_subscription:subscription.id,p_status:outcome})
     if(outcome==='falhou')failed=true
     if(outcome==='aceito')accepted++
    }
    const outcome=failed?'falhou':accepted>0?'aceito_pelo_push':'sem_dispositivo'
    await rpc('agenda_process',{...args,p_outcome:outcome,p_error:failed?'push_transient_failure':null})
    stats.pushAccepted+=accepted
    if(failed)stats.failed++
   }catch {
    stats.failed++
    // No payload, endpoint, auth, keys, patient name or medical title is logged.
    try{await rpc('agenda_process',{...args,p_outcome:'falhou',p_error:'worker_processing_failure'})}catch{/* Lease expires and can be retried by the next job. */}
   }
  }))
 }
 return stats
}
