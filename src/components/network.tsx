import { Dialog } from './dialog'
export { Dialog } from './dialog'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Globe, Heart, Mail, MapPin, MessageCircle, Pencil, Phone, Trash2, MoreHorizontal, LoaderCircle, ShieldCheck, Building2, Stethoscope, ArrowRight } from 'lucide-react'
import { Button } from './ui/button'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useAccess } from '../lib/access'
import { categories, contactLink, errorMessage, kinds } from '../lib/network'
import type { Category, Contact, Entity } from '../lib/network'
import { displayContactValue } from '../lib/contact-utils'

export function QueryError({ error, retry }: { error: unknown; retry: () => void }) {
  return <div role="alert" className="notice"><strong>Não foi possível carregar seus registros</strong><p>{errorMessage(error)}</p><Button type="button" variant="outline" onClick={retry}>Tentar novamente</Button></div>
}
export function ContactActions({ contact }: { contact: Contact }) {
  const [message,setMessage]=useState('')
  const href=contactLink(contact)
  const Icon=contact.kind==='whatsapp'?MessageCircle:contact.kind==='email'?Mail:contact.kind==='website'?Globe:Phone
  return <div className="contact-actions">{href && <a className={`button ${contact.kind==='whatsapp'?'button-primary':'button-outline'}`} href={href} target={href.startsWith('https:') || href.startsWith('http:') ? '_blank' : undefined} rel="noopener noreferrer"><Icon size={16}/>{contact.kind==='whatsapp'?'WhatsApp':contact.kind==='email'?'Enviar e-mail':contact.kind==='website'?'Abrir site':'Ligar'}</a>}<Button type="button" variant="ghost" onClick={async()=>{try { await navigator.clipboard.writeText(displayContactValue(contact)); setMessage('Copiado') } catch { setMessage('Não foi possível copiar') }}}>Copiar</Button>{message && <small role="status">{message}</small>}</div>
}
export function EntityActions({ category, entity, onDeleted, compact=false }: { category: Category; entity: Entity; onDeleted?: () => void; compact?:boolean }) {
  const { canAdmin }=useAccess();
  const { session }=useAuth(); const client=useQueryClient(); const navigate=useNavigate()
  const [confirm,setConfirm]=useState(false); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [failure,setFailure]=useState('')
  const favoriteCategory=category==='doctors'||category==='establishments'
  async function favorite() {
    if(busy)return; setBusy(true);setFailure('')
    try {
      const fk=category==='doctors'?'doctor_id':'establishment_id'
      const result=entity.favorite
        ? await supabase!.from('favorites').delete().eq(fk,entity.id!).eq('user_id',session!.user.id).select('id')
        : await supabase!.from('favorites').insert({[fk]:entity.id,user_id:session!.user.id}).select('id')
      if(result.error)throw result.error
      setMessage(entity.favorite?'Removido dos favoritos.':'Adicionado aos favoritos.')
      await client.invalidateQueries()
    }catch(e){setFailure(errorMessage(e))}finally{setBusy(false)}
  }
  async function remove() {
    if(busy)return;setBusy(true);setFailure('')
    try {
      const {data,error}=await supabase!.from(category).delete().eq('id',entity.id!).select('id').single()
      if(error)throw error
      if(!data)throw new Error('Registro indisponível')
      setConfirm(false);await client.invalidateQueries()
      if(onDeleted)onDeleted();else navigate('/cadastros',{state:{message:'Registro excluído com sucesso.'}})
    }catch(e){setFailure(errorMessage(e))}finally{setBusy(false)}
  }
  return <><div className={`entity-actions ${compact?'compact-actions':''}`}>{favoriteCategory && <Button className={compact?'card-favorite':''} variant="ghost" disabled={busy} aria-busy={busy} aria-label={entity.favorite?'Desfavoritar':'Favoritar'} aria-pressed={!!entity.favorite} onClick={()=>void favorite()}>{busy?<LoaderCircle size={18} className="spin"/>:<Heart size={18} fill={entity.favorite?'currentColor':'none'}/>}</Button>}{canAdmin && (compact?<details className="secondary-menu"><summary aria-label={`Mais opções para ${entity.name}`}><MoreHorizontal size={19}/></summary><div><Link to={`${categories[category].path}/${entity.id}/editar`}><Pencil size={15}/>Editar</Link><button type="button" disabled={busy} onClick={()=>{setFailure('');setConfirm(true)}}><Trash2 size={15}/>Excluir</button></div></details>:<>{canAdmin && <Button asChild variant="outline"><Link to={`${categories[category].path}/${entity.id}/editar`}><Pencil size={16}/>Editar</Link></Button>} {canAdmin && <Button variant="ghost" disabled={busy} aria-label={`Excluir ${entity.name}`} onClick={()=>{setFailure('');setConfirm(true)}}><Trash2 size={17}/></Button>}</>)}</div>{message && <p role="status" className="success">{message}</p>}{failure && !confirm && <p role="alert" className="field-error">{failure}</p>}{canAdmin && confirm && <Dialog title="Excluir cadastro?" close={()=>{if(!busy)setConfirm(false)}}><p>Excluir “{entity.name}”? Os vínculos e dados próprios serão removidos. Os demais cadastros da rede serão preservados.</p>{failure && <p role="alert" className="field-error">{failure}</p>}<div className="form-actions"><Button variant="outline" disabled={busy} onClick={()=>setConfirm(false)}>Cancelar</Button><Button disabled={busy} onClick={()=>void remove()}>{busy?'Excluindo…':'Confirmar exclusão'}</Button></div></Dialog>}</>
}
export function EntityCard({category,entity,onDeleted}:{category:Category;entity:Entity;onDeleted?:()=>void}) {
  const href=`${categories[category].path}/${entity.id}`
  const address=entity.addresses?.find(a=>a.is_primary)??entity.addresses?.[0]
  const specialties=entity.specialties??[]
  const extraSpecialties=Math.max(0,(entity.specialties_count??specialties.length)-2)
  const establishments=entity.establishments??[]
  const extraEstablishments=Math.max(0,(entity.establishments_count??establishments.length)-1)
  const places=entity.cities?.map(c=>`${c.city}/${c.state}`).join(' · ')
  const location=address?[address.neighborhood,address.city,address.state].filter(Boolean).join(' · '):''
  const plans=entity.health_plans??[]
  const extras=Math.max(0,(entity.health_plans_count??plans.length)-1)
  if(category==='health_plans')return <article className="entity-card plan-card" aria-label={entity.name}>
    <div className="plan-card-top"><span className="plan-icon"><ShieldCheck size={21}/></span><span className={entity.active===false?'inactive':'active-badge'}>{entity.active===false?'Inativo':'Ativo'}</span></div>
    <div className="plan-identity"><Link className="record-title" to={href} title={entity.name}><h2 className="clamp-two">{entity.name}</h2></Link>{entity.operator_name&&<p className="clamp-two" title={entity.operator_name}>{entity.operator_name}</p>}{entity.plan_registration&&<p className="card-registration">Registro: {entity.plan_registration}</p>}</div>
    <div className="plan-card-metrics"><div><Building2 size={16}/><strong>{entity.establishments_count?.toLocaleString('pt-BR')??'Consultar total'}</strong><span>Estabelecimentos</span></div><div><Stethoscope size={16}/><strong>{entity.doctors_count?.toLocaleString('pt-BR')??'Consultar total'}</strong><span>Profissionais</span></div></div>
    {places&&<p className="card-location" title={places}><MapPin size={14}/><span className="clamp-two">{places}{(entity.cities_count??0)>3&&` +${entity.cities_count!-3} cidades`}</span></p>}
    <footer className="compact-card-footer"><Link className="button button-primary plan-network-link" to={href}>Ver rede credenciada <ArrowRight size={16}/></Link><EntityActions category={category} entity={entity} onDeleted={onDeleted} compact/></footer>
  </article>
  const provider=category==='doctors'||category==='establishments'
  return <article className={`entity-card compact-provider-card ${provider?'provider-card':'catalogue-card'}`} aria-label={entity.name}>
    <header className="provider-card-header"><div className="card-heading"><span className="category-label">{entity.kind?kinds[entity.kind]:entity.professional_type||categories[category].singular}</span>{entity.active===false&&<span className="inactive">Inativo</span>}</div><Link className="record-title" to={href} title={entity.name}><h2 className="clamp-two">{entity.name}</h2></Link>{entity.registration_number&&<p className="card-registration">{entity.professional_council||'CRM'} {entity.registration_number}/{entity.registration_state}</p>}</header>
    {provider&&<div className="card-specialties" aria-label="Especialidades">{specialties.length?<div className="chips">{specialties.slice(0,2).map(s=><Link className="chip specialty-chip" key={s.id} to={`/cadastros?specialty=${s.id}`} title={s.name}><span>{s.name}</span></Link>)}{extraSpecialties>0&&<Link className="chip more-chip" to={href} aria-label={`+${extraSpecialties} especialidades`}>+{extraSpecialties}</Link>}</div>:<p className="card-missing">Especialidades não informadas</p>}</div>}
    <div className="card-main-info">{!!establishments.length&&<div className="card-establishment"><Building2 size={15}/><div><strong className="clamp-two" title={establishments[0].name}>{establishments[0].name}</strong>{extraEstablishments>0&&<Link to={href}>+{extraEstablishments} estabelecimentos</Link>}</div></div>}{location&&<p className="card-location" title={location}><MapPin size={14}/><span className="clamp-two">{location}</span></p>}{!!plans.length&&<div className="card-plans"><ShieldCheck size={14}/><div><span className="clamp-two" title={plans[0].name}>{plans[0].name}{extras>0&&` +${extras}`}</span><small>Consulte os locais no detalhe</small></div></div>}{provider&&!establishments.length&&!location&&!plans.length&&<p className="card-missing">Localização e convênios não informados.</p>}</div>
    <footer className="compact-card-footer"><Link className="card-detail-link" to={href}>Ver detalhes <ArrowRight size={16}/></Link><EntityActions category={category} entity={entity} onDeleted={onDeleted} compact/></footer>
  </article>
}
