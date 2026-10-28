import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const validUrl = typeof url === 'string' && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)
// Never accept privileged keys in a browser environment.
export const supabase = validUrl && typeof key === 'string' && key.startsWith('sb_publishable_')
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null
