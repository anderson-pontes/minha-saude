import {AgendaToast} from '../components/agenda-toast'
import {useState} from 'react'
import {useLocation,useNavigate,useSearchParams} from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import luxonPlugin from '@fullcalendar/luxon3'
import ptBR from '@fullcalendar/core/locales/pt-br'
import {DateTime} from 'luxon'
import {CalendarDays,ChevronLeft,ChevronRight,Plus,Settings,Stethoscope,FlaskConical,CheckCircle2} from 'lucide-react'
import {Button} from '../components/ui/button'
import {FilterSelect} from '../components/filter-select'
import {FilterCombobox} from '../components/filter-combobox'
import {AppointmentForm} from '../components/appointment-form'
import {AppointmentRow,UpcomingAppointments} from '../components/agenda-upcoming'
import {AgendaPreferences} from '../components/agenda-preferences'
import {appointmentTypes,appointmentStatuses,useAgendaQuery,type Preferences,type AgendaResult} from '../lib/agenda'

const fallback:Preferences={timezone:'America/Belem',duracao_padrao:30,antecedencias_padrao:[1440],lembretes_ativos:true,push_ativo:false}
type View='month'|'week'|'day'|'list'
export function AgendaPage(){
 const [params,setParams]=useSearchParams(),navigate=useNavigate(),location=useLocation()
 const [message,setMessage]=useState<string>(()=>location.state?.agendaMessage??'')
 const preferences=useAgendaQuery<Preferences>('agenda_preferences')
 const prefs=preferences.data??fallback
 const [view,setView]=useState<View>(()=>window.matchMedia('(max-width:639px)').matches?'list':'month')
 const [anchor,setAnchor]=useState(()=>DateTime.now().setZone('America/Belem').toISODate()!)
 const [customFrom,setCustomFrom]=useState(''),[customTo,setCustomTo]=useState('')
 const [filters,setFilters]=useState<Record<string,string>>({}),[page,setPage]=useState(1),[settings,setSettings]=useState(false),[newDate,setNewDate]=useState<string|null>(null)
 const day=DateTime.fromISO(anchor,{zone:prefs.timezone}).setLocale('pt-BR')
 let from=day.startOf(view==='day'?'day':view==='week'?'week':'month'),to=from.plus(view==='day'?{days:1}:view==='week'?{weeks:1}:{months:1})
 if(view==='month'){from=from.startOf('week');to=to.minus({days:1}).endOf('week').plus({days:1}).startOf('day')}
 if(view==='list'&&customFrom)from=DateTime.fromISO(customFrom,{zone:prefs.timezone}).startOf('day')
 if(view==='list'&&customTo)to=DateTime.fromISO(customTo,{zone:prefs.timezone}).plus({days:1}).startOf('day')
 const valid=from.isValid&&to.isValid&&to>from&&to.diff(from,'days').days<=370
 const query=useAgendaQuery<AgendaResult>('agenda_browse',{p_from:from.toUTC().toISO(),p_to:to.toUTC().toISO(),p_filters:filters,p_page:page,p_size:view==='month'||view==='week'?200:40},valid)
 function filter(key:string,value:string){setFilters(old=>({...old,[key]:value,...key==='status'?{upcoming:''}:{}}));setPage(1)}
 function move(direction:number){setAnchor(day.plus(view==='day'?{days:direction}:view==='week'?{weeks:direction}:{months:direction}).toISODate()!);setPage(1);setCustomFrom('');setCustomTo('')}
 function mode(next:View){setView(next);setPage(1)}
 function closeForm(){setNewDate(null);if(params.has('novo')){params.delete('novo');setParams(params,{replace:true})}}
 const showForm=newDate!==null||params.has('novo')
 const rows=query.data?.items??[],summary=query.data?.summary
 const metrics=[{key:'proximos',label:'Próximos agendamentos',icon:CalendarDays,click:()=>filter('upcoming','true')},{key:'consultas',label:'Consultas agendadas',icon:Stethoscope,click:()=>{setFilters(old=>({...old,tipo:'consulta',status:'ativos',upcoming:''}));setPage(1)}},{key:'exames',label:'Exames agendados',icon:FlaskConical,click:()=>{setFilters(old=>({...old,tipo:'exame',status:'ativos',upcoming:''}));setPage(1)}},{key:'realizados',label:'Atendimentos realizados',icon:CheckCircle2,click:()=>{setFilters(old=>({...old,status:'realizado',upcoming:''}));setPage(1)}}] as const
 return <div className="agenda-page"><AgendaToast message={message} dismiss={()=>setMessage('')}/><div className="directory-heading"><div className="page-heading"><span className="eyebrow">SEU TEMPO DE CUIDADO</span><h1>Agenda de Saúde</h1><p>Organize suas consultas, exames e compromissos médicos.</p></div><div className="agenda-heading-actions"><Button variant="outline" onClick={()=>setSettings(true)}><Settings size={17}/>Preferências</Button><Button onClick={()=>setNewDate(anchor)}><Plus size={18}/>Novo agendamento</Button></div></div>
 <p className="agenda-scope">Indicadores de {from.toFormat('dd/MM/yyyy')} a {to.minus({days:1}).toFormat('dd/MM/yyyy')} · {prefs.timezone}. Respeitam os filtros abaixo.</p>
 <div className="agenda-metrics">{metrics.map(({key,label,icon:Icon,click})=><button key={key} type="button" className={`panel agenda-metric metric-${key}`} onClick={click}><Icon size={20}/><strong>{summary?.[key]??'—'}</strong><span>{label}</span></button>)}</div>
 <section className="panel agenda-main"><div className="agenda-toolbar"><div className="agenda-period"><Button variant="outline" onClick={()=>{setAnchor(DateTime.now().setZone(prefs.timezone).toISODate()!);setCustomFrom('');setCustomTo('');setPage(1)}}>Hoje</Button><Button variant="ghost" aria-label="Período anterior" onClick={()=>move(-1)}><ChevronLeft size={20}/></Button><h2>{view==='day'?day.toFormat('dd MMMM yyyy'):view==='week'?`${from.toFormat('dd MMM')} – ${to.minus({days:1}).toFormat('dd MMM yyyy')}`:day.toFormat('MMMM yyyy')}</h2><Button variant="ghost" aria-label="Próximo período" onClick={()=>move(1)}><ChevronRight size={20}/></Button></div><div className="agenda-views" role="group" aria-label="Visualização da agenda">{([['month','Mês'],['week','Semana'],['day','Dia'],['list','Lista']] as const).map(([key,label])=><Button key={key} variant={view===key?'default':'ghost'} aria-pressed={view===key} onClick={()=>mode(key)}>{label}</Button>)}</div></div>
 {filters.upcoming==='true'&&<Button variant="outline" onClick={()=>filter('upcoming','')}>Somente próximos · Remover filtro</Button>}
 <div className="agenda-filter-grid"><FilterSelect label="Tipo de atendimento" placeholder="Todos os tipos" value={filters.tipo??''} onValueChange={v=>filter('tipo',v)} options={Object.entries(appointmentTypes).map(([value,label])=>({value,label}))}/><FilterSelect label="Status" placeholder="Todos os status" value={filters.status??''} onValueChange={v=>filter('status',v)} options={[{value:'ativos',label:'Agendado ou confirmado'},...Object.entries(appointmentStatuses).map(([value,label])=>({value,label}))]}/><FilterCombobox label="Filtrar médico" all="Todos os profissionais" source="doctors" value={filters.medico_id??''} onChange={v=>filter('medico_id',v)}/><FilterCombobox label="Filtrar estabelecimento" all="Todos os estabelecimentos" source="establishments" value={filters.estabelecimento_id??''} onChange={v=>filter('estabelecimento_id',v)}/><FilterCombobox label="Filtrar convênio" all="Todos os convênios" source="health_plans" value={filters.convenio_id??''} onChange={v=>filter('convenio_id',v)}/><Button variant="ghost" onClick={()=>{setFilters({});setPage(1)}}>Limpar filtros da agenda</Button></div>
 {view==='list'&&<div className="agenda-date-range"><label>De<input type="date" value={customFrom||from.toISODate()!} onChange={e=>{setCustomFrom(e.target.value);setPage(1)}}/></label><label>Até<input type="date" value={customTo||to.minus({days:1}).toISODate()!} onChange={e=>{setCustomTo(e.target.value);setPage(1)}}/></label></div>}
 {!valid?<p role="alert">Escolha um intervalo válido de até um ano.</p>:query.isPending?<div className="agenda-calendar-skeleton" role="status">Carregando agenda…</div>:query.isError?<div className="agenda-empty" role="alert"><p>Não foi possível carregar os compromissos deste período.</p><Button onClick={()=>void query.refetch()}>Tentar carregar período</Button></div>:<>
 {(view==='month'||view==='week')?<div className="agenda-calendar"><FullCalendar key={`${view}-${anchor}-${prefs.timezone}`} plugins={[dayGridPlugin,timeGridPlugin,interactionPlugin,luxonPlugin]} locale={ptBR} timeZone={prefs.timezone} firstDay={1} initialView={view==='month'?'dayGridMonth':'timeGridWeek'} initialDate={anchor} headerToolbar={false} height={view==='week'?680:'auto'} fixedWeekCount={false} allDaySlot={false} nowIndicator slotEventOverlap={false} slotDuration="00:30:00" scrollTime="07:00:00" dayMaxEvents={3} eventMaxStack={3} eventTimeFormat={{hour:'2-digit',minute:'2-digit',hour12:false}} eventClassNames={arg=>[`type-${arg.event.extendedProps.tipo}`,`event-${arg.event.extendedProps.status}`]} events={rows.map(a=>({id:a.id,title:`${a.titulo} · ${appointmentStatuses[a.status]}`,start:a.inicio_em,end:a.fim_em,extendedProps:{tipo:a.tipo,status:a.status}}))} eventClick={arg=>navigate(`/agenda/${arg.event.id}`)} dateClick={arg=>setNewDate(arg.dateStr.slice(0,10))}/></div>:rows.length?<div className="agenda-list">{rows.map((a,i)=><div key={a.id}>{(i===0||DateTime.fromISO(rows[i-1].inicio_em,{zone:prefs.timezone}).toISODate()!==DateTime.fromISO(a.inicio_em,{zone:prefs.timezone}).toISODate())&&<h3>{DateTime.fromISO(a.inicio_em,{zone:prefs.timezone}).setLocale('pt-BR').toFormat('cccc, dd MMMM')}</h3>}<AppointmentRow appointment={a}/></div>)}</div>:<div className="agenda-empty"><CalendarDays size={32}/><h3>Nenhum compromisso neste período.</h3><p>Organize o seu próximo cuidado.</p><Button onClick={()=>setNewDate(anchor)}>Agendar consulta ou exame</Button></div>}
 {query.data.total>(view==='month'||view==='week'?200:40)&&<div className="agenda-pagination"><span>{query.data.total} compromissos · página {page}</span><Button variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><Button variant="outline" disabled={page*(view==='month'||view==='week'?200:40)>=query.data.total} onClick={()=>setPage(p=>p+1)}>Próxima</Button></div>}
 </>}
 </section><UpcomingAppointments/>
 {showForm&&<AppointmentForm initialDate={newDate??anchor} preferences={prefs} close={closeForm} saved={id=>{closeForm();navigate(`/agenda/${id}`,{state:{agendaSaved:true}})}}/>}
 {settings&&<AgendaPreferences close={()=>setSettings(false)}/>}
 </div>
}
