import { PwaProvider } from './components/pwa'
import { lazy, Suspense } from 'react'
import { createBrowserRouter, createRoutesFromElements, Link, Navigate, Outlet, Route, RouterProvider, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { AuthProvider, useAuth } from './lib/auth'
import { AccessProvider, useAccess } from './lib/access'
import { supabase } from './lib/supabase'
import { ErrorBoundary, Loading } from './components/feedback'
import { Button } from './components/ui/button'
import { AppLayout } from './components/app-layout'
import { categories } from './lib/categories'
import type { Category } from './lib/categories'
const AgendaPage = lazy(() => import('./pages/agenda').then(module => ({ default: module.AgendaPage })))
const AppointmentDetailPage = lazy(() => import('./pages/appointment-detail').then(module => ({ default: module.AppointmentDetailPage })))
const AuthPage = lazy(() => import('./pages/auth').then(module => ({ default: module.AuthPage })))
const HomePage = lazy(() => import('./pages/home').then(module => ({ default: module.HomePage })))
const NetworkDirectoryPage = lazy(() => import('./pages/network-directory').then(module => ({ default: module.NetworkDirectoryPage })))
const EntityDetailPage = lazy(() => import('./pages/entity-detail').then(module => ({ default: module.EntityDetailPage })))
const AdminUsersPage = lazy(() => import('./pages/admin-users').then(module => ({ default: module.AdminUsersPage })))
const EntityFormPage = lazy(() => import('./pages/entity-form').then(module => ({ default: module.EntityFormPage })))
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } } })
const clearPrivateCache = () => queryClient.clear()
function PrivateRoute() {
  const { session, loading, error } = useAuth()
  const access = useAccess()
  const location = useLocation()
  if (loading) return <Loading/>
  if (error) return <div className="state" role="alert"><h1>Não foi possível verificar sua sessão.</h1><Button onClick={() => window.location.reload()}>Tentar novamente</Button></div>
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }}/>
  if (access.loading) return <Loading/>
  if (access.error) return <div className="state" role="alert"><h1>{navigator.onLine ? 'Não foi possível verificar suas permissões' : 'Parece que você está sem conexão.'}</h1><p>{navigator.onLine ? 'Não conseguimos verificar o acesso da sua conta. Tente atualizar para continuar.' : 'Verifique sua conexão com a internet e tente novamente.'}</p><Button onClick={access.refresh}>Tentar novamente</Button><Button variant="outline" onClick={()=>void supabase!.auth.signOut()}>Sair da conta</Button></div>
  if (!access.canRead) return <div className="state"><ShieldCheck size={32}/><h1>Acesso aguardando autorização</h1><p>Sua conta está sem acesso à base compartilhada. Um administrador precisa autorizá-la.</p><Button onClick={access.refresh}>Verificar autorização</Button><Button variant="outline" onClick={()=>void supabase!.auth.signOut()}>Sair da conta</Button></div>
  return <Outlet/>
}
function AdminRoute() { const { canAdmin }=useAccess(); return canAdmin ? <Outlet/> : <div className="state"><h1>Área restrita a administradores</h1><Button asChild><Link to="/cadastros">Voltar à rede</Link></Button></div> }
function NotFound() { return <div className="state"><h1>Página não encontrada</h1><Button asChild><Link to="/">Voltar ao início</Link></Button></div> }
const router=createBrowserRouter(createRoutesFromElements(<>
  <Route path="/login" element={<AuthPage/>}/><Route path="/recuperar-senha" element={<AuthPage mode="forgot"/>}/><Route path="/redefinir-senha" element={<AuthPage mode="reset"/>}/>
  <Route element={<PrivateRoute/>}><Route element={<AppLayout clearPrivateCache={clearPrivateCache}/>}><Route index element={<HomePage/>}/>
    <Route path="/agenda" element={<AgendaPage/>}/><Route path="/agenda/:id" element={<AppointmentDetailPage/>}/>
    <Route path="/cadastros" element={<NetworkDirectoryPage/>}/><Route path="/busca" element={<NetworkDirectoryPage/>}/><Route path="/favoritos" element={<NetworkDirectoryPage favorites/>}/>
    {(Object.keys(categories) as Category[]).flatMap(category=>[
      <Route key={`${category}-list`} path={categories[category].path} element={<NetworkDirectoryPage category={category}/>}/>,
      <Route key={`${category}-new-guard`} element={<AdminRoute/>}><Route key={`${category}-new`} path={`${categories[category].path}/novo`} element={<Suspense fallback={<Loading/>}><EntityFormPage category={category}/></Suspense>}/></Route>,
      <Route key={`${category}-detail`} path={`${categories[category].path}/:id`} element={<EntityDetailPage category={category}/>}/>,
      <Route key={`${category}-edit-guard`} element={<AdminRoute/>}><Route key={`${category}-edit`} path={`${categories[category].path}/:id/editar`} element={<Suspense fallback={<Loading/>}><EntityFormPage category={category}/></Suspense>}/></Route>,
    ])}
  <Route element={<AdminRoute/>}><Route path="/administracao/usuarios" element={<AdminUsersPage/>}/></Route></Route></Route><Route path="*" element={<NotFound/>}/>
</>))
export default function App() {
  return <ErrorBoundary><QueryClientProvider client={queryClient}><AuthProvider onSessionChange={clearPrivateCache}><AccessProvider><PwaProvider><Suspense fallback={<Loading/>}><RouterProvider router={router}/></Suspense></PwaProvider></AccessProvider></AuthProvider></QueryClientProvider></ErrorBoundary>
}
