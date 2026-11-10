import { useEffect, useState } from 'react'
import { useLookup, type LookupSource } from '../lib/explorer'
import { FilterSelect } from './filter-select'
import {SearchablePaginatedCombobox} from './searchable-paginated-combobox'
import type {Category} from '../lib/categories'

type Props={label:string;source:LookupSource;value:string;onChange:(value:string)=>void;all?:string;state?:string;city?:string;plan?:string}
export function FilterCombobox(props:Props){
  if(!['state','city','neighborhood'].includes(props.source))return <SearchablePaginatedCombobox {...props} source={props.source as Category}/>
  return <LocationFilterCombobox {...props}/>
}
function LocationFilterCombobox({label,source,value,onChange,all='Todos',state='',city='',plan=''}:Props) {
  const [open,setOpen]=useState(false)
  const [term,setTerm]=useState('')
  const [debounced,setDebounced]=useState('')
  const [chosen,setChosen]=useState({id:'',name:''})
  useEffect(()=>{const timer=setTimeout(()=>setDebounced(term),250);return()=>clearTimeout(timer)},[term])
  const query=useLookup(source,open?debounced:'',value,open,state,city,plan)
  const selected=query.data?.selected
  const name=selected?.id===value?selected.name:chosen.id===value?chosen.name:['state','city','neighborhood'].includes(source)?value:undefined
  return <FilterSelect label={label} value={value} valueLabel={name} placeholder={all}
    options={(query.data?.items??[]).map(o=>({value:o.id,label:o.name}))}
    searchable={source!=='state'} search={term} onSearchChange={next=>{setTerm(next);if(!next)setDebounced('')}} onOpenChange={setOpen}
    loading={query.isFetching||term!==debounced} error={query.isError} retry={()=>void query.refetch()}
    onValueChange={next=>{setChosen({id:next,name:query.data?.items.find(o=>o.id===next)?.name??''});onChange(next)}}/>
}
