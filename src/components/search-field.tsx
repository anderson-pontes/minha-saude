import {Search,X} from 'lucide-react'
import {Button} from './ui/button'

export function SearchField({value,change,search,clear,label,placeholder}:{value:string;change:(v:string)=>void;search:()=>void;clear:()=>void;label:string;placeholder:string}) {
  return <form className="search-box universal-search" role="search" onSubmit={e=>{e.preventDefault();search()}}><Search size={19} aria-hidden="true"/><input aria-label={label} value={value} onChange={e=>change(e.target.value)} placeholder={placeholder}/>{value&&<Button type="button" variant="ghost" className="search-clear" aria-label="Limpar busca" onClick={clear}><X size={17}/></Button>}<Button type="submit" aria-label="Buscar">Buscar</Button></form>
}
export function CardSkeletons() {
  return <div className="directory-loading" role="status"><span className="sr-only">Carregando registros…</span><div className="network-grid" aria-hidden="true">{Array.from({length:12},(_,i)=><div className="entity-card card-skeleton" key={i}><span/><span/><span/><div/><span/></div>)}</div></div>
}
