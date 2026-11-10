import {useEffect,useState} from 'react'
import {useLookup} from '../lib/explorer'
import {usePaginatedLookup} from '../lib/paginated-lookup'
import type {Category} from '../lib/categories'
import {FilterSelect} from './filter-select'

export function SearchablePaginatedCombobox({label,source,value,onChange,all='Todos'}:{label:string;source:Category;value:string;onChange:(value:string)=>void;all?:string}){
 const [open,setOpen]=useState(false),[term,setTerm]=useState(''),[debounced,setDebounced]=useState('')
 const [chosen,setChosen]=useState({id:'',name:''})
 useEffect(()=>{const timer=setTimeout(()=>setDebounced(term),300);return()=>clearTimeout(timer)},[term])
 const selected=useLookup(source,'',value,false).data?.selected
 const query=usePaginatedLookup(source,debounced,open)
 const pending=term!==debounced
 const items=pending?[]:query.items
 const name=selected?.id===value?selected.name:chosen.id===value?chosen.name:query.items.find(o=>o.id===value)?.name
 return <FilterSelect label={label} value={value} valueLabel={name} placeholder={all} searchable pinSelected
  options={items.map(o=>({value:o.id,label:o.name}))}
  search={term} onSearchChange={next=>{setTerm(next);if(!next)setDebounced('')}} onOpenChange={setOpen}
  loading={pending||query.isPending||query.isFetching&&!query.data} error={query.isError&&!query.data} retry={()=>void query.refetch()}
  pagination={{loaded:items.length,total:pending||!query.data?null:query.total,hasMore:!pending&&!!query.hasNextPage,loading:query.isFetchingNextPage,error:query.isFetchNextPageError,loadMore:()=>void query.loadMore()}}
  onValueChange={next=>{setChosen({id:next,name:items.find(o=>o.id===next)?.name??name??''});onChange(next)}}/>
}
