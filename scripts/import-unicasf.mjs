import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const { values } = parseArgs({ options: {
  file: { type: 'string', multiple: true }, 'from-json': { type: 'string' },
  'dry-run': { type: 'boolean' }, execute: { type: 'boolean' }, strict: { type: 'boolean' },
  report: { type: 'string', default: 'data/unicasf-review/import' },
  'approved-sha256': { type: 'string' }, offline: { type: 'boolean' },
} })
if (values.execute && values['dry-run']) throw new Error('Choose --execute OR --dry-run')
mkdirSync(dirname(values.report), { recursive: true })
if (!values['from-json']) {
  if (!values.file?.length) throw new Error('Use --file (repeatable) or --from-json')
  const child = spawnSync(process.env.PYTHON || 'python', ['scripts/import_unicasf.py', ...values.file.flatMap(f => ['--file', f]), '--report', values.report], { stdio: 'inherit' })
  if (child.status !== 0) process.exit(child.status || 1)
}
const source = values['from-json'] || `${values.report}.json`
const bytes = readFileSync(source)
const digest = createHash('sha256').update(bytes).digest('hex')
const bundle = JSON.parse(bytes.toString('utf8'))
const report = { mode: values.execute ? 'execute' : 'dry-run', content_sha256: digest, extraction: bundle.summary,
  database: null, limitations: [], strict: !!values.strict }
if (values.execute && (values.offline || values['approved-sha256'] !== digest)) {
  throw new Error('Execution requires the exact --approved-sha256 printed by the reviewed dry-run, and database access')
}
if (values.offline) {
  report.limitations.push('Offline extraction only: existing/new database records were not reconciled.')
} else {
  // Dedicated admin access token, never a service-role key or credentials in frontend VITE_*.
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const token = process.env.SUPABASE_ACCESS_JWT
  if (!url || !key || !token) throw new Error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_ACCESS_JWT for an active administrator, or use --offline')
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: profile, error: profileError } = await client.rpc('get_my_profile')
  if (profileError) throw profileError
  if (profile?.role !== 'admin' || profile?.status !== 'active') throw new Error('Active administrator required')
  const { data, error } = await client.rpc(values.execute ? 'execute_network_import' : 'preview_network_import', values.execute
    ? { p_bundle: bundle, p_content_sha256: digest, p_strict: !!values.strict }
    : { p_bundle: bundle })
  if (error) throw error
  report.database = data
}
writeFileSync(`${values.report}.report.json`, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (values.strict && (bundle.entities.some(e => e.status === 'review') || bundle.documents.some(d => d.warnings?.length) || report.database?.review > 0)) {
  console.error('STRICT: unresolved records/documents. Reports were generated; execution is blocked.')
  process.exitCode = 2
}
