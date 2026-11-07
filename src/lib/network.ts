import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useAccess } from './access'
import { formatCep, normalizeSearchTerm, normalizeWebsite, phoneTelLink, whatsappLink } from './contact-utils'
import { readQueryPolicy } from './requests'
import { rpc } from './rpc'
export { rpc } from './rpc'

import type { Category } from './categories'
export { categories, kinds } from './categories'
export type { Category } from './categories'
export type Contact = { id?: string; kind: string; label: string; value: string; is_primary: boolean; notes: string }
export type Address = { id?: string; postal_code: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string; reference: string; is_primary: boolean }
export type Entity = {
  id?: string; name: string; kind?: string; trade_name?: string; website?: string; description?: string; notes?: string;
  active?: boolean; favorite?: boolean; created_at?: string; updated_at?: string; link_notes?: string;
  professional_council?: string; registration_number?: string; registration_state?: string; professional_type?: string; cnpj?: string;
  operator_name?: string; plan_registration?: string; establishments_count?: number; doctors_count?: number; specialties_count?: number; cities_count?: number; health_plans_count?: number; cities?: {city:string;state:string}[];
  contacts?: Contact[]; addresses?: Address[]; specialties?: Entity[]; doctors?: Entity[]; establishments?: Entity[]; health_plans?: Entity[];
}
export type Result = { category: Category; data: Entity }
export type SearchResult = { items: Result[]; total: number }
export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
export function errorMessage(error: unknown) {
  const e = error as { code?: string; message?: string }
  if (['PGRST202','PGRST205','42883','42703','42P01'].includes(e.code ?? '')) return 'A migração da fase 2 precisa ser aprovada e aplicada no banco. Seus campos foram mantidos.'
  if (e.code === '23505') return 'Já existe um cadastro com esse nome. Selecione o registro existente.'
  if (e.code === '23503') return 'Um vínculo não está mais disponível. Confira os registros selecionados.'
  if (e.code === '42501') return 'Registro indisponível ou acesso não permitido para sua conta.'
  if (e.message?.includes('outra sessão')) return e.message
  return 'Não foi possível concluir. Confira os campos, sua conexão e tente novamente.'
}
export function useNetwork(filters: Record<string,string>, page = 1, size = 12) {
  const { session } = useAuth()
  const { canRead } = useAccess()
  return useQuery({ ...readQueryPolicy, queryKey: ['network',session?.user.id,filters,page,size], enabled: !!session && canRead && !!supabase,
    queryFn: ({ signal }) => rpc<SearchResult>('browse_network',{ p_filters: {...filters, q:normalizeSearchTerm(filters.q ?? '')}, p_page: page, p_size: size }, { signal }) })
}
export function useDashboard(section: 'recent' | 'favorites', size: number) {
  const { session } = useAuth()
  const { canRead } = useAccess()
  // Same prefix as catalogue queries: existing create/favorite invalidations keep these fresh.
  return useQuery({ ...readQueryPolicy, queryKey: ['network', session?.user.id, 'dashboard', section, size],
    enabled: !!session && canRead && !!supabase,
    queryFn: ({ signal }) => rpc<SearchResult>('dashboard_network', { p_section: section, p_size: size }, { signal }) })
}
export function useEntity(category: Category, id?: string) {
  const { session } = useAuth()
  const { canRead } = useAccess()
  return useQuery({ ...readQueryPolicy, queryKey: ['entity', session?.user.id, category, id], enabled: !!session && canRead && !!id,
    queryFn: async ({ signal }) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id!)) return null
      return category === 'health_plans' ? rpc<Entity | null>('health_plan_overview', {p_id:id!}, {signal}) : rpc<Entity | null>('network_document', { p_type: category, p_id: id! }, { signal })
    },
  })
}
export function addressText(a: Address) { return [a.street,a.number,a.complement,a.neighborhood,a.city,a.state,formatCep(a.postal_code || '')].filter(Boolean).join(', ') }
export function mapsLink(a: Address) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText(a))}` }
export function contactLink(c: Contact) {
  if (c.kind === 'email') return `mailto:${c.value.trim()}`
  if (c.kind === 'whatsapp') return whatsappLink(c.value)
  if (c.kind === 'phone' || c.kind === 'mobile') return phoneTelLink(c.value)
  if (c.kind === 'website') return normalizeWebsite(c.value) || undefined
  return undefined
}
