import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Building2, Heart, HeartHandshake, Network, Phone, Plus, Search, Stethoscope, Tags } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Empty, Loading } from '../components/feedback'
import { EntityCard, QueryError } from '../components/network'
import { RegistrationTypePicker } from '../components/registration-type-picker'
import { categories, contactLink, rpc, useNetwork } from '../lib/network'
import type { Category } from '../lib/network'
import { displayContactValue } from '../lib/contact-utils'
import { useAuth } from '../lib/auth'

// eslint-disable-next-line react-refresh/only-export-components
export const sections = [
  { path: '/cadastros', title: 'Minha rede', icon: Network },
  { path: '/estabelecimentos', title: 'Estabelecimentos', icon: Building2 },
  { path: '/medicos', title: 'Médicos', icon: Stethoscope },
  { path: '/favoritos', title: 'Favoritos', icon: Heart },
]
function SearchBox() {
  const [term, setTerm] = useState('')
  const navigate = useNavigate()
  return <form className="search-box" role="search" onSubmit={e => { e.preventDefault(); navigate(`/cadastros?q=${encodeURIComponent(term)}`) }}>
    <Search size={20}/><label className="sr-only" htmlFor="home-search">Buscar na sua rede de saúde</label><input id="home-search" value={term} onChange={e => setTerm(e.target.value)} placeholder="Clínica, médico, especialidade…"/><Button aria-label="Buscar"><ArrowRight size={20}/></Button>
  </form>
}
export function HomePage() {
  const [adding, setAdding] = useState(false)
  const { session } = useAuth()
  const recent = useNetwork({}, 1, 6)
  const favorites = useNetwork({ favorites: 'true' }, 1, 4)
  const counts = useQuery({ queryKey: ['summary', session?.user.id], enabled: !!session, queryFn: () => rpc<Record<Category, number>>('network_summary') })
  const icons = { establishments: Building2, doctors: Stethoscope, specialties: Tags, health_plans: HeartHandshake }
  return <div className="dashboard-refined">
    <div className="directory-heading"><div className="page-heading"><span className="eyebrow">SEU ESPAÇO DE CUIDADO</span><h1>Seu cuidado, por perto<span className="teal-text">.</span></h1><p>Organize sua rede e encontre o contato certo.</p></div><Button onClick={() => setAdding(true)}><Plus size={18}/>Novo cadastro</Button></div>
    <section className="search-hero"><div className="hero-copy"><span className="hero-tag"><Heart size={14}/> MAIS PERTO DE VOCÊ</span><h2>Sua rede de saúde,<br/>em um só lugar.</h2><p>Busque por nome, especialidade, localização ou convênio.</p><SearchBox/></div><div className="hero-symbol" aria-hidden="true"><Stethoscope strokeWidth={1}/></div></section>
    <div className="section-title"><h2>Encontre na sua rede</h2><Link className="teal-text" to="/cadastros">Ver todos →</Link></div>
    <div className="quick-grid">{(Object.keys(categories) as Category[]).map((key, index) => {
      const Icon = icons[key]
      return <Link key={key} to={categories[key].path} className="quick-card"><span className={`category-icon ${['teal','blue','purple','cyan'][index]}`}><Icon size={22}/></span><ArrowRight className="card-arrow" size={18}/><h3>{categories[key].title}</h3><span className="record-count">{counts.data ? `${counts.data[key]} registros` : 'Consultar registros'}</span></Link>
    })}</div>
    {counts.isError && <QueryError error={counts.error} retry={() => void counts.refetch()}/>}
    <section><div className="section-title"><h2>Seus favoritos</h2><Link className="teal-text" to="/favoritos">Ver todos →</Link></div>
      {favorites.isPending ? <Loading/> : favorites.isError ? <QueryError error={favorites.error} retry={() => void favorites.refetch()}/> : favorites.data.items.length ? <div className="network-grid">{favorites.data.items.map(({ category, data }) => <EntityCard key={data.id} category={category} entity={data}/>)}</div> : <div className="panel"><Empty title="Seus contatos mais próximos" description="Marque o coração de um contato para acessá-lo rapidamente aqui."/><Button asChild variant="ghost" className="full"><Link to="/cadastros">Encontrar um contato<ArrowRight size={15}/></Link></Button></div>}
    </section>
    <section className="recent-section"><div className="section-title"><h2>Últimos cadastros</h2><Link to="/cadastros" className="teal-text">Minha rede →</Link></div>
      {recent.isPending ? <Loading/> : recent.isError ? <QueryError error={recent.error} retry={() => void recent.refetch()}/> : recent.data.items.length ? <div className="panel recent-list">{recent.data.items.map(({ category, data }) => {
        const contact = data.contacts?.find(c => c.is_primary) ?? data.contacts?.[0]
        const href = contact ? contactLink(contact) : undefined
        return <article className="recent-row" key={data.id}><Link to={`${categories[category].path}/${data.id}`}><strong>{data.name}</strong><small>{categories[category].singular}{contact ? ` · ${displayContactValue(contact)}` : ''}</small></Link>{href && <a className="button button-outline" href={href} aria-label={`Contato de ${data.name}`} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"><Phone size={16}/></a>}<Link className="button button-ghost" to={`${categories[category].path}/${data.id}`} aria-label={`Ver ${data.name}`}><ArrowRight size={17}/></Link></article>
      })}</div> : <div className="panel"><Empty title="Seu cuidado começa com uma boa conexão" description="Adicione seu primeiro cadastro à sua rede pessoal."/><Button asChild variant="outline" className="full"><Link to="/estabelecimentos/novo"><Plus size={16}/>Cadastrar estabelecimento</Link></Button></div>}
    </section>
    {adding && <RegistrationTypePicker close={() => setAdding(false)}/>}
  </div>
}
