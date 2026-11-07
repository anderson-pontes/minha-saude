import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Building2, Stethoscope, Tags, MapPin, ShieldCheck, Search } from 'lucide-react'
import { useEntity, kinds, type Category } from '../lib/network'
import { usePlanNetwork } from '../lib/explorer'
import { EntityActions, EntityCard, QueryError } from '../components/network'
import { Empty, Loading } from '../components/feedback'
import { FilterCombobox } from '../components/filter-combobox'
import { Button } from '../components/ui/button'
import { Pagination, SortOptions } from './network-directory'

const tabs=[['establishments','Estabelecimentos'],['doctors','Profissionais'],['specialties','Especialidades']] as const
export function HealthPlanDetailPage() {
  const {id}=useParams();const overview=useEntity('health_plans',id);const [params,setParams]=useSearchParams()
  const selected=params.get('tab');const tab:Category=tabs.some(([key])=>key===selected)?selected as Category:'establishments'
  const [search,setSearch]=useState<string|null>(null)
  const filters:Record<string,string>={sort:'name'};['q','city','specialty','sort'].forEach(k=>{const v=params.get(k);if(v)filters[k]=v});if(tab==='establishments'&&params.get('kind'))filters.kind=params.get('kind')!
  const page=Math.max(1,Number(params.get('page'))||1);const query=usePlanNetwork(id,tab,filters,page)
  function update(key:string,value:string){setParams(old=>{const next=new URLSearchParams(old);if(key!=='page')next.delete('page');if(value)next.set(key,value);else next.delete(key);return next})}
  function explore(category:string,specialty:string){setSearch(null);setParams(old=>{const next=new URLSearchParams(old);next.set('tab',category);next.set('specialty',specialty);next.delete('q');next.delete('page');return next})}
  if(overview.isPending)return <Loading/>
  if(overview.isError)return <QueryError error={overview.error} retry={()=>void overview.refetch()}/>
  if(!overview.data)return <Empty title="Convênio não encontrado ou indisponível" description="Confira o link e o acesso da sua conta."/>
  const plan=overview.data;const total=query.data?.total??0
  const metrics=[[Building2,'Estabelecimentos',plan.establishments_count],[Stethoscope,'Profissionais',plan.doctors_count],[Tags,'Especialidades',plan.specialties_count],[MapPin,'Cidades atendidas',plan.cities_count]] as const
  return <div className="network-explorer plan-detail"><Link className="form-back" to="/convenios">← Convênios</Link><div className="detail-heading"><div className="page-heading"><span className="eyebrow"><ShieldCheck size={15}/>REDE CREDENCIADA · {plan.active===false?'INATIVO':'ATIVO'}</span><h1>{plan.name}</h1>{plan.operator_name&&<p>{plan.operator_name}</p>}{plan.plan_registration&&<p>Registro: {plan.plan_registration}</p>}</div><EntityActions category="health_plans" entity={plan}/></div>
    <div className="plan-overview-metrics">{metrics.map(([Icon,label,value])=><div className="panel" key={label}><Icon size={20}/><strong>{value?.toLocaleString('pt-BR')??'—'}</strong><span>{label}</span></div>)}</div>
    <section className="plan-network-section"><div className="section-title"><div><h2>Explore a rede</h2><p className="muted">Consulte os vínculos cadastrados neste convênio.</p></div></div><div className="category-tabs" role="tablist" aria-label="Rede credenciada">{tabs.map(([key,label])=><button key={key} id={`tab-${key}`} role="tab" tabIndex={tab===key?0:-1} onKeyDown={e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const index=tabs.findIndex(([value])=>value===key);const next=e.key==='Home'?0:e.key==='End'?2:(index+(e.key==='ArrowRight'?1:2))%3;update('tab',tabs[next][0]);setSearch(null);document.getElementById(`tab-${tabs[next][0]}`)?.focus()}} aria-selected={tab===key} aria-controls="plan-network-results" className={tab===key?'selected':''} onClick={()=>{update('tab',key);setSearch(null)}}>{label}</button>)}</div>
    <form className="search-box universal-search" role="search" onSubmit={e=>{e.preventDefault();update('q',search??params.get('q')??'')}}><Search size={19}/><input aria-label="Buscar na rede credenciada" placeholder={`Buscar ${tabs.find(([key])=>key===tab)?.[1].toLocaleLowerCase('pt-BR')}...`} value={search??params.get('q')??''} onChange={e=>setSearch(e.target.value)}/><Button type="submit">Buscar</Button></form>
    <div className="plan-network-filters">{tab==='establishments'&&<div className="field"><label>Tipo<select value={params.get('kind')??''} onChange={e=>update('kind',e.target.value)}><option value="">Todos os tipos</option>{Object.entries(kinds).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label></div>}<FilterCombobox source="city" label="Cidade" all="Todas as cidades" plan={id} value={params.get('city')??''} onChange={v=>update('city',v)}/>{tab!=='specialties'&&<FilterCombobox source="specialties" label="Especialidade" all="Todas as especialidades" value={params.get('specialty')??''} onChange={v=>update('specialty',v)}/>}<div className="field"><label>Ordenar<select value={filters.sort} onChange={e=>update('sort',e.target.value)}><SortOptions/></select></label></div></div>
    {(params.get('q')||params.get('city')||params.get('specialty')||params.get('kind'))&&<Button variant="ghost" onClick={()=>{setSearch(null);setParams({tab,sort:filters.sort},{flushSync:true})}}>Limpar filtros da rede</Button>}
    <div role="tabpanel" id="plan-network-results" aria-labelledby={`tab-${tab}`}>{query.isPending?<Loading/>:query.isError?<QueryError error={query.error} retry={()=>void query.refetch()}/>:!query.data.items.length?<Empty title="Nenhum vínculo encontrado" description="Ajuste os filtros para consultar a rede deste convênio."/>:<><p className="muted result-count" role="status">{total} {total===1?'vínculo encontrado':'vínculos encontrados'}</p><div className="network-grid">{query.data.items.map(({category,data})=>tab==='specialties'?<article className="entity-card specialty-network-card" key={data.id}><Tags size={20}/><h3>{data.name}</h3><Link to={`/especialidades/${data.id}`}>Ver detalhes</Link><div><Button variant="outline" onClick={()=>explore('establishments',data.id!)}>Ver estabelecimentos</Button><Button variant="outline" onClick={()=>explore('doctors',data.id!)}>Ver profissionais</Button></div></article>:<EntityCard key={data.id} category={category} entity={data} onDeleted={()=>void query.refetch()}/>)}</div></>}{!query.isError&&<Pagination page={page} total={total} busy={query.isFetching} change={n=>update('page',String(n))}/>}</div></section>
  </div>
}
