import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Globe, Heart, Mail, MapPin, MessageCircle, Pencil, Phone, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { categories, contactLink, errorMessage, kinds, mapsLink } from '../lib/network'
import type { Category, Contact, Entity } from '../lib/network'
import { displayContactValue } from '../lib/contact-utils'

export function Dialog({ title, children, close, className = '', dismissOnOutside = false }: { title: string; children: ReactNode; close: () => void; className?: string; dismissOnOutside?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const dialog=ref.current!
    if (!opener.current && document.activeElement instanceof HTMLElement && !dialog.contains(document.activeElement)) opener.current=document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      queueMicrotask(() => {
        const modal=document.querySelector('dialog[open]')
        if (opener.current?.isConnected && (!modal || modal.contains(opener.current))) opener.current.focus({preventScroll:true})
      })
    }
  },[])
  return <dialog ref={ref} className={`network-dialog ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); close() }} onClick={event => {
    if (!dismissOnOutside || event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
  }}><div className="section-title"><h2>{title}</h2><Button type="button" variant="ghost" onClick={close} aria-label="Fechar">✕</Button></div>{children}</dialog>
}
export function QueryError({ error, retry }: { error: unknown; retry: () => void }) {
  return <div role="alert" className="notice"><strong>Não foi possível carregar seus registros</strong><p>{errorMessage(error)}</p><Button type="button" variant="outline" onClick={retry}>Tentar novamente</Button></div>
}
export function ContactActions({ contact }: { contact: Contact }) {
  const [message,setMessage]=useState('')
  const href=contactLink(contact)
  const Icon=contact.kind==='whatsapp'?MessageCircle:contact.kind==='email'?Mail:contact.kind==='website'?Globe:Phone
  return <div className="contact-actions">{href && <a className={`button ${contact.kind==='whatsapp'?'button-primary':'button-outline'}`} href={href} target={href.startsWith('https:') || href.startsWith('http:') ? '_blank' : undefined} rel="noopener noreferrer"><Icon size={16}/>{contact.kind==='whatsapp'?'WhatsApp':contact.kind==='email'?'Enviar e-mail':contact.kind==='website'?'Abrir site':'Ligar'}</a>}<Button type="button" variant="ghost" onClick={async()=>{try { await navigator.clipboard.writeText(displayContactValue(contact)); setMessage('Copiado') } catch { setMessage('Não foi possível copiar') }}}>Copiar</Button>{message && <small role="status">{message}</small>}</div>
}
export function EntityActions({ category, entity, onDeleted }: { category: Category; entity: Entity; onDeleted?: () => void }) {
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
      const {data,error}=await supabase!.from(category).delete().eq('id',entity.id!).eq('user_id',session!.user.id).select('id').single()
      if(error)throw error
      if(!data)throw new Error('Registro indisponível')
      setConfirm(false);await client.invalidateQueries()
      if(onDeleted)onDeleted();else navigate('/cadastros',{state:{message:'Registro excluído com sucesso.'}})
    }catch(e){setFailure(errorMessage(e))}finally{setBusy(false)}
  }
  return <><div className="entity-actions">{favoriteCategory && <Button variant="ghost" disabled={busy} aria-label={entity.favorite?'Desfavoritar':'Favoritar'} aria-pressed={!!entity.favorite} onClick={()=>void favorite()}><Heart size={18} fill={entity.favorite?'currentColor':'none'}/></Button>}<Button asChild variant="outline"><Link to={`${categories[category].path}/${entity.id}/editar`}><Pencil size={16}/>Editar</Link></Button><Button variant="ghost" disabled={busy} aria-label={`Excluir ${entity.name}`} onClick={()=>{setFailure('');setConfirm(true)}}><Trash2 size={17}/></Button></div>{message && <p role="status" className="success">{message}</p>}{failure && !confirm && <p role="alert" className="field-error">{failure}</p>}{confirm && <Dialog title="Excluir cadastro?" close={()=>{if(!busy)setConfirm(false)}}><p>Excluir “{entity.name}”? Os vínculos e dados próprios serão removidos. Os demais cadastros da rede serão preservados.</p>{failure && <p role="alert" className="field-error">{failure}</p>}<div className="form-actions"><Button variant="outline" disabled={busy} onClick={()=>setConfirm(false)}>Cancelar</Button><Button disabled={busy} onClick={()=>void remove()}>{busy?'Excluindo…':'Confirmar exclusão'}</Button></div></Dialog>}</>
}
export function EntityCard({ category, entity, onDeleted }: { category: Category; entity: Entity; onDeleted?: () => void }) {
  const address=entity.addresses?.find(a=>a.is_primary)??entity.addresses?.[0]
  const phone=entity.contacts?.find(c=>c.is_primary)??entity.contacts?.[0]
  const whatsapp=entity.contacts?.find(c=>c.kind==='whatsapp')
  return <article className="entity-card"><div className="card-heading"><span className="category-label">{entity.kind?kinds[entity.kind]:categories[category].singular}</span>{entity.active===false && <span className="inactive">Inativo</span>}</div><Link className="record-title" to={`${categories[category].path}/${entity.id}`}><h2>{entity.name}</h2></Link>{entity.registration_number && <p className="muted">{entity.professional_council||'CRM'} {entity.registration_number}/{entity.registration_state}</p>}{address && <p className="muted"><MapPin size={14}/>{[address.neighborhood,address.city,address.state].filter(Boolean).join(' · ')}</p>}<div className="chips">{entity.specialties?.slice(0,3).map(s=><Link className="chip" key={s.id} to={`/cadastros?specialty=${s.id}`}>{s.name}</Link>)}</div>{!!entity.establishments?.length && <p className="muted">{entity.establishments.map(e=>e.name).join(' · ')}</p>}{phone && <p className="muted">{phone.label||'Contato'}: {displayContactValue(phone)}</p>}<div className="card-links"><Link to={`${categories[category].path}/${entity.id}`}>Ver detalhes →</Link>{phone && contactLink(phone) && <a href={contactLink(phone)}>Contato</a>}{whatsapp && <a href={contactLink(whatsapp)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}{address && <a href={mapsLink(address)} target="_blank" rel="noopener noreferrer">Mapa</a>}</div><EntityActions category={category} entity={entity} onDeleted={onDeleted}/></article>
}
