import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
type AuthState = { session: Session | null; loading: boolean; error: boolean }
const AuthContext = createContext<AuthState>({ session: null, loading: true, error: false })
export function AuthProvider({ children, onSessionChange }: { children: ReactNode; onSessionChange: () => void }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: !!supabase, error: false })
  useEffect(() => {
    if (!supabase) return
    let active = true
    let revision = 0
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      revision++
      onSessionChange()
      if (active) setState({ session, loading: false, error: false })
    })
    const initialRevision = revision
    supabase.auth.getSession().then(({ data, error }) => {
      if (active && revision === initialRevision) setState({ session: data.session, loading: false, error: !!error })
    }).catch(() => { if (active && revision === initialRevision) setState({ session: null, loading: false, error: true }) })
    return () => { active = false; subscription.unsubscribe() }
  }, [onSessionChange])
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
// Shared context hook intentionally lives with its provider.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
