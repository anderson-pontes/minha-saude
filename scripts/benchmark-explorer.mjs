import {mkdirSync,writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
const directory='data/network-explorer';mkdirSync(directory,{recursive:true})
const operations=[['plan_list',`public.browse_network('{"category":"health_plans"}',1,12)`],['overview','public.health_plan_overview(plan_id)'],['establishments',`public.health_plan_network(plan_id,'establishments','{"sort":"name"}',1,12)`],['doctors',`public.health_plan_network(plan_id,'doctors','{"sort":"name"}',1,12)`],['specialties',`public.health_plan_network(plan_id,'specialties','{}',1,12)`],['filtered_doctors',`public.health_plan_network(plan_id,'doctors','{"city":"Belém","q":"cardiologia"}',1,12)`],['lookup',`public.network_lookup('doctors','',null,true)`],['directory',`public.browse_network('{}',1,12)`]]
const sql=`begin read only;set local statement_timeout='30s';
do $actor$ declare actor uuid;begin select id into actor from public.profiles where role='admin' and status='active' order by created_at limit 1;perform set_config('request.jwt.claim.sub',actor::text,true);end $actor$;
set local role authenticated;
do $measure$ declare plan_id uuid; started timestamptz; result jsonb; overview jsonb; samples jsonb:='[]';sample integer;begin
select id into plan_id from public.health_plans where public.network_normalize(name) like '%unicasf%' order by id limit 1;
overview:=public.health_plan_overview(plan_id);
${operations.map(([name,query])=>`for sample in 1..3 loop started:=clock_timestamp();result:=${query};samples:=samples||jsonb_build_array(jsonb_build_object('operation','${name}','sample',sample,'database_ms',round((extract(epoch from clock_timestamp()-started)*1000)::numeric,2),'response_bytes',octet_length(result::text),'total',result->'total','items',jsonb_array_length(coalesce(result->'items','[]'))));end loop;`).join('\n')}
perform set_config('minha_saude.explorer',jsonb_build_object('measurements',samples,'counts',jsonb_build_object('establishments',overview->'establishments_count','doctors',overview->'doctors_count','specialties',overview->'specialties_count','cities',overview->'cities_count'),'summary_has_provider_arrays',overview?'establishments' or overview?'doctors')::text,true);end $measure$;
select current_setting('minha_saude.explorer')::jsonb report;rollback;`
writeFileSync(`${directory}/benchmark.sql`,sql)
const processResult=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--project-ref','qvkgadxyyzyjeiwjykgr','--file',`${directory}/benchmark.sql`,'--output-format','json'],{encoding:'utf8',maxBuffer:1024*1024})
if(processResult.status!==0)throw new Error(processResult.stderr+'\n'+processResult.stdout)
const report={recorded_at:new Date().toISOString(),method:'READ ONLY, authenticated role, PostgreSQL elapsed time; aggregated metrics only',...JSON.parse(processResult.stdout).rows[0].report}
writeFileSync(`${directory}/benchmark.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
