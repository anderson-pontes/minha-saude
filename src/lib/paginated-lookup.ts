import {useInfiniteQuery} from '@tanstack/react-query'
import {useRef} from 'react'
import {z} from 'zod'
import {useAuth} from './auth'
import {useAccess} from './access'
import {readQueryPolicy} from './requests'
import {rpc} from './rpc'
import type {Category} from './categories'
import type {Option} from './explorer'

type Cursor={name:string;id:string}
export type LookupPage={items:Option[];total:number;has_more:boolean;next_cursor:Cursor|null}
const pageShape=z.object({items:z.array(z.object({id:z.string(),name:z.string()})),total:z.number().int().nonnegative(),has_more:z.boolean(),next_cursor:z.object({name:z.string(),id:z.string()}).nullable()}).refine(page=>page.has_more===(page.next_cursor!==null))

export function usePaginatedLookup(source:Category,term:string,open:boolean){
 const {session}=useAuth(),{canRead}=useAccess(),fetchingMore=useRef(false)
 const query=useInfiniteQuery({
  ...readQueryPolicy,retry:(count,error)=>(error as {code?:string}).code!=='INVALID_LOOKUP_RESPONSE'&&readQueryPolicy.retry(count,error),queryKey:['network',session?.user.id,'lookup-pages',source,term],
  enabled:!!session&&canRead&&open,initialPageParam:null as Cursor|null,
  queryFn:async({pageParam,signal})=>{
   const data=await rpc<LookupPage>('network_lookup_page',{
    p_category:source,p_q:term,p_after_name:pageParam?.name??null,p_after_id:pageParam?.id??null,p_limit:20,
   },{signal})
   if(!pageShape.safeParse(data).success)throw Object.assign(new Error('Resposta inválida das opções'),{code:'INVALID_LOOKUP_RESPONSE'})
   return data
  },
  getNextPageParam:last=>last.has_more?last.next_cursor??undefined:undefined,
 })
 const byId=new Map<string,Option>()
 for(const page of query.data?.pages??[])for(const item of page.items)byId.set(item.id,item)
 async function loadMore(){
  if(fetchingMore.current||!query.hasNextPage||query.isFetchingNextPage)return
  fetchingMore.current=true
  try{await query.fetchNextPage({cancelRefetch:false})}finally{fetchingMore.current=false}
 }
 return {...query,items:[...byId.values()],total:query.data?.pages.at(-1)?.total??0,loadMore}
}
