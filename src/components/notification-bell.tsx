import {useEffect,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useQueryClient} from '@tanstack/react-query'
import {Bell} from 'lucide-react'
import {Dialog} from './dialog'
import {Button} from './ui/button'
import {useAuth} from '../lib/auth'
import {supabase} from '../lib/supabase'
import {rpc} from '../lib/rpc'
import {useAgendaQuery,localDate,type NotificationResult} from '../lib/agenda'
export function NotificationBell(){
 const [open,setOpen]=useState(false),[page,setPage]=useState(1),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const query=useAgendaQuery<NotificationResult>('agenda_notifications',{p_page:open?page:1})
 const {session}=useAuth(),cache=useQueryClient(),navigate=useNavigate()
 useEffect(()=>{
  if(!session||!supabase)return
  const channel=supabase.channel(`agenda-notifications-${session.user.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'notificacoes',filter:`user_id=eq.${session.user.id}`},()=>{void cache.invalidateQueries({queryKey:['agenda',session.user.id,'agenda_notifications']})}).subscribe()
  // Refresh the inbox when returning to the app; reminders themselves run only on the server.
  const refresh=()=>{if(!document.hidden)void cache.invalidateQueries({queryKey:['agenda',session.user.id,'agenda_notifications']})}
  document.addEventListener('visibilitychange',refresh)
  return()=>{void supabase!.removeChannel(channel);document.removeEventListener('visibilitychange',refresh)}
 },[session,cache])
 async function read(id:string|null,appointment?:string|null){if(busy)return;setBusy(true);setError('');try{await rpc('agenda_read_notifications',{p_id:id});await cache.invalidateQueries({queryKey:['agenda']});if(appointment){setOpen(false);navigate(`/agenda/${appointment}`)}}catch{setError('Não foi possível marcar a notificação como lida. Tente novamente.')}finally{setBusy(false)}}
 return <><Button variant="ghost" className="notification-bell" aria-label={`Notificações${query.data?.unread?`, ${query.data.unread} não lidas`:''}`} onClick={()=>setOpen(true)}><Bell size={20}/>{!!query.data?.unread&&<span className="notification-counter">{query.data.unread>99?'99+':query.data.unread}</span>}</Button>{open&&<Dialog title="Notificações" close={()=>setOpen(false)} className="notifications-dialog"><div className="notification-tools"><Button variant="outline" disabled={busy||!query.data?.unread} onClick={()=>void read(null)}>Marcar todas como lidas</Button><Button variant="ghost" onClick={()=>void query.refetch()}>Atualizar</Button></div>{error&&<p role="alert">{error}</p>}{query.isPending?<p role="status">Carregando notificações…</p>:query.isError?<div role="alert"><p>Não foi possível carregar as notificações.</p><Button onClick={()=>void query.refetch()}>Tentar novamente</Button></div>:query.data.items.length?<div className="notifications-list">{query.data.items.map(n=><article className={n.lida_em?'is-read':'is-unread'} key={n.id}><strong>{n.titulo}</strong><p>{n.mensagem}</p><time>{localDate(n.created_at).toFormat('dd/MM/yyyy HH:mm')}</time><div>{n.agendamento_id&&<Button variant="ghost" disabled={busy} onClick={()=>void read(n.id,n.agendamento_id)}>Abrir agendamento</Button>}{!n.lida_em&&<Button variant="outline" disabled={busy} onClick={()=>void read(n.id)}>Marcar como lida</Button>}</div></article>)}</div>:<p>Você não possui notificações.</p>}{query.data&&query.data.total>20&&<div className="actions"><Button variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span>Página {page}</span><Button variant="outline" disabled={page*20>=query.data.total} onClick={()=>setPage(p=>p+1)}>Próxima</Button></div>}</Dialog>}</>
}
