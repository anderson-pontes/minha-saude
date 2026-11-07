import {DateTime} from 'luxon'
import {z} from 'zod'
import {useQuery} from '@tanstack/react-query'
import {useAuth} from './auth'
import {useAccess} from './access'
import {readQueryPolicy,retryRead} from './requests'
import {rpc} from './rpc'
import type {Address,Contact} from './network'
export const appointmentTypes={consulta:'Consulta médica',exame:'Exame',retorno:'Retorno',procedimento:'Procedimento',vacinacao:'Vacinação',outro:'Outro'}
export const appointmentStatuses={agendado:'Agendado',confirmado:'Confirmado',realizado:'Realizado',cancelado:'Cancelado',nao_compareceu:'Não compareceu'}
export const zones=['America/Belem','America/Sao_Paulo','America/Manaus','America/Rio_Branco','UTC']
export const reminderOptions=[{value:2880,label:'48 horas antes'},{value:1440,label:'24 horas antes'},{value:720,label:'12 horas antes'},{value:120,label:'2 horas antes'},{value:60,label:'1 hora antes'},{value:30,label:'30 minutos antes'}]
export type Appointment={id:string;user_id?:string;tipo:keyof typeof appointmentTypes;titulo:string;descricao:string;inicio_em:string;fim_em:string;timezone:string;medico_id:string|null;especialidade_id:string|null;estabelecimento_id:string|null;convenio_id:string|null;status:keyof typeof appointmentStatuses;protocolo:string;observacoes:string;orientacoes_preparo:string;antecedencias:number[];revisao:number;medico?:string;especialidade?:string;estabelecimento?:string;convenio?:string;addresses?:Address[];contacts?:Contact[];reminders?:{id:string;canal:string;status:string;antecedencia_minutos:number;executar_em:string;entrega:string}[]}
export type Preferences={lembretes_ativos:boolean;push_ativo:boolean;timezone:string;antecedencias_padrao:number[];duracao_padrao:number}
export type AgendaResult={items:Appointment[];total:number;summary:{proximos:number;consultas:number;exames:number;realizados:number}}
export type Upcoming={items:Appointment[];week_count:number}
export type HealthNotification={id:string;agendamento_id:string|null;titulo:string;mensagem:string;created_at:string;lida_em:string|null}
export type NotificationResult={items:HealthNotification[];total:number;unread:number}
const appointmentShape=z.object({id:z.string(),tipo:z.string(),titulo:z.string(),inicio_em:z.string(),fim_em:z.string(),timezone:z.string(),status:z.string(),antecedencias:z.array(z.number()),revisao:z.number()}).passthrough()
const agendaShapes={
 agenda_upcoming:z.object({items:z.array(appointmentShape),week_count:z.number()}),
 agenda_browse:z.object({items:z.array(appointmentShape),total:z.number(),summary:z.object({proximos:z.number(),consultas:z.number(),exames:z.number(),realizados:z.number()})}),
 agenda_detail:appointmentShape.extend({addresses:z.array(z.object({}).passthrough()),contacts:z.array(z.object({}).passthrough()),reminders:z.array(z.object({}).passthrough())}).nullable(),
 agenda_notifications:z.object({items:z.array(z.object({id:z.string(),agendamento_id:z.string().nullable(),titulo:z.string(),mensagem:z.string(),created_at:z.string(),lida_em:z.string().nullable()})),total:z.number(),unread:z.number()}),
 agenda_preferences:z.object({lembretes_ativos:z.boolean(),push_ativo:z.boolean(),timezone:z.string(),antecedencias_padrao:z.array(z.number()),duracao_padrao:z.number()}),
}
export function useAgendaQuery<T>(fn:string,args:Record<string,unknown>={},enabled=true){
 const {session}=useAuth();const {canRead}=useAccess()
 return useQuery({...readQueryPolicy,retry:(count,error)=>(error as {code?:string}).code!=='INVALID_AGENDA_RESPONSE'&&retryRead(count,error),queryKey:['agenda',session?.user.id,fn,args],enabled:enabled&&!!session&&canRead,queryFn:async({signal})=>{
  const result=await rpc<T>(fn,args,{signal}),shape=agendaShapes[fn as keyof typeof agendaShapes]
  if(shape&&!shape.safeParse(result).success)throw Object.assign(new Error('Resposta inválida da agenda'),{code:'INVALID_AGENDA_RESPONSE'})
  return result
 }})
}
export function localDate(iso:string,zone='America/Belem'){return DateTime.fromISO(iso,{zone}).setLocale('pt-BR')}
export function localToUTC(date:string,time:string,zone:string){
 const raw=`${date}T${time}`, parsed=DateTime.fromISO(raw,{zone})
 if(!parsed.isValid||parsed.toFormat("yyyy-MM-dd'T'HH:mm")!==raw)throw new Error('Data ou horário inválido para o fuso selecionado.')
 return parsed.toUTC().toISO()!
}
export function agendaError(error:unknown){const e=error as {message?:string;code?:string};if(e.message?.includes('Conflito de horário')||e.message?.includes('outra sessão'))return e.message;if(e.code==='23503')return 'Um cadastro vinculado não está mais disponível. Revise os campos.';if(e.code==='23514')return 'Revise o título, o intervalo de horários e os lembretes.';if(e.code==='42501')return 'Você não tem acesso a este compromisso.';return 'Não foi possível concluir. Confira sua conexão e tente novamente.'}
function escapeICS(value:string){return value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,')}
function utcStamp(iso:string){return DateTime.fromISO(iso).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")}
export function appointmentICS(a:Appointment){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Minha Saude//Agenda//PT-BR','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',`UID:${a.id}@minha-saude`,`DTSTAMP:${utcStamp(new Date().toISOString())}`,`SEQUENCE:${a.revisao}`,`DTSTART:${utcStamp(a.inicio_em)}`,`DTEND:${utcStamp(a.fim_em)}`,`SUMMARY:${escapeICS(a.titulo)}`,`LOCATION:${escapeICS(a.estabelecimento??'')}`,`DESCRIPTION:${escapeICS([a.observacoes,a.orientacoes_preparo].filter(Boolean).join('\n'))}`,`STATUS:${a.status==='cancelado'?'CANCELLED':'CONFIRMED'}`,'END:VEVENT','END:VCALENDAR']
 return lines.map(line=>{const result:string[]=[];let part='';for(const char of line){if(new TextEncoder().encode(part+char).length>73){result.push(part);part=' '+char}else part+=char}result.push(part);return result.join('\r\n')}).join('\r\n')+'\r\n'
}
export function downloadICS(a:Appointment){const url=URL.createObjectURL(new Blob([appointmentICS(a)],{type:'text/calendar;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='agendamento.ics';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export function externalCalendar(a:Appointment,provider:'google'|'outlook'){
 const url=new URL(provider==='google'?'https://calendar.google.com/calendar/render':'https://outlook.live.com/calendar/0/deeplink/compose')
 const params=provider==='google'?{action:'TEMPLATE',text:a.titulo,dates:`${utcStamp(a.inicio_em)}/${utcStamp(a.fim_em)}`,ctz:a.timezone,location:a.estabelecimento??''}:{path:'/calendar/action/compose',rru:'addevent',subject:a.titulo,startdt:DateTime.fromISO(a.inicio_em).toUTC().toISO()!,enddt:DateTime.fromISO(a.fim_em).toUTC().toISO()!,location:a.estabelecimento??''}
 for(const [key,value]of Object.entries(params))url.searchParams.set(key,value)
 return url.href
}
