// Read-only/denied anonymous API checks. No credentials or user data are logged.
import assert from 'node:assert/strict'
const url=process.env.VITE_SUPABASE_URL?.replace(/\/$/,'')
const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY
assert.equal(url,'https://qvkgadxyyzyjeiwjykgr.supabase.co')
assert(key?.startsWith('sb_publishable_'),'A frontend publishable key is required')
const checks=[
 ['save_network_entity',{p_type:'specialties',p_id:null,p_data:{}}],
 ['network_summary',{}],
 ['search_network',{p_filters:{},p_page:1,p_size:1}],
 ['network_document',{p_type:'establishments',p_id:'00000000-0000-4000-8000-000000000000'}],
 ['network_normalize',{value:'Saúde'}],
]
for(const [name,body] of checks){
 const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)})
 const data=await response.json()
 assert([401,403].includes(response.status)&&data.code==='42501',`${name}: expected permission denial, got ${response.status} ${data.code}`)
 console.log(`PASS ${name}: schema cache resolved RPC; anonymous execution denied (${response.status}/${data.code})`)
}
const table=await fetch(`${url}/rest/v1/doctor_health_plans?select=id&limit=1`,{headers:{apikey:key},signal:AbortSignal.timeout(15000)})
const denied=await table.json()
assert([401,403].includes(table.status)&&denied.code==='42501',`New table: expected permission denial, got ${table.status} ${denied.code}`)
console.log(`PASS doctor_health_plans: anonymous table access denied (${table.status}/${denied.code})`)
