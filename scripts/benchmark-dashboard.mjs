import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const phase=process.argv[2] || 'before'
if (!['before','after'].includes(phase)) throw new Error('Use before or after')
const directory='data/dashboard-performance'
mkdirSync(directory,{recursive:true})
const queries=phase==='before'
 ? [['recent',"public.search_network('{}',1,6)"],['favorites',"public.search_network('{\"favorites\":\"true\"}',1,4)"],['summary','public.network_summary()']]
 : [['recent','public.dashboard_network(\'recent\',6)'],['favorites','public.dashboard_network(\'favorites\',4)'],['summary','public.network_summary()'],['legacy_recent',"public.search_network('{}',1,6)"],['legacy_favorites',"public.search_network('{\"favorites\":\"true\"}',1,4)"]]
const steps=queries.map(([name,query])=>`for sample in 1..3 loop
 started:=clock_timestamp(); result:=${query};
 samples:=samples||jsonb_build_array(jsonb_build_object('operation','${name}','sample',sample,'database_ms',round((extract(epoch from clock_timestamp()-started)*1000)::numeric,2),'response_bytes',octet_length(result::text),'items',jsonb_array_length(coalesce(result->'items','[]'))));
end loop;`).join('\n')
const sql=`begin read only; set local statement_timeout='90s';
do $actor$ declare actor uuid;begin select id into actor from public.profiles where role='admin' and status='active' order by created_at limit 1;perform set_config('request.jwt.claim.sub',actor::text,true);end $actor$;
set local role authenticated;
do $measure$ declare started timestamptz; result jsonb; samples jsonb:='[]';sample integer;begin
${steps}
perform set_config('minha_saude.benchmark',samples::text,true);end $measure$;
select current_setting('minha_saude.benchmark')::jsonb measurements;commit;`
const file=`${directory}/${phase}.sql`
writeFileSync(file,sql)
const started=performance.now()
const processResult=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--project-ref','qvkgadxyyzyjeiwjykgr','--file',file,'--output-format','json'],{encoding:'utf8',maxBuffer:1024*1024})
if(processResult.status!==0)throw new Error(processResult.stderr+'\n'+processResult.stdout)
const data=JSON.parse(processResult.stdout)
const report={phase,project_ref:'qvkgadxyyzyjeiwjykgr',recorded_at:new Date().toISOString(),method:'READ ONLY SQL, role authenticated; query time measured inside PostgreSQL, no provider data emitted',cli_total_ms:Math.round(performance.now()-started),measurements:data.rows[0].measurements}
writeFileSync(`${directory}/${phase}.json`,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
