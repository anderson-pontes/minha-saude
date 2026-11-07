import { useState } from 'react'
import { X } from 'lucide-react'
import { Dialog } from './dialog'
import { Button } from './ui/button'
import { FilterCombobox } from './filter-combobox'
import { kinds } from '../lib/network'
import { filterLabels, useLookup, type LookupSource } from '../lib/explorer'

export function FilterChip({field,value,remove}:{field:string;value:string;remove:()=>void}) {
  const source=({specialty:'specialties',doctor:'doctors',plan:'health_plans'} as Record<string,LookupSource>)[field]
  const query=useLookup(source??'specialties','',source?value:'',false)
  const text=source?query.data?.selected?.name??filterLabels[field]:field==='kind'?kinds[value]:field==='active'?(value==='true'?'Ativo':'Inativo'):field==='favorites'?'Somente favoritos':value
  return <button className="chip applied-chip" onClick={remove} aria-label={`Remover filtro ${filterLabels[field]}`}><span>{filterLabels[field]}: {text}</span><X size={13}/></button>
}
export function NetworkFilters({initial,close,apply,favoritesLocked}:{initial:Record<string,string>;close:()=>void;apply:(draft:Record<string,string>)=>void;favoritesLocked:boolean}) {
  const [draft,setDraft]=useState(()=>Object.fromEntries(Object.keys(filterLabels).filter(k=>initial[k]).map(k=>[k,initial[k]])))
  const [notice,setNotice]=useState('')
  function update(key:string,value:string){setDraft(old=>{const next={...old,[key]:value};if(key==='state'){next.city='';next.neighborhood='';if(old.city||old.neighborhood)setNotice('Cidade e bairro foram limpos após a alteração do estado.')}if(key==='city'){next.neighborhood='';if(old.neighborhood)setNotice('Bairro foi limpo após a alteração da cidade.')}return next})}
  const count=Object.values(draft).filter(Boolean).length
  return <Dialog title="Filtrar minha rede" close={close} className="filter-dialog"><div className="filter-scroll">
    <section className="filter-group"><h3>Profissionais e estabelecimentos</h3><div className="filter-grid"><div className="field"><label>Tipo de estabelecimento<select value={draft.kind??''} onChange={e=>update('kind',e.target.value)}><option value="">Todos os tipos</option>{Object.entries(kinds).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label></div><FilterCombobox source="specialties" label="Especialidade" all="Todas as especialidades" value={draft.specialty??''} onChange={v=>update('specialty',v)}/><FilterCombobox source="doctors" label="Médico/profissional" all="Todos os profissionais" value={draft.doctor??''} onChange={v=>update('doctor',v)}/><FilterCombobox source="health_plans" label="Convênio" all="Todos os convênios" value={draft.plan??''} onChange={v=>update('plan',v)}/></div></section>
    <section className="filter-group"><h3>Localização</h3><div className="filter-grid"><FilterCombobox source="state" label="Estado (UF)" all="Todos os estados" value={draft.state??''} onChange={v=>update('state',v)}/><FilterCombobox source="city" label="Cidade" all="Todas as cidades" state={draft.state} value={draft.city??''} onChange={v=>update('city',v)}/><FilterCombobox source="neighborhood" label="Bairro" all="Todos os bairros" state={draft.state} city={draft.city} value={draft.neighborhood??''} onChange={v=>update('neighborhood',v)}/></div>{notice&&<p className="filter-notice" role="status">{notice}</p>}</section>
    <section className="filter-group"><h3>Preferências</h3><div className="filter-grid"><div className="field"><label>Status<select value={draft.active??''} onChange={e=>update('active',e.target.value)}><option value="">Todos os status</option><option value="true">Ativo</option><option value="false">Inativo</option></select></label></div><label className="check-label"><input type="checkbox" disabled={favoritesLocked} checked={draft.favorites==='true'} onChange={e=>update('favorites',e.target.checked?'true':'')}/>Somente favoritos</label></div></section>
  </div><footer className="filter-footer"><span role="status">{count} {count===1?'filtro selecionado':'filtros selecionados'}</span><div><Button variant="outline" onClick={()=>{setDraft(favoritesLocked?{favorites:'true'}:{});setNotice('Filtros limpos. Confirme para aplicar.')}}>Limpar filtros</Button><Button onClick={()=>apply(draft)}>Aplicar filtros</Button></div></footer></Dialog>
}
