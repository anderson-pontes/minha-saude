import { createContext, useContext, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './auth'
import { supabase } from './supabase'

export type Profile = { id: string; display_name: string | null; role: 'admin' | 'viewer'; status: 'active' | 'blocked'; created_at?: string; updated_at?: string }
type Access = { profile: Profile | null; loading: boolean; error: boolean; canRead: boolean; canAdmin: boolean; refresh: () => void }
const AccessContext = createContext<Access>({ profile: null, loading: true, error: false, canRead: false, canAdmin: false, refresh: () => {} })
export function AccessProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['access', session?.user.id], enabled: !!session && !!supabase,
    staleTime: 0, retry: 1, refetchInterval: 15000, refetchIntervalInBackground: false, refetchOnWindowFocus: 'always',
    queryFn: async () => { const { data, error } = await supabase!.rpc('get_my_profile'); if (error) throw error; return data as Profile | null },
  })
  const profile = query.data ?? null
  const signature = `${session?.user.id}:${profile?.role}:${profile?.status}:${query.isError}`
  const previous = useRef<string | null>(null)
  useEffect(() => {
    if (!query.isSuccess && !query.isError) return
    if (previous.current !== null && previous.current !== signature) client.removeQueries({ predicate: item => item.queryKey[0] !== 'access' })
    previous.current = signature
  }, [signature, client, query.isSuccess, query.isError])
  const canRead = !!session && !query.isError && profile?.status === 'active'
  return <AccessContext.Provider value={{ profile, loading: authLoading || (!!session && query.isPending), error: query.isError, canRead, canAdmin: canRead && profile?.role === 'admin', refresh: () => void query.refetch() }}>{children}</AccessContext.Provider>
}
// eslint-disable-next-line react-refresh/only-export-components
export const useAccess = () => useContext(AccessContext)
