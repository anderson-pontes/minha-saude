import { Link, useLocation, useParams } from 'react-router-dom'
import { Building2, Globe, Mail, MapPin, MessageCircle, Phone, Smartphone, Tags } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Empty, Loading } from '../components/feedback'
import { ContactActions, EntityActions, QueryError } from '../components/network'
import { contactTypes, displayContactValue, formatCep, normalizeWebsite } from '../lib/contact-utils'
import { addressText, categories, kinds, mapsLink, useEntity } from '../lib/network'
import type { Category, Entity } from '../lib/network'

export function EntityDetailPage({ category }: { category: Category }) {
  const { id } = useParams()
  const query = useEntity(category, id)
  const location = useLocation()
  if (query.isPending) return <Loading/>
  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()}/>
  if (!query.data) return <section className="panel"><Empty title="Registro não encontrado ou indisponível" description="Confira o link e a conta utilizada. Apenas o proprietário pode consultar este cadastro."/><Button asChild><Link to="/cadastros">Voltar à minha rede</Link></Button></section>
  const entity = query.data
  const primaryAddress = entity.addresses?.find(a => a.is_primary) ?? entity.addresses?.[0]
  const website = normalizeWebsite(entity.website ?? '')
  function related(title: string, items: Entity[] | undefined, type: Category) {
    return !!items?.length && <section className="panel"><h2>{title}</h2><div className={type === 'health_plans' ? 'plan-chips' : 'related-list'}>{items.map((item, index) => <div className="related-item" key={item.id ?? index}>
      <Link to={`${categories[type].path}/${item.id}`} className={type === 'health_plans' ? 'chip plan-chip' : 'related-title'}><strong>{item.name}</strong></Link>
      {!!item.specialties?.length && <p className="muted">{item.specialties.map(s => s.name).join(' · ')}</p>}
      {item.link_notes && <p className="preserve-lines attendance-note">{item.link_notes}</p>}
      {item.addresses?.map(a => <p key={a.id} className="muted"><a href={mapsLink(a)} target="_blank" rel="noopener noreferrer">{addressText(a)} ↗</a></p>)}
    </div>)}</div></section>
  }
  return <>
    <Link className="form-back" to="/cadastros">← Minha Rede de Saúde</Link>
    {location.state?.message && <p role="status" className="notice">{location.state.message}</p>}
    <div className="detail-heading refined-detail-heading"><div className="page-heading"><span className="eyebrow"><Building2 size={14}/>{entity.kind ? kinds[entity.kind] : categories[category].singular}{entity.active === false ? ' · INATIVO' : ''}</span><h1>{entity.name}</h1>{entity.trade_name && <p>{entity.trade_name}</p>}{primaryAddress && <p className="detail-location"><MapPin size={15}/>{[primaryAddress.neighborhood, primaryAddress.city, primaryAddress.state].filter(Boolean).join(' · ')}</p>}{entity.registration_number && <p>{entity.professional_council || 'CRM'} {entity.registration_number}/{entity.registration_state}</p>}</div><EntityActions category={category} entity={entity}/></div>
    <div className="detail-grid refined-detail-grid"><div>
      {!!entity.contacts?.length && <section className="panel contact-detail-panel"><div className="detail-section-title"><h2>Contatos</h2><span>{entity.contacts.length} {entity.contacts.length === 1 ? 'contato' : 'contatos'}</span></div><div className="contact-detail-list">{[...entity.contacts].sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((contact, index) => {
        const Icon = contact.kind === 'whatsapp' ? MessageCircle : contact.kind === 'email' ? Mail : contact.kind === 'mobile' ? Smartphone : contact.kind === 'website' ? Globe : Phone
        const label = contactTypes[contact.kind as keyof typeof contactTypes] ?? 'Contato'
        return <article className="contact-detail-card" key={contact.id ?? index} aria-label={contact.label || label}><div className="contact-detail-top"><span className="contact-kind-icon"><Icon size={18}/></span><div><h3>{contact.label || label}</h3>{contact.label && <small>{label}</small>}</div>{contact.is_primary && <span className="primary-badge">Principal</span>}</div><p className="contact-number">{displayContactValue(contact)}</p>{contact.notes && <p className="contact-note preserve-lines">{contact.notes}</p>}<ContactActions contact={contact}/></article>
      })}</div></section>}
      {!!entity.addresses?.length && <section className="panel"><h2>Localização</h2>{entity.addresses.map((address, index) => <div className="location-card" key={address.id ?? index}>{address.is_primary && <span className="primary-badge">Endereço principal</span>}<p className="street-line">{[address.street, address.number].filter(Boolean).join(', ')}</p>{address.complement && <p>{address.complement}</p>}{address.neighborhood && <p>{address.neighborhood}</p>}<p>{address.city} · {address.state}</p>{address.postal_code && <p className="muted">CEP {formatCep(address.postal_code)}</p>}{address.reference && <p className="muted">Referência: {address.reference}</p>}<a className="button button-outline map-action" href={mapsLink(address)} target="_blank" rel="noopener noreferrer"><MapPin size={16}/>Abrir no Google Maps ↗</a></div>)}</section>}
      {related('Locais de atendimento', entity.establishments, 'establishments')}
    </div><div>
      {!!entity.specialties?.length && <section className="panel"><h2>Especialidades</h2><div className="chips">{entity.specialties.map(s => <Link className="chip" key={s.id} to={`/cadastros?specialty=${s.id}`}><Tags size={13}/>{s.name}</Link>)}</div></section>}
      {related('Médicos', entity.doctors, 'doctors')}
      {related('Convênios', entity.health_plans, 'health_plans')}
      {(website || entity.description || entity.notes) && <section className="panel"><h2>Outras informações</h2>{website && <a className="external-site" href={website} target="_blank" rel="noopener noreferrer"><Globe size={16}/>Visitar site ↗</a>}{entity.description && <p className="preserve-lines">{entity.description}</p>}{entity.notes && <><h3>Observações</h3><p className="preserve-lines">{entity.notes}</p></>}</section>}
    </div></div>
  </>
}
