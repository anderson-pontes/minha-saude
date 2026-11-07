import {useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {Dialog} from './dialog'
import {Button} from './ui/button'
import {FilterSelect} from './filter-select'
import {useAgendaQuery,agendaError,zones,type Preferences} from '../lib/agenda'
import {rpc} from '../lib/rpc'
import {enableDevicePush,disableDevicePush,pushSupport} from '../lib/agenda-push'
export function AgendaPreferences({close}:{close:()=>void}){
 const query=useAgendaQuery<Preferences>('agenda_preferences')
 if(!query.data)return <Dialog title="Preferências da agenda" close={close}><p role={query.isError?'alert':'status'}>{query.isError?'Não foi possível carregar suas preferências.':'Carregando preferências…'}</p>{query.isError&&<Button onClick={()=>void query.refetch()}>Tentar novamente</Button>}</Dialog>
 return <PreferencesForm initial={query.data} close={close}/>
}
function PreferencesForm({initial,close}:{initial:Preferences;close:()=>void}){
 const [draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 const cache=useQueryClient(),supported=pushSupport()
 const denied=supported&&Notification.permission==='denied'
 async function save(){if(busy)return;setBusy(true);setError('');try{await rpc('agenda_preferences',{p_data:draft});await cache.invalidateQueries({queryKey:['agenda']});setMessage('Preferências salvas.')}catch(e){setError(agendaError(e))}finally{setBusy(false)}}
 async function push(enable:boolean){if(busy)return;setBusy(true);setError('');try{if(enable){await enableDevicePush();setDraft(old=>({...old,push_ativo:true}));setMessage('Lembretes push ativados neste dispositivo.')}else{await disableDevicePush();setMessage('Push desativado neste dispositivo. Outros dispositivos mantêm suas preferências.')}await cache.invalidateQueries({queryKey:['agenda']})}catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar o push.')}finally{setBusy(false)}}
 return <Dialog title="Preferências da agenda" close={()=>{if(!busy)close()}} className="agenda-preferences"><form onSubmit={e=>{e.preventDefault();void save()}}><div className="field"><FilterSelect label="Fuso horário padrão" value={draft.timezone} clearable={false} onValueChange={v=>setDraft(old=>({...old,timezone:v}))} options={zones.map(value=>({value,label:value}))}/></div><label className="field">Duração padrão em minutos<input type="number" min={5} max={1440} required value={draft.duracao_padrao} onChange={e=>setDraft(old=>({...old,duracao_padrao:Number(e.target.value)}))}/></label><label className="check-label"><input type="checkbox" checked={draft.lembretes_ativos} onChange={e=>setDraft(old=>({...old,lembretes_ativos:e.target.checked}))}/>Receber lembretes de consultas e exames</label><label className="check-label"><input type="checkbox" checked={draft.push_ativo} onChange={e=>setDraft(old=>({...old,push_ativo:e.target.checked}))}/>Permitir push nos meus dispositivos</label><label className="check-label"><input type="checkbox" checked={draft.antecedencias_padrao.includes(1440)} onChange={e=>setDraft(old=>({...old,antecedencias_padrao:e.target.checked?[...new Set([...old.antecedencias_padrao,1440])]:old.antecedencias_padrao.filter(n=>n!==1440)}))}/>Lembrete padrão 24 horas antes</label>
 <section className="agenda-push-settings"><h3>Notificações neste dispositivo</h3><p>Mensagens genéricas protegem sua privacidade na tela bloqueada. O recebimento depende da permissão, conexão e compatibilidade do navegador.</p><p>No iPhone ou iPad, instale o aplicativo na tela inicial e abra por ele para ativar Web Push.</p>{!supported&&<p role="status">Web Push não está disponível neste navegador. Use a central de notificações.</p>}{denied&&<p role="status">A permissão está bloqueada. Altere as configurações de notificações do navegador para ativar.</p>}<Button type="button" disabled={busy||!supported||denied} onClick={()=>void push(true)}>Ativar lembretes de consultas e exames</Button><Button type="button" variant="outline" disabled={busy||!supported} onClick={()=>void push(false)}>Desativar neste dispositivo</Button></section>
 {error&&<p role="alert">{error}</p>}{message&&<p role="status" className="success">{message}</p>}<div className="actions"><Button type="button" disabled={busy} variant="outline" onClick={close}>Fechar</Button><Button disabled={busy}>Salvar preferências</Button></div></form></Dialog>
}
