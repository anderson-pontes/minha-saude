import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { formatCep, normalizeSearchTerm, normalizeWebsite, phoneTelLink, whatsappLink } from './contact-utils'

export const categories = {
  establishments: { title: 'Estabelecimentos', singular: 'Estabelecimento', path: '/estabelecimentos' },
  doctors: { title: 'Médicos', singular: 'Médico', path: '/medicos' },
  specialties: { title: 'Especialidades', singular: 'Especialidade', path: '/especialidades' },
  health_plans: { title: 'Convênios', singular: 'Convênio', path: '/convenios' },
} as const
export type Category = keyof typeof categories
export const kinds: Record<string, string> = { clinic: 'Clínica', hospital: 'Hospital', laboratory: 'Laboratório', office: 'Consultório', other: 'Outro' }
export type Contact = { id?: string; kind: string; label: string; value: string; is_primary: boolean; notes: string }
export type Address = { id?: string; postal_code: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string; reference: string; is_primary: boolean }
export type Entity = {
  id?: string; name: string; kind?: string; trade_name?: string; website?: string; description?: string; notes?: string;
  active?: boolean; favorite?: boolean; created_at?: string; updated_at?: string; link_notes?: string;
  professional_council?: string; registration_number?: string; registration_state?: string;
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
export async function rpc<T>(name: string, args = {}): Promise<T> {
  if (!supabase) throw new Error('Sessão indisponível')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data as T
}
export function useNetwork(filters: Record<string,string>, page = 1, size = 12) {
  const { session } = useAuth()
  return useQuery({ queryKey: ['network',session?.user.id,filters,page,size], enabled: !!session && !!supabase,
    queryFn: () => rpc<SearchResult>('search_network',{ p_filters: {...filters, q:normalizeSearchTerm(filters.q ?? '')}, p_page: page, p_size: size }) })
}
export function useEntity(category: Category, id?: string) {
  const { session } = useAuth()
  return useQuery({ queryKey: ['entity',session?.user.id,category,id], enabled: !!session && !!id,
    queryFn: async () => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id!)) return null
      const document=await supabase!.rpc('network_document',{p_type:category,p_id:id!})
      if(!document.error)return document.data as Entity|null
      if(!['PGRST202','42883'].includes(document.error.code))throw document.error
      // Detail reads also work on the foundation schema, before phase 2 approval.
      const joins = category === 'establishments'
        ? '*,contacts(*),addresses(*),favorites(*),establishment_specialties(specialties(*)),doctor_establishments(*,doctors(*,doctor_specialties(specialties(*)))),establishment_health_plans(*,health_plans(*))'
        : category === 'doctors'
          ? '*,contacts(*),favorites(*),doctor_specialties(specialties(*)),doctor_establishments(*,establishments(*,addresses(*)))'
          : '*'
      const { data, error } = await supabase!.from(category).select(joins).eq('id',id!).eq('user_id',session!.user.id).maybeSingle()
      if (error) throw error
      if (!data) return null
      type Join = { notes?: string; specialties?: Entity; doctors?: Entity & { doctor_specialties?: Join[] }; establishments?: Entity; health_plans?: Entity }
      const row = data as unknown as Entity & { favorites?: unknown[]; establishment_specialties?: Join[]; doctor_specialties?: Join[]; doctor_establishments?: Join[]; establishment_health_plans?: Join[] }
      const entity: Entity = { ...row, favorite: !!row.favorites?.length,
        specialties: (row.establishment_specialties ?? row.doctor_specialties ?? []).flatMap(j => j.specialties ? [j.specialties] : []),
        doctors: row.doctor_establishments?.flatMap(j => j.doctors ? [{ ...j.doctors, link_notes: j.notes, specialties: j.doctors.doctor_specialties?.flatMap(s => s.specialties ? [s.specialties] : []) }] : []),
        establishments: row.doctor_establishments?.flatMap(j => j.establishments ? [{ ...j.establishments, link_notes: j.notes }] : []),
        health_plans: row.establishment_health_plans?.flatMap(j => j.health_plans ? [{ ...j.health_plans, link_notes:j.notes }] : []),
      }
      // New relations are optional until the additive migration has been applied.
      if (category === 'doctors') {
        const plans = await supabase!.from('doctor_health_plans').select('*,health_plans(*)').eq('doctor_id',id!).eq('user_id',session!.user.id)
        if (plans.error && !['PGRST205','42P01'].includes(plans.error.code)) throw plans.error
        entity.health_plans = (plans.data ?? []).map(j => ({ ...j.health_plans, link_notes:j.notes }))
      }
      return entity
    } })
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
