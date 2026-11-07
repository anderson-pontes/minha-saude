import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {randomBytes} from 'node:crypto'
import {generateVAPIDKeys} from 'web-push'
const secretFile='.env.agenda.local'
if(!existsSync(secretFile)){
 const keys=generateVAPIDKeys()
 writeFileSync(secretFile,`AGENDA_CRON_SECRET=${randomBytes(32).toString('base64url')}\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=https://minha-saude-cyan.vercel.app\n`,{mode:0o600})
}
const secrets=Object.fromEntries(readFileSync(secretFile,'utf8').trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)]}))
if(!secrets.AGENDA_CRON_SECRET||!secrets.VAPID_PRIVATE_KEY||!secrets.VAPID_PUBLIC_KEY)throw Error('Incomplete agenda secrets')
let env=readFileSync('.env','utf8').replace(/^VITE_VAPID_PUBLIC_KEY=.*\r?\n?/gm,'')
writeFileSync('.env',env.trimEnd()+`\nVITE_VAPID_PUBLIC_KEY=${secrets.VAPID_PUBLIC_KEY}\n`)
mkdirSync('supabase/.temp',{recursive:true})
const quote=value=>"'"+value.replaceAll("'","''")+"'"
let sql='begin;\n'
for(const [name,value]of [['agenda_cron_secret',secrets.AGENDA_CRON_SECRET],['agenda_project_url','https://qvkgadxyyzyjeiwjykgr.supabase.co']]){
 sql+=`do $$declare secret_id uuid;begin select id into secret_id from vault.secrets where name=${quote(name)};if secret_id is null then perform vault.create_secret(${quote(value)},${quote(name)});else perform vault.update_secret(secret_id,${quote(value)});end if;end $$;\n`
}
writeFileSync('supabase/.temp/agenda-cron-secrets.sql',sql+'commit;\n',{mode:0o600})
console.log('Agenda secrets prepared in ignored local files; only public VAPID key added to frontend environment.')
