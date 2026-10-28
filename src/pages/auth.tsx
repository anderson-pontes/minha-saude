import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Brand, Loading } from '../components/feedback'
import { Button } from '../components/ui/button'
const schema = z.object({ email: z.email('Informe um e-mail válido.'), password: z.string() })
type Values = z.infer<typeof schema>
export function AuthPage({ mode = 'login' }: { mode?: 'login' | 'forgot' | 'reset' }) {
  const { session, loading } = useAuth()
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const formSchema = mode === 'reset' ? schema.extend({ email: z.string() }) : schema
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(formSchema), defaultValues: { email: '', password: '' } })
  const from = location.state?.from
  const destination = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/'
  if (loading) return <Loading />
  if (session && mode === 'login') return <Navigate to={destination} replace />
  async function submit(values: Values) {
    if (!supabase) return
    setMessage(''); setFailed(false)
    if (mode !== 'forgot' && values.password.length < (mode === 'reset' ? 12 : 1)) {
      setError('password', { message: mode === 'reset' ? 'Use pelo menos 12 caracteres.' : 'Informe sua senha.' }); return
    }
    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(values.email, { redirectTo: `${window.location.origin}/redefinir-senha` })
        if (error) throw error
        setMessage('Se este e-mail estiver cadastrado, você receberá um link para recuperar sua senha.')
      } else if (mode === 'reset') {
        if (!session) { setFailed(true); setMessage('Abra o link de recuperação enviado ao seu e-mail.'); return }
        const { error } = await supabase.auth.updateUser({ password: values.password })
        if (error) throw error
        const { error: signOutError } = await supabase.auth.signOut()
        if (signOutError) throw signOutError
        navigate('/login', { replace: true })
      } else {
        const { error } = await supabase.auth.signInWithPassword(values)
        if (error) throw error
        navigate(destination, { replace: true })
      }
    } catch { setFailed(true); setMessage(mode === 'login' ? 'Não foi possível entrar. Verifique e-mail e senha e tente novamente.' : 'Não foi possível concluir. Tente novamente ou solicite outro link.') }
  }
  const title = mode === 'login' ? 'Seu cuidado começa aqui.' : mode === 'forgot' ? 'Vamos recuperar seu acesso.' : 'Uma nova senha, um novo começo.'
  return <main className="auth-layout"><section className="auth-story"><Brand /><div><span className="eyebrow">SUA REDE DE SAÚDE, ORGANIZADA</span><h1>Mais tranquilidade.<br />Tudo por perto.</h1><p>Seus médicos, clínicas e contatos reunidos em um espaço só seu.</p><div className="story-art"><HeartIllustration /></div></div><span className="privacy"><ShieldCheck size={18} /> Um espaço pessoal para cuidar do que importa.</span></section><section className="auth-panel"><div className="auth-mobile-brand"><Brand /></div><div className="auth-form"><span className="empty-icon"><LockKeyhole /></span><h1>{title}</h1><p>{mode === 'login' ? 'Entre para acessar sua rede de saúde.' : 'Mantenha seu acesso seguro e pessoal.'}</p>{!supabase && <div className="notice" role="status"><strong>Conexão ainda não configurada</strong><p>Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no ambiente para habilitar o acesso.</p></div>}<form onSubmit={handleSubmit(submit)} noValidate>{mode !== 'reset' && <div className="field"><label htmlFor="email">E-mail</label><input id="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" {...register('email')} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} />{errors.email && <span id="email-error" className="field-error">{errors.email.message}</span>}</div>}{mode === 'reset' && <input type="hidden" {...register('email')} value={session?.user.email ?? 'recovery@example.invalid'} />}{mode !== 'forgot' && <div className="field"><label htmlFor="password">{mode === 'reset' ? 'Nova senha' : 'Senha'}</label><input id="password" type="password" autoComplete={mode === 'reset' ? 'new-password' : 'current-password'} {...register('password')} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} />{errors.password && <span id="password-error" className="field-error">{errors.password.message}</span>}</div>}{mode === 'login' && <Link className="forgot" to="/recuperar-senha">Esqueci minha senha</Link>}{message && <p role={failed ? 'alert' : 'status'} className={failed ? 'field-error' : 'success'}>{message}</p>}<Button className="full" disabled={!supabase || isSubmitting}>{isSubmitting ? 'Aguarde…' : mode === 'login' ? 'Entrar no meu espaço' : mode === 'forgot' ? 'Enviar link de recuperação' : 'Salvar nova senha'}<ArrowRight size={18} /></Button></form>{mode !== 'login' ? <Link className="back-link" to="/login"><ArrowLeft size={16} /> Voltar para entrar</Link> : <p className="invite-note">Acesso pessoal e restrito. Para obter acesso, fale com o responsável pelo sistema.</p>}</div><span className="auth-footer">Minha Saúde · Cuidar fica mais simples.</span></section></main>
}
function HeartIllustration() { return <svg viewBox="0 0 320 220" fill="none" aria-hidden="true"><circle cx="160" cy="110" r="96" fill="white" fillOpacity=".06"/><circle cx="160" cy="110" r="70" stroke="white" strokeOpacity=".14"/><rect x="95" y="38" width="130" height="152" rx="22" fill="#F0FDFA" transform="rotate(-8 160 110)"/><path d="M130 95c-15-20-37 8-10 27l35 23 31-35c23-27-8-47-21-23l-7 11-12-9" fill="#14B8A6"/><path d="M117 116h21l8-19 13 33 9-20h25" stroke="#0F766E" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/><path d="M126 160h55" stroke="#B2DCD5" strokeWidth="6" strokeLinecap="round"/></svg> }
