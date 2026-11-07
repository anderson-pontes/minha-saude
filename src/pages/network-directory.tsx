import {SearchField,CardSkeletons} from '../components/search-field'
import { filterLabels } from '../lib/explorer'
import { useAccess } from '../lib/access'
import { RegistrationTypePicker } from '../components/registration-type-picker'
import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Plus, SlidersHorizontal } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Empty } from '../components/feedback'
import { EntityActions, EntityCard, QueryError } from '../components/network'
import { NetworkFilters, FilterChip } from '../components/network-filters'
import { categories, useNetwork } from '../lib/network'
import type { Category, Result } from '../lib/network'

export function ResultsTable({items,refresh}:{items:Result[];refresh:()=>void}) {
  const plans=items.every(i=>i.category==='health_plans')
  return <div className="explorer-table"><table><thead><tr><th>Nome</th><th>{plans?'Registro / situação':'Categoria / registro'}</th><th>{plans?'Rede credenciada':'Especialidades / local'}</th><th>Ações</th></tr></thead><tbody>{items.map(({category,data})=><tr key={`${category}-${data.id}`}><td><Link to={`${categories[category].path}/${data.id}`}><strong>{data.name}</strong></Link>{data.operator_name&&<small>{data.operator_name}</small>}</td><td>{plans?<>{data.plan_registration||'—'}<small>{data.active===false?'Inativo':'Ativo'}</small></>:<>{categories[category].singular}{data.registration_number&&<small>{data.professional_council} {data.registration_number}/{data.registration_state}</small>}</>}</td><td>{plans?<>{data.establishments_count??'—'} estabelecimentos<small>{data.doctors_count??'—'} profissionais</small></>:<>{data.specialties?.slice(0,3).map(s=>s.name).join(' · ')||'—'}{!!data.establishments?.length&&<small>{data.establishments[0].name}{(data.establishments_count??data.establishments.length)>1&&` +${(data.establishments_count??data.establishments.length)-1}`}</small>}</>}</td><td><Link to={`${categories[category].path}/${data.id}`}>{plans?'Ver rede':'Ver detalhes'}</Link><EntityActions category={category} entity={data} onDeleted={refresh}/></td></tr>)}</tbody></table></div>
}
export function Pagination({page,total,busy,change}:{page:number;total:number;busy:boolean;change:(page:number)=>void}) {
  return <div className="pagination"><Button variant="outline" disabled={page<=1||busy} onClick={()=>change(page-1)}>Anterior</Button><span>Página {page} de {Math.max(1,Math.ceil(total/12))}</span><Button variant="outline" disabled={page*12>=total||busy} onClick={()=>change(page+1)}>Próxima</Button></div>
}
export function SortOptions(){return <><option value="name">Nome A–Z</option><option value="name_desc">Nome Z–A</option><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option></>}
export function NetworkDirectoryPage({category,favorites=false}:{category?:Category;favorites?:boolean}) {
  const {canAdmin}=useAccess();const [params,setParams]=useSearchParams();const location=useLocation()
  const filters:Record<string,string>={};params.forEach((v,k)=>{if(!['page','view'].includes(k))filters[k]=v})
  if(category)filters.category=category
  if(favorites)filters.favorites='true'
  const page=Math.max(1,Number(params.get('page'))||1);const query=useNetwork(filters,page)
  const [drawer,setDrawer]=useState(false);const [adding,setAdding]=useState(false)
  const [searchDraft,setSearchDraft]=useState<{url:string;value:string}|null>(null);const q=params.get('q')??'';const term=searchDraft?.url===q?searchDraft.value:q

  function update(key:string,value:string){setParams(old=>{const next=new URLSearchParams(old);if(!['view','page'].includes(key))next.delete('page');if(value)next.set(key,value);else next.delete(key);return next},{flushSync:true})}
  function apply(draft:Record<string,string>){setParams(old=>{const next=new URLSearchParams(old);next.delete('page');Object.keys(filterLabels).forEach(k=>{next.delete(k);if(draft[k])next.set(k,draft[k])});return next},{flushSync:true});setDrawer(false)}
  const active=Object.keys(filterLabels).filter(k=>filters[k]&&!(favorites&&k==='favorites'))
  const title=favorites?'Favoritos':category?categories[category].title:'Minha Rede de Saúde'
  const plans=category==='health_plans';const total=query.data?.total??0
  return <div className="network-explorer"><header className="directory-header"><div className="directory-heading"><div className="page-heading"><span className="eyebrow">SEU ESPAÇO DE CUIDADO</span><h1>{title}</h1><p>{plans?'Gerencie seus convênios e consulte as redes credenciadas.':'Consulte e organize seus profissionais, clínicas, hospitais e especialidades.'}</p></div>{canAdmin&&(category?<Button asChild><Link to={`${categories[category].path}/novo`}><Plus size={18}/>{plans?'Novo convênio':`Novo ${categories[category].singular.toLocaleLowerCase('pt-BR')}`}</Link></Button>:<Button onClick={()=>setAdding(true)}><Plus size={18}/>Novo cadastro</Button>)}</div>
    {location.state?.message&&<p role="status" className="notice">{location.state.message}</p>}
    <SearchField label="Busca universal" value={term} change={value=>setSearchDraft({url:q,value})} search={()=>{update('q',term);setSearchDraft(null)}} clear={()=>{setSearchDraft(null);update('q','')}} placeholder={plans?'Buscar convênio ou operadora...':'Buscar clínica, profissional, especialidade ou local...'}/>

    {!category&&!favorites&&<div className="category-tabs" role="group" aria-label="Categorias">{[['','Todos'],...Object.entries(categories).map(([key,value])=>[key,value.title])].map(([key,label])=><button key={key} className={(filters.category??'')===key?'selected':''} aria-pressed={(filters.category??'')===key} onClick={()=>update('category',key)}>{label}</button>)}</div>}
    <div className="directory-toolbar"><Button variant="outline" onClick={()=>setDrawer(true)}><SlidersHorizontal size={17}/>Filtros {active.length||''}</Button><label className="sort-label">Ordenar<select aria-label="Ordenar" value={params.get('sort')??'newest'} onChange={e=>update('sort',e.target.value)}><SortOptions/></select></label><div className="view-toggle" role="group" aria-label="Visualização"><Button variant="ghost" aria-pressed={params.get('view')!=='table'} onClick={()=>update('view','')}>Cards</Button><Button variant="ghost" aria-pressed={params.get('view')==='table'} onClick={()=>update('view','table')}>Tabela</Button></div></div>
    {!!active.length&&<div className="chips applied-filters" aria-label="Filtros aplicados">{active.map(k=><FilterChip key={k} field={k} value={filters[k]} remove={()=>update(k,'')}/>) }<Button variant="ghost" className="clear-applied" onClick={()=>apply(favorites?{favorites:'true'}:{})}>Limpar filtros</Button></div>}
    </header>
    {drawer&&<NetworkFilters initial={filters} close={()=>setDrawer(false)} favoritesLocked={favorites} apply={apply}/>}
    {query.isPending?<CardSkeletons/>:query.isError?<QueryError error={query.error} retry={()=>void query.refetch()}/>:!query.data.items.length?<section className="panel"><Empty title={Object.keys(filters).length?'Nenhum resultado encontrado':'Sua rede começa aqui'} description="Adicione um cadastro ou ajuste os filtros para encontrar seus contatos."/></section>:<><p className="muted result-count" role="status">{total} {total===1?'cadastro encontrado':'cadastros encontrados'}</p>{params.get('view')==='table'?<ResultsTable items={query.data.items} refresh={()=>void query.refetch()}/>:<div className="network-grid">{query.data.items.map(({category,data})=><EntityCard key={`${category}-${data.id}`} category={category} entity={data} onDeleted={()=>void query.refetch()}/>)}</div>}</>}
    {!query.isError&&<Pagination page={page} total={total} busy={query.isFetching} change={n=>update('page',String(n))}/>}{canAdmin&&adding&&<RegistrationTypePicker close={()=>setAdding(false)}/>}</div>
}
