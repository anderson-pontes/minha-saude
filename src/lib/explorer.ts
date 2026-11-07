import { useQuery } from '@tanstack/react-query'
import { useAuth } from './auth'
import { useAccess } from './access'
import { readQueryPolicy } from './requests'
import { rpc, type SearchResult, type Category } from './network'

export type Option = {id:string;name:string}
export type LookupSource = Category | 'state' | 'city' | 'neighborhood'
export function useLookup(source:LookupSource, q:string, selected:string, search:boolean, state='', city='', plan='') {
  const {session}=useAuth(); const {canRead}=useAccess()
  return useQuery({...readQueryPolicy,queryKey:['network',session?.user.id,'lookup',source,q,selected,search,state,city,plan],enabled:!!session&&canRead&&(search||!!selected),
    queryFn:async({signal})=>{
      if(['state','city','neighborhood'].includes(source))return {items:await rpc<Option[]>('network_locations',{p_field:source,p_state:state,p_city:city,p_q:q,p_plan:plan||null},{signal}),selected:selected?{id:selected,name:selected}:null}
      return rpc<{items:Option[];selected:Option|null}>('network_lookup',{p_category:source,p_q:q,p_selected:selected||null,p_search:search},{signal})
    }})
}
export function usePlanNetwork(id:string|undefined, category:Category, filters:Record<string,string>,page:number) {
  const {session}=useAuth(); const {canRead}=useAccess()
  return useQuery({...readQueryPolicy,queryKey:['network',session?.user.id,'plan',id,category,filters,page],enabled:!!id&&!!session&&canRead,
    queryFn:({signal})=>rpc<SearchResult>('health_plan_network',{p_plan:id,p_category:category,p_filters:filters,p_page:page,p_size:12},{signal})})
}

export const filterLabels:Record<string,string>={kind:'Tipo',specialty:'Especialidade',doctor:'Profissional',plan:'Conv\u00eanio',state:'UF',city:'Cidade',neighborhood:'Bairro',active:'Status',favorites:'Favoritos'}
