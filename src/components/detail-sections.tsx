import {useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import {Globe,Mail,MessageCircle,Phone,Smartphone} from 'lucide-react'
import {Button} from './ui/button'
import {ContactActions} from './network'
import {contactTypes,displayContactValue} from '../lib/contact-utils'
import {addressText,categories,mapsLink,type Category,type Contact,type Entity} from '../lib/network'

export function ContactItem({contact}:{contact:Contact}) {
  const Icon=contact.kind==='whatsapp'?MessageCircle:contact.kind==='email'?Mail:contact.kind==='mobile'?Smartphone:contact.kind==='website'?Globe:Phone
  const label=contactTypes[contact.kind as keyof typeof contactTypes]??'Contato'
  return <article className="contact-detail-card contact-item" aria-label={contact.label||label}><span className="contact-kind-icon"><Icon size={18}/></span><div className="contact-identity"><div className="contact-label"><h3>{contact.label||label}</h3>{contact.is_primary&&<span className="primary-badge">Principal</span>}</div>{contact.label&&<small>{label}</small>}<p className="contact-number">{displayContactValue(contact)}</p></div><ContactActions contact={contact}/>{contact.notes&&<details className="contact-source"><summary>Fonte e observações</summary><p className="contact-note preserve-lines">{contact.notes}</p></details>}</article>
}
export function RelatedSection({title,items,type}:{title:string;items:Entity[]|undefined;type:Category}) {
  const [page,setPage]=useState(1);const heading=useRef<HTMLHeadingElement>(null)
  if(!items?.length)return null
  const pageSize=8;const pages=Math.ceil(items.length/pageSize);const actualPage=Math.min(page,pages);const visible=items.slice((actualPage-1)*pageSize,actualPage*pageSize)
  function change(value:number){setPage(value);heading.current?.focus({preventScroll:true})}
  return <section className="panel related-section" aria-label={title}><div className="detail-section-title"><h2 ref={heading} tabIndex={-1}>{title}</h2><span>{items.length} {items.length===1?'vínculo':'vínculos'}</span></div><div className="related-list">{visible.map((item,index)=><article className="related-item" key={item.id??index}><Link to={`${categories[type].path}/${item.id}`} className="related-title"><strong>{item.name}</strong></Link>{!!item.specialties?.length&&<p className="muted">{item.specialties.map(s=>s.name).join(' · ')}</p>}{item.link_notes&&<p className="preserve-lines attendance-note">{item.link_notes}</p>}{!!item.health_plans?.length&&<p className="muted">Convênios neste local: {item.health_plans.map(plan=>plan.name).join(' · ')}</p>}{item.addresses?.map(a=><p className="muted" key={a.id}><a href={mapsLink(a)} target="_blank" rel="noopener noreferrer">{addressText(a)} ↗</a></p>)}</article>)}</div>{pages>1&&<div className="related-pagination"><Button variant="outline" disabled={actualPage===1} onClick={()=>change(actualPage-1)} aria-label={`Anterior em ${title}`}>Anterior</Button><span role="status">{(actualPage-1)*pageSize+1}–{Math.min(actualPage*pageSize,items.length)} de {items.length}</span><Button variant="outline" disabled={actualPage===pages} onClick={()=>change(actualPage+1)} aria-label={`Próxima em ${title}`}>Próxima</Button></div>}</section>
}
