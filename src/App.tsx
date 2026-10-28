import { lazy, Suspense, useState } from 'react'
import { createBrowserRouter, createRoutesFromElements, Link, Navigate, NavLink, Outlet, Route, RouterProvider, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HeartPulse, House, LogOut, ShieldCheck } from 'lucide-react'
import { AuthProvider, useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import { Brand, ErrorBoundary, Loading } from './components/feedback'
import { Button } from './components/ui/button'
import { AuthPage } from './pages/auth'
import { HomePage, sections } from './pages/home'
import { categories } from './lib/network'
import type { Category } from './lib/network'
import { NetworkDirectoryPage } from './pages/network-directory'
import { EntityDetailPage } from './pages/entity-detail'
const EntityFormPage = lazy(() => import('./pages/entity-form').then(module => ({ default: module.EntityFormPage })))
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } } })
const clearPrivateCache = () => queryClient.clear()
function PrivateRoute() {
  const { session, loading, error } = useAuth()
  const location = useLocation()
  if (loading) return <Loading/>
  if (error) return <div className="state" role="alert"><h1>Não foi possível verificar sua sessão.</h1><Button onClick={() => window.location.reload()}>Tentar novamente</Button></div>
  return session ? <Outlet/> : <Navigate to="/login" replace state={{ from: location.pathname + location.search }}/>
}
function Layout() {
  const { session } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function logout() {
    setBusy(true); setError('')
    try { const result = await supabase!.auth.signOut(); if (result.error) throw result.error; clearPrivateCache() }
    catch { setError('Não foi possível sair. Tente novamente.') }
    finally { setBusy(false) }
  }
  const links = [{ path: '/', title: 'Início', icon: House }, ...sections]
  return <div className="app-shell"><a className="skip-link" href="#main">Pular para o conteúdo</a><aside className="sidebar"><Link to="/" aria-label="Minha Saúde início"><Brand/></Link><span className="nav-label">MEU ESPAÇO</span><nav aria-label="Navegação principal">{links.map(s => <NavLink end={s.path === '/'} to={s.path} key={s.path}><s.icon size={21}/>{s.title}</NavLink>)}</nav><div className="sidebar-bottom"><ShieldCheck size={22}/><strong>Cuidado com privacidade</strong><p>Sua rede de saúde em um espaço só seu.</p></div></aside><div className="workspace"><header className="header"><div className="desktop-header"><HeartPulse size={19}/><span>Pequenos cuidados. Mais bem-estar.</span></div><Link className="mobile-brand" to="/"><Brand/></Link><div className="account"><span className="avatar" aria-hidden="true">{session?.user.email?.slice(0, 1).toUpperCase() ?? 'M'}</span><span className="account-label">Meu espaço<small>Conta pessoal</small></span><Button variant="ghost" aria-label="Sair da conta" disabled={busy} onClick={() => void logout()}><LogOut size={19}/></Button></div></header>{error && <p role="alert" className="notice">{error}</p>}<main id="main" className="main-content"><Outlet/></main><footer className="footer">Minha Saúde <span>Feito para cuidar de você.</span></footer></div><nav className="bottom-nav" aria-label="Navegação no celular">{links.map(s => <NavLink end={s.path === '/'} key={s.path} to={s.path}><s.icon size={21}/><span>{s.title === 'Estabelecimentos' ? 'Locais' : s.title}</span></NavLink>)}</nav></div>
}
function NotFound() { return <div className="state"><h1>Página não encontrada</h1><Button asChild><Link to="/">Voltar ao início</Link></Button></div> }
const router=createBrowserRouter(createRoutesFromElements(<>
  <Route path="/login" element={<AuthPage/>}/><Route path="/recuperar-senha" element={<AuthPage mode="forgot"/>}/><Route path="/redefinir-senha" element={<AuthPage mode="reset"/>}/>
  <Route element={<PrivateRoute/>}><Route element={<Layout/>}><Route index element={<HomePage/>}/>
    <Route path="/cadastros" element={<NetworkDirectoryPage/>}/><Route path="/busca" element={<NetworkDirectoryPage/>}/><Route path="/favoritos" element={<NetworkDirectoryPage favorites/>}/>
    {(Object.keys(categories) as Category[]).flatMap(category=>[
      <Route key={`${category}-list`} path={categories[category].path} element={<NetworkDirectoryPage category={category}/>}/>,
      <Route key={`${category}-new`} path={`${categories[category].path}/novo`} element={<Suspense fallback={<Loading/>}><EntityFormPage category={category}/></Suspense>}/>,
      <Route key={`${category}-detail`} path={`${categories[category].path}/:id`} element={<EntityDetailPage category={category}/>}/>,
      <Route key={`${category}-edit`} path={`${categories[category].path}/:id/editar`} element={<Suspense fallback={<Loading/>}><EntityFormPage category={category}/></Suspense>}/>,
    ])}
  </Route></Route><Route path="*" element={<NotFound/>}/>
</>))
export default function App() {
  return <ErrorBoundary><QueryClientProvider client={queryClient}><AuthProvider onSessionChange={clearPrivateCache}><RouterProvider router={router}/></AuthProvider></QueryClientProvider></ErrorBoundary>
}
