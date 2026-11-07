import {useEffect,useId,useRef,useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {DateTime} from 'luxon'
import {Dialog} from './dialog'
import {Button} from './ui/button'
import {FilterSelect} from './filter-select'
import {FilterCombobox} from './filter-combobox'
import {appointmentTypes,appointmentStatuses,reminderOptions,zones,localDate,localToUTC,agendaError,type Appointment,type Preferences} from '../lib/agenda'
import {rpc,type Entity} from '../lib/network'
import {setFormUnsaved} from '../lib/unsaved'
import {useBeforeUnload,useBlocker} from 'react-router-dom'

export function AppointmentForm({appointment,initialDate,preferences,close,saved}:{appointment?:Appointment;initialDate?:string;preferences:Preferences;close:()=>void;saved:(id:string)=>void}){
 const [id]=useState(()=>appointment?.id??crypto.randomUUID())
 const zone=appointment?.timezone??preferences.timezone
 const start=appointment?localDate(appointment.inicio_em,zone):DateTime.now().setZone(zone).plus({hours:1}).startOf('hour')
 const [draft,setDraft]=useState(()=>({tipo:appointment?.tipo??'consulta',titulo:appointment?.titulo??'',date:initialDate??start.toISODate()!,time:start.toFormat('HH:mm'),end:appointment?localDate(appointment.fim_em,zone).toFormat('HH:mm'):'',endDate:appointment?localDate(appointment.fim_em,zone).toISODate()!:(initialDate??start.toISODate()!),timezone:zone,medico_id:appointment?.medico_id??'',especialidade_id:appointment?.especialidade_id??'',estabelecimento_id:appointment?.estabelecimento_id??'',convenio_id:appointment?.convenio_id??'',status:appointment?.status??'agendado',protocolo:appointment?.protocolo??'',descricao:appointment?.descricao??'',observacoes:appointment?.observacoes??'',orientacoes_preparo:appointment?.orientacoes_preparo??'',antecedencias:appointment?.antecedencias??preferences.antecedencias_padrao}))
 const [initial,setInitial]=useState(()=>JSON.stringify(draft))
 const busyRef=useRef(false),sequence=useRef(0),formId=useId()
 const committed=useRef(false)
 const dirty=JSON.stringify(draft)!==initial
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(false),[discard,setDiscard]=useState(false),[custom,setCustom]=useState('')
 const [doctor,setDoctor]=useState<Entity|null>(null),[clinic,setClinic]=useState<Entity|null>(null),[lookupError,setLookupError]=useState('')
 const cache=useQueryClient()
 useEffect(()=>{setFormUnsaved(formId,dirty);return()=>setFormUnsaved(formId,false)},[formId,dirty])
 useBeforeUnload(event=>{if(dirty&&!committed.current){event.preventDefault();event.returnValue=''}})
 const blocker=useBlocker(({currentLocation,nextLocation})=>dirty&&!committed.current&&(currentLocation.pathname!==nextLocation.pathname||currentLocation.search!==nextLocation.search))
 function update<K extends keyof typeof draft>(key:K,value:typeof draft[K]){setDraft(old=>({...old,[key]:value}));setConflict(false);setError('')}
 async function chooseDoctor(value:string){
  update('medico_id',value);setDoctor(null);setLookupError('');const current=++sequence.current
  if(!value)return
  try{const doc=await rpc<Entity>('network_document',{p_type:'doctors',p_id:value},{})
   if(current!==sequence.current)return
   setDoctor(doc)
   setDraft(old=>old.medico_id===value?{...old,especialidade_id:old.especialidade_id||(doc.specialties?.length===1?doc.specialties[0].id??'':''),estabelecimento_id:old.estabelecimento_id||(doc.establishments?.length===1?doc.establishments[0].id??'':'')}:old)
  }catch{if(current===sequence.current)setLookupError('Não foi possível carregar as sugestões do profissional. Você pode selecionar os vínculos manualmente.')}
 }
 async function chooseClinic(value:string){update('estabelecimento_id',value);setClinic(null);if(!value)return;try{const data=await rpc<Entity>('network_document',{p_type:'establishments',p_id:value},{});setClinic(data)}catch{setLookupError('Não foi possível consultar endereço e contatos do local agora.')}}
 function requestClose(){if(busyRef.current)return;if(dirty)setDiscard(true);else close()}
 async function save(allow=false){
  if(busyRef.current)return
  setError('');setConflict(false)
  try{
   const starts=localToUTC(draft.date,draft.time,draft.timezone)
   const ends=draft.end?localToUTC(draft.endDate||draft.date,draft.end,draft.timezone):DateTime.fromISO(starts).plus({minutes:preferences.duracao_padrao}).toUTC().toISO()!
   if(DateTime.fromISO(ends).toMillis()<=DateTime.fromISO(starts).toMillis()){setError('O horário final deve ser posterior ao início.');return}
   busyRef.current=true;setBusy(true)
   const result=await rpc<string>('agenda_save',{p_id:id,p_revision:appointment?.revisao??null,p_allow_conflict:allow,p_data:{...draft,inicio_em:starts,fim_em:ends}})
   committed.current=true;setInitial(JSON.stringify(draft));setFormUnsaved(formId,false)
   await cache.invalidateQueries({queryKey:['agenda']});saved(result)
  }catch(e){const message=agendaError(e);setError(message);if(message.includes('Conflito de horário'))setConflict(true)}finally{busyRef.current=false;setBusy(false)}
 }
 return <Dialog title={appointment?'Editar agendamento':'Novo agendamento'} close={requestClose} className="appointment-dialog"><form onSubmit={e=>{e.preventDefault();void save()}}><div className="appointment-form-scroll">
 <p className="muted">Os dados desta agenda são pessoais. Horários no fuso {draft.timezone}.</p>
 <section><h3>Seu compromisso</h3><div className="filter-grid">
 <FilterSelect label="Tipo de compromisso" value={draft.tipo} clearable={false} onValueChange={v=>update('tipo',v as typeof draft.tipo)} options={Object.entries(appointmentTypes).map(([value,label])=>({value,label}))}/>
 <div className="field"><label htmlFor={`${formId}-title`}>Título do agendamento</label><input id={`${formId}-title`} required maxLength={200} value={draft.titulo} onChange={e=>update('titulo',e.target.value)}/></div>
 <div className="field"><label htmlFor={`${formId}-date`}>Data</label><input id={`${formId}-date`} type="date" required value={draft.date} onChange={e=>setDraft(old=>({...old,date:e.target.value,endDate:e.target.value}))}/></div>
 <div className="field"><label htmlFor={`${formId}-time`}>Horário inicial</label><input id={`${formId}-time`} type="time" required value={draft.time} onChange={e=>update('time',e.target.value)}/></div>
 <div className="field"><label htmlFor={`${formId}-end-date`}>Data final</label><input id={`${formId}-end-date`} type="date" value={draft.endDate} onChange={e=>update('endDate',e.target.value)}/></div>
 <div className="field"><label htmlFor={`${formId}-end`}>Horário final (opcional)</label><input id={`${formId}-end`} type="time" value={draft.end} onChange={e=>update('end',e.target.value)}/><small>Sem horário final: {preferences.duracao_padrao} minutos.</small></div>
 <FilterSelect label="Fuso horário" value={draft.timezone} clearable={false} onValueChange={v=>update('timezone',v)} options={zones.map(value=>({value,label:value.replace('America/','').replaceAll('_',' ')}))}/>
 <FilterSelect label="Status do agendamento" value={draft.status} clearable={false} onValueChange={v=>update('status',v as typeof draft.status)} options={Object.entries(appointmentStatuses).map(([value,label])=>({value,label}))}/>
 </div></section>
 <section><h3>Profissional e local</h3><div className="filter-grid">
 <FilterCombobox label="Médico ou profissional" source="doctors" value={draft.medico_id} onChange={v=>void chooseDoctor(v)} all="Sem profissional"/>
 <FilterCombobox label="Especialidade" source="specialties" value={draft.especialidade_id} onChange={v=>update('especialidade_id',v)} all="Sem especialidade"/>
 <FilterCombobox label="Estabelecimento" source="establishments" value={draft.estabelecimento_id} onChange={v=>void chooseClinic(v)} all="Sem estabelecimento"/>
 <FilterCombobox label="Convênio" source="health_plans" value={draft.convenio_id} onChange={v=>update('convenio_id',v)} all="Sem convênio"/>
 </div>{lookupError&&<p role="status">{lookupError}</p>}{doctor&&<div className="agenda-suggestions"><p>Vínculos cadastrados para {doctor.name}</p>{doctor.establishments?.slice(0,10).map(e=><Button key={e.id} type="button" variant="outline" onClick={()=>void chooseClinic(e.id!)}>{e.name}</Button>)}{doctor.specialties?.slice(0,10).map(s=><Button key={s.id} type="button" variant="ghost" onClick={()=>update('especialidade_id',s.id!)}>{s.name}</Button>)}</div>}
 {clinic?.id===draft.estabelecimento_id&&clinic&&<div className="agenda-location"><strong>{clinic.name}</strong>{clinic.addresses?.slice(0,3).map((a,i)=><p key={i}>{[a.street,a.number,a.neighborhood,a.city,a.state].filter(Boolean).join(', ')}</p>)}{clinic.contacts?.slice(0,3).map((c,i)=><p key={i}>{c.label||c.kind}: {c.value}</p>)}</div>}
 </section>
 <section><h3>Lembretes</h3><p>O padrão é 24 horas exatas antes do início. Escolha até 12 lembretes.</p><div className="reminder-options">{reminderOptions.map(o=><label key={o.value}><input type="checkbox" checked={draft.antecedencias.includes(o.value)} onChange={e=>update('antecedencias',e.target.checked?[...new Set([...draft.antecedencias,o.value])]:draft.antecedencias.filter(v=>v!==o.value))}/>{o.label}</label>)}</div>
 <div className="agenda-custom-reminder"><label htmlFor={`${formId}-custom`}>Personalizado (minutos antes)</label><input id={`${formId}-custom`} type="number" min={1} max={525600} value={custom} onChange={e=>setCustom(e.target.value)}/><Button type="button" variant="outline" disabled={!Number.isInteger(Number(custom))||Number(custom)<1||Number(custom)>525600||draft.antecedencias.length>=12} onClick={()=>{update('antecedencias',[...new Set([...draft.antecedencias,Number(custom)])]);setCustom('')}}>Adicionar lembrete</Button></div>
 {draft.antecedencias.filter(v=>!reminderOptions.some(o=>o.value===v)).map(v=><Button type="button" variant="ghost" key={v} onClick={()=>update('antecedencias',draft.antecedencias.filter(n=>n!==v))}>{v} minutos antes · Remover</Button>)}{!draft.antecedencias.length&&<p>Este compromisso está sem lembretes.</p>}
 </section>
 <section><h3>Informações adicionais</h3><div className="field"><label htmlFor={`${formId}-protocol`}>Número de protocolo (opcional)</label><input id={`${formId}-protocol`} maxLength={200} value={draft.protocolo} onChange={e=>update('protocolo',e.target.value)}/></div>
 {(['descricao','observacoes','orientacoes_preparo'] as const).map((key,i)=><div className="field" key={key}><label htmlFor={`${formId}-${key}`}>{['Descrição','Observações','Orientações ou preparo do exame'][i]}</label><textarea id={`${formId}-${key}`} maxLength={key==='descricao'?4000:8000} rows={3} value={draft[key]} onChange={e=>update(key,e.target.value)}/></div>)}
 </section></div><footer className="appointment-form-footer">{error&&<p role="alert">{error}</p>}{discard||blocker.state==='blocked'?<div role="alert"><p>Descartar as alterações deste agendamento?</p><Button type="button" variant="outline" onClick={()=>{setDiscard(false);if(blocker.state==='blocked')blocker.reset()}}>Continuar editando</Button><Button type="button" onClick={()=>{if(blocker.state==='blocked')blocker.proceed();else close()}}>Descartar alterações</Button></div>:<div><Button type="button" variant="outline" disabled={busy} onClick={requestClose}>Cancelar</Button>{conflict&&<Button type="button" disabled={busy} onClick={()=>void save(true)}>Salvar mesmo assim</Button>}<Button disabled={busy||!draft.titulo.trim()} type="submit">{busy?'Salvando…':'Salvar agendamento'}</Button></div>}</footer></form></Dialog>
}
