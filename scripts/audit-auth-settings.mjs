// Read-only public Auth settings; never print API keys or session credentials.
const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) throw new Error('Missing public Supabase configuration')
const response = await fetch(`${url}/auth/v1/settings`, {
  headers: { apikey: key }, signal: AbortSignal.timeout(20000),
})
if (!response.ok) throw new Error(`Auth settings returned HTTP ${response.status}`)
const settings = await response.json()
console.log(JSON.stringify({
  status: response.status,
  disable_signup: settings.disable_signup,
  email_enabled: settings.external?.email,
  anonymous_users_enabled: settings.external?.anonymous_users,
}))
