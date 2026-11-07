import { useEffect, useId, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { useLookup, type LookupSource } from '../lib/explorer'

export function FilterCombobox({label,source,value,onChange,all='Todos',state='',city='',plan=''}:{label:string;source:LookupSource;value:string;onChange:(value:string)=>void;all?:string;state?:string;city?:string;plan?:string}) {
  const id=useId();const [open,setOpen]=useState(false);const [term,setTerm]=useState('');const [debounced,setDebounced]=useState('');const [index,setIndex]=useState(0)
  useEffect(()=>{const timer=setTimeout(()=>setDebounced(term),250);return()=>clearTimeout(timer)},[term])
  const query=useLookup(source,debounced,value,open,state,city,plan)
  const options=[{id:'',name:all},...(query.data?.items??[])]
  const name=query.data?.selected?.name??(['state','city','neighborhood'].includes(source)?value:'Selecionado')
  function choose(next:string){onChange(next);setOpen(false);setTerm('');setDebounced('');setIndex(0)}
  return <div className="field remote-filter" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)){setOpen(false);setTerm('')}}}>
    <label htmlFor={id}>{label}</label><div className="combobox-control"><input id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open?`${id}-${index}`:undefined} value={open?term:value?name:''} placeholder={all} autoComplete="off" onFocus={()=>{setOpen(true);setTerm('');setIndex(0)}} onChange={e=>{setTerm(e.target.value);setOpen(true);setIndex(0)}} onKeyDown={e=>{
      if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);setTerm('')}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setIndex(i=>Math.max(0,Math.min(options.length-1,i+(e.key==='ArrowDown'?1:-1))))}
      if(e.key==='Enter'&&open){e.preventDefault();choose(options[index]?.id??'')}
    }}/>{value?<button type="button" aria-label={`Limpar ${label}`} onClick={()=>choose('')}><X size={16}/></button>:<ChevronDown size={16} aria-hidden="true"/>}</div>
    {open&&<div className="combobox-popover"><div role="listbox" id={`${id}-list`} aria-label={`Opções de ${label}`}>{options.map((option,i)=><button type="button" role="option" id={`${id}-${i}`} key={option.id} aria-selected={option.id===value} className={index===i?'highlighted':''} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(option.id)}><span>{option.name}</span>{option.id===value&&<Check size={15}/>}</button>)}</div>{query.isFetching&&<small role="status">Buscando opções…</small>}{query.isError?<button type="button" className="lookup-retry" onClick={()=>void query.refetch()}>Falha ao buscar. Tentar novamente</button>:!query.isFetching&&options.length===1&&<small>Nenhuma opção encontrada.</small>}</div>}
  </div>
}
