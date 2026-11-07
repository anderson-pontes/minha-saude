import {useEffect,useState} from 'react'
import {Link,NavLink,Outlet,useLocation} from 'react-router-dom'
import {CalendarDays,HeartPulse,House,LogOut,Menu,ShieldCheck,Tags,HeartHandshake} from 'lucide-react'
import {useAuth} from '../lib/auth'
import {useAccess} from '../lib/access'
import {supabase} from '../lib/supabase'
import {sections} from '../lib/navigation'
import {Brand} from './feedback'
import {Button} from './ui/button'
import {Dialog} from './dialog'
import {PwaMenuItem} from './pwa'
import {NotificationBell} from './notification-bell'
import {disableDevicePush} from '../lib/agenda-push'

const links=[{path:'/',title:'Início',icon:House},{path:'/agenda',title:'Agenda',icon:CalendarDays},...sections,{path:'/convenios',title:'Convênios',icon:HeartHandshake},{path:'/especialidades',title:'Especialidades',icon:Tags}]
function Navigation({mobile=false,close}:{mobile?:boolean;close?:()=>void}) {
  const {canAdmin}=useAccess()
  return <nav aria-label={mobile?'Navegação no celular':'Navegação principal'}>{links.map(({path,title,icon:Icon})=><NavLink end={path==='/'} to={path} key={path} aria-label={title} title={title} onClick={close}><Icon size={20}/><span>{title}</span></NavLink>)}{canAdmin&&<NavLink to="/administracao/usuarios" title="Administrar acessos" aria-label="Administrar acessos" onClick={close}><ShieldCheck size={20}/><span>Administrar acessos</span></NavLink>}</nav>
}
export function AppLayout({clearPrivateCache}:{clearPrivateCache:()=>void}) {
  const {session}=useAuth();const {canAdmin}=useAccess();const location=useLocation()
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [drawerAt,setDrawerAt]=useState<string|null>(null)
  const current=location.pathname+location.search
  useEffect(()=>{const desktop=window.matchMedia('(min-width:768px)');const close=()=>setDrawerAt(null);desktop.addEventListener('change',close);window.addEventListener('popstate',close);return()=>{desktop.removeEventListener('change',close);window.removeEventListener('popstate',close)}},[])
  async function logout(){setBusy(true);setError('');try{await disableDevicePush().catch(()=>{});const result=await supabase!.auth.signOut();if(result.error)throw result.error;clearPrivateCache()}catch{setError('Não foi possível sair. Tente novamente.')}finally{setBusy(false)}}
  return <div className="app-shell"><a className="skip-link" href="#main">Pular para o conteúdo</a>
    <aside className="sidebar"><Link to="/" aria-label="Minha Saúde início"><Brand/></Link><span className="nav-label">MEU ESPAÇO</span><Navigation/><div className="sidebar-bottom"><ShieldCheck size={20}/><strong>Acesso autorizado</strong><p>Uma rede compartilhada, com favoritos só seus.</p></div></aside>
    <div className="workspace"><header className="header"><div className="mobile-header-brand"><Button variant="ghost" className="navigation-trigger" aria-label="Abrir menu de navegação" aria-expanded={drawerAt===current} aria-controls="mobile-navigation" onClick={()=>setDrawerAt(current)}><Menu size={22}/></Button><Link className="mobile-brand" to="/" aria-label="Minha Saúde início"><Brand/></Link></div><div className="desktop-header"><HeartPulse size={18}/><span>Pequenos cuidados. Mais bem-estar.</span></div><div className="account"><NotificationBell/><details className="profile-menu"><summary aria-label="Menu da conta">Conta</summary><div><PwaMenuItem/>{canAdmin&&<Link to="/administracao/usuarios">Administrar acessos</Link>}</div></details><span className="avatar" aria-hidden="true">{session?.user.email?.slice(0,1).toUpperCase()??'M'}</span><span className="account-label">Meu espaço<small>{canAdmin?'Administrador':'Consulta autorizada'}</small></span><Button variant="ghost" aria-label="Sair da conta" disabled={busy} onClick={()=>void logout()}><LogOut size={19}/></Button></div></header>
      {error&&<p role="alert" className="notice">{error}</p>}<main id="main" className="main-content"><Outlet/></main><footer className="footer">Minha Saúde<span>Feito para cuidar de você.</span></footer></div>
    {drawerAt===current&&<Dialog title="Menu de navegação" className="navigation-drawer" dismissOnOutside close={()=>setDrawerAt(null)}><div id="mobile-navigation"><Brand/><Navigation mobile close={()=>setDrawerAt(null)}/><p className="drawer-access"><ShieldCheck size={16}/>Acesso autorizado</p></div></Dialog>}
  </div>
}
