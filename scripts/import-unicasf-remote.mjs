// File-based Management API transport: never emits the provider payload to stdout.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: {
  execute: { type: 'boolean' }, 'dry-run': { type: 'boolean' },
  'approved-sha256': { type: 'string' },
  'from-json': { type: 'string', default: 'data/unicasf-review/import.json' },
  'prepare-only': { type: 'boolean' },
  upload: { type: 'boolean' },
} })
if ([values.execute,values['dry-run'],values.upload].filter(Boolean).length>1) throw new Error('Choose --upload, --execute OR --dry-run')
const bytes = readFileSync(values['from-json'])
const digest = createHash('sha256').update(bytes).digest('hex')
if (values.execute && values['approved-sha256'] !== digest) throw new Error('Exact reviewed --approved-sha256 is required')
const bundle = JSON.parse(bytes.toString('utf8'))
const json = JSON.stringify(bundle)
const tag = '$unicasf_payload$'
if (json.includes(tag)) throw new Error('Unexpected SQL delimiter in payload')
const compactMd5 = createHash('md5').update(json).digest('hex')
const encoded = Buffer.from(json,'utf8').toString('base64')
const chunks = encoded.match(/.{1,240000}/g)
const setup = `begin${values.execute ? '' : ' read only'};
set local statement_timeout='120s';
do $transport$ declare encoded text; decoded text; received integer; expected integer; begin
 select string_agg(data,'' order by chunk_index),count(*),max(chunk_count) into encoded,received,expected
 from private.network_import_chunks where content_sha256='${digest}';
 if received<>${chunks.length} or expected<>${chunks.length} then raise exception 'Incomplete upload';end if;
 decoded:=convert_from(decode(encoded,'base64'),'UTF8');
 if md5(decoded)<>'${compactMd5}' then raise exception 'Payload checksum mismatch';end if;
 perform set_config('minha_saude.import_payload',decoded,true);
end $transport$;
do $actor$ declare actor uuid; begin
 if (select count(*) from public.profiles where role='admin' and status='active')<>1 then
  raise exception 'Exactly one active administrator required; explicit actor selection needed';
 end if;
 select id into actor from public.profiles where role='admin' and status='active';
 perform set_config('request.jwt.claim.sub',actor::text,true);
end $actor$;
set local role authenticated;
`
const operation = values.execute
  ? `select result-'entities'-'preview' as import_result from (select public.execute_network_import(current_setting('minha_saude.import_payload')::jsonb,'${digest}',false) result) operation;`
  : `select result-'entities' as preview_result from (select public.preview_network_import(current_setting('minha_saude.import_payload')::jsonb) result) operation;`
const directory = 'data/unicasf-review/transport'
mkdirSync(directory, { recursive: true })
const file = `${directory}/${values.execute ? 'execute' : 'preview'}.sql`
writeFileSync(file, setup + operation + '\ncommit;\n', 'utf8')
console.log(JSON.stringify({ mode:values.upload?'upload':values.execute?'execute':'dry-run', project_ref:'qvkgadxyyzyjeiwjykgr', content_sha256:digest,
  prepared_file:file, partial_import:true, pending_identities:bundle.summary.pending_entities }))
function runQuery(path) {
const result = spawnSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'db', 'query', '--linked',
  '--project-ref', 'qvkgadxyyzyjeiwjykgr', '--file', path, '--output-format', 'json'], { encoding:'utf8', maxBuffer:2*1024*1024 })
if (result.status !== 0) {
  // CLI errors can contain query context. Retain locally; emit bounded metadata only.
  writeFileSync(`${directory}/last-error.json`,JSON.stringify({status:result.status,signal:result.signal,error:result.error?.message,stdout:result.stdout,stderr:result.stderr}))
  let failure
  try { failure=JSON.parse(result.stdout) } catch { failure=null }
  console.error(JSON.stringify({status:result.status,signal:result.signal,error:result.error?.message,
    code:failure?.error?.code,message:failure?.error?.message?.slice(0,700),stderr:result.stderr?.slice(0,300)}))
  process.exit(result.status || 1)
}
return JSON.parse(result.stdout)
}
if (values.upload) {
  for (let i=0;i<chunks.length;i++) {
    const part = `${directory}/chunk-${String(i).padStart(3,'0')}.sql`
    writeFileSync(part,`insert into private.network_import_chunks(content_sha256,chunk_index,chunk_count,compact_md5,data) values('${digest}',${i},${chunks.length},'${compactMd5}','${chunks[i]}') on conflict(content_sha256,chunk_index) do update set data=excluded.data,chunk_count=excluded.chunk_count,compact_md5=excluded.compact_md5; select ${i+1} as uploaded_chunk;`)
    if (!values['prepare-only']) {runQuery(part);console.log(`Uploaded chunk ${i+1}/${chunks.length}`)}
  }
  process.exit(0)
}
if (values['prepare-only']) process.exit(0)
const parsed = runQuery(file)
const report = { method:'Supabase CLI file-based Management API; existing active administrator; no payload emitted',
  project_ref:'qvkgadxyyzyjeiwjykgr', content_sha256:digest, mode:values.execute?'execute':'dry-run',
  recorded_at:new Date().toISOString(), result:parsed }
writeFileSync(`data/unicasf-review/remote-${values.execute?'execution':'preview'}.json`,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
