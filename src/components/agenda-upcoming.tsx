import {Link} from 'react-router-dom'
import {CalendarDays,ArrowRight} from 'lucide-react'
import {useAgendaQuery,localDate,appointmentTypes,appointmentStatuses,type Upcoming,type Appointment} from '../lib/agenda'
import {Button} from './ui/button'
export function AppointmentRow({appointment:a}:{appointment:Appointment}){
 return <Link to={`/agenda/${a.id}`} className={`appointment-row type-${a.tipo}`}><time dateTime={a.inicio_em}><strong>{localDate(a.inicio_em,a.timezone).toFormat('dd')}</strong><span>{localDate(a.inicio_em,a.timezone).toFormat('MMM')}</span></time><div><span className="appointment-kind">{appointmentTypes[a.tipo]} · {localDate(a.inicio_em,a.timezone).toFormat('HH:mm')}</span><strong>{a.titulo}</strong>{a.medico&&<span>{a.medico}</span>}{a.estabelecimento&&<span>{a.estabelecimento}</span>}</div><span className={`appointment-status status-${a.status}`}>{appointmentStatuses[a.status]}</span><ArrowRight size={16}/></Link>
}
export function UpcomingAppointments(){
 const query=useAgendaQuery<Upcoming>('agenda_upcoming')
 return <section className="agenda-upcoming panel" aria-label="Próximos compromissos"><div className="section-title"><h2><CalendarDays size={20}/>Próximos compromissos</h2><Button asChild variant="ghost"><Link to="/agenda">Abrir agenda <ArrowRight size={16}/></Link></Button></div>
 {query.isPending?<p role="status">Carregando compromissos…</p>:query.isError?<div role="alert"><p>Não foi possível carregar sua agenda.</p><Button variant="outline" onClick={()=>void query.refetch()}>Tentar carregar agenda</Button></div>:<><p>{query.data.week_count} compromissos nos próximos sete dias</p>{query.data.items.length?query.data.items.map(a=><AppointmentRow key={a.id} appointment={a}/>):<div className="agenda-empty"><CalendarDays size={28}/><p>Você ainda não possui agendamentos futuros.</p><Button asChild><Link to="/agenda?novo=1">Agendar consulta ou exame</Link></Button></div>}</>}
 </section>
}
