import {createClient} from 'npm:@supabase/supabase-js@2.118.0'
import * as webpush from 'npm:web-push@4.0.0'
import {processReminders} from '../_shared/reminder-worker.mjs'

async function equalSecret(actual:string,expected:string){
 if(!actual||!expected)return false
 const digest=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))
 const [a,b]=await Promise.all([digest(actual),digest(expected)])
 let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i]
 return difference===0
}
Deno.serve(async request=>{
 if(request.method!=='POST')return new Response('Method not allowed',{status:405})
 if(!await equalSecret(request.headers.get('x-agenda-cron-secret')??'',Deno.env.get('AGENDA_CRON_SECRET')??''))return new Response('Unauthorized',{status:401})
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
 const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await client.rpc(name,args);if(error)throw new Error('agenda_rpc_failed');return data}
 try {
  const stats=await processReminders({rpc,send:async(subscription:object,payload:object)=>{
   const details=webpush.generateRequestDetails(subscription,JSON.stringify(payload),{TTL:300,urgency:'normal',vapidDetails:{subject:Deno.env.get('VAPID_SUBJECT')!,publicKey:Deno.env.get('VAPID_PUBLIC_KEY')!,privateKey:Deno.env.get('VAPID_PRIVATE_KEY')!}})
   const response=await fetch(details.endpoint,{method:'POST',headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(5000)})
   await response.body?.cancel();return response.status
  }})
  console.info(JSON.stringify({event:'agenda_reminders',...stats}))
  return Response.json(stats)
 }catch{
  console.error(JSON.stringify({event:'agenda_reminders_failed'}))
  return Response.json({error:'Processing unavailable'},{status:503})
 }
})
