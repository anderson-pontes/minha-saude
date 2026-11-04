import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Download, RefreshCw, Share, WifiOff, X } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog } from './dialog'
import { hasUnsavedForms } from '../lib/unsaved'

type InstallEvent=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>}
type PwaState={installed:boolean;available:boolean;ios:boolean;showBanner:boolean;open:()=>void;dismiss:()=>void;online:boolean}
const PwaContext=createContext<PwaState>({installed:false,available:false,ios:false,showBanner:false,open:()=>{},dismiss:()=>{},online:true})
const preference='minha-saude:pwa-remind-after'
function deferredUntil(){try{return Number(localStorage.getItem(preference))||0}catch{return 0}}
function standalone(){return window.matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & {standalone?:boolean}).standalone}
export function PwaProvider({children}:{children:ReactNode}){
  const [event,setEvent]=useState<InstallEvent|null>(null)
  const [installed,setInstalled]=useState(standalone)
  const [online,setOnline]=useState(navigator.onLine)
  const [remindAfter,setRemindAfter]=useState(deferredUntil)
  const [displayTime]=useState(()=>Date.now())
  const [guide,setGuide]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [updateMessage,setUpdateMessage]=useState('')
  const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)
  const {needRefresh:[needRefresh,setNeedRefresh],updateServiceWorker}=useRegisterSW({
    onRegisterError:()=>setError('Não foi possível preparar a instalação agora. Tente novamente quando houver conexão.'),
    onRegisteredSW:(_url,registration)=>{if(registration)void registration.update().catch(()=>{})},
  })
  useEffect(()=>{
    const prompt=(e:Event)=>{e.preventDefault();setEvent(e as InstallEvent)}
    const complete=()=>{setInstalled(true);setEvent(null);setGuide(false)}
    const up=()=>setOnline(true),down=()=>setOnline(false)
    const media=window.matchMedia('(display-mode: standalone)')
    const mode=()=>setInstalled(standalone())
    window.addEventListener('beforeinstallprompt',prompt);window.addEventListener('appinstalled',complete)
    window.addEventListener('online',up);window.addEventListener('offline',down);media.addEventListener('change',mode)
    return()=>{window.removeEventListener('beforeinstallprompt',prompt);window.removeEventListener('appinstalled',complete);window.removeEventListener('online',up);window.removeEventListener('offline',down);media.removeEventListener('change',mode)}
  },[])
  function dismiss(){const until=Date.now()+7*86400000;setRemindAfter(until);try{localStorage.setItem(preference,String(until))}catch{/* UI preference only. */}}
  async function install(){
    if(!event||busy||installed)return
    setBusy(true);setError('')
    try{await event.prompt();const choice=await event.userChoice;setEvent(null);if(choice.outcome==='accepted')setInstalled(true);else dismiss();setGuide(false)}
    catch{setEvent(null);setError('O navegador não iniciou a instalação. Use as instruções do menu do navegador.')}
    finally{setBusy(false)}
  }
  async function update(){
    if(hasUnsavedForms()){setUpdateMessage('Salve ou descarte as alterações do formulário antes de atualizar.');return}
    if(!online){setUpdateMessage('Conecte-se à internet para atualizar o aplicativo.');return}
    setUpdateMessage('');await updateServiceWorker(true)
  }
  const available=!!event&&!installed
  return <PwaContext.Provider value={{installed,available,ios,showBanner:!installed&&(available||ios)&&displayTime>remindAfter,open:()=>{setError('');setGuide(true)},dismiss,online}}>
    {!online&&<div className="connection-notice" role="status"><WifiOff size={18}/><span>Você está sem internet. Os cadastros precisam de conexão. Alterações não serão enviadas até a conexão voltar.</span></div>}
    {children}
    {needRefresh&&<aside className="pwa-update" aria-label="Atualização disponível"><div><strong>Nova versão disponível</strong><p>Atualize quando terminar suas alterações.</p>{updateMessage&&<p role="status">{updateMessage}</p>}</div><Button onClick={()=>void update()}><RefreshCw size={16}/>Atualizar</Button><Button variant="ghost" aria-label="Adiar atualização" onClick={()=>setNeedRefresh(false)}><X size={17}/></Button></aside>}
    {guide&&!installed&&<Dialog title={ios?'Adicionar à Tela de Início':available?'Instalar Minha Saúde':'Como instalar o Minha Saúde'} close={()=>{if(!busy)setGuide(false)}} className="install-guide" dismissOnOutside>
      <p>Leve sua rede de saúde com você. A consulta aos cadastros continua exigindo internet.</p>
      {ios?<ol><li><Share size={16}/>Abra o menu <strong>Compartilhar</strong> do Safari.</li><li>Escolha <strong>Adicionar à Tela de Início</strong>.</li><li>Confirme em <strong>Adicionar</strong>.</li></ol>:available?<><p>O navegador abrirá a confirmação de instalação após você tocar no botão.</p><Button className="full" disabled={busy} onClick={()=>void install()}><Download size={17}/>{busy?'Abrindo instalação…':'Instalar Minha Saúde'}</Button></>:<ol><li>Abra o menu do Chrome ou Edge.</li><li>Procure <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li><li>Se essa opção não aparecer, use um navegador compatível e uma conexão HTTPS. A oferta de instalação é controlada pelo navegador.</li></ol>}
      {error&&<p role="alert" className="field-error">{error}</p>}<Button variant="ghost" disabled={busy} onClick={()=>{dismiss();setGuide(false)}}>Agora não</Button>
    </Dialog>}
  </PwaContext.Provider>
}
export function PwaInstallPrompt(){const pwa=useContext(PwaContext);if(!pwa.showBanner)return null;return <section className="pwa-install-card"><span className="category-icon teal"><Download size={22}/></span><div><h2>Leve sua rede de saúde com você.</h2><p>Acesse o Minha Saúde pela tela inicial do celular.</p><Button variant="outline" onClick={pwa.open}>{pwa.ios?'Como adicionar à Tela de Início':'Instalar aplicativo'}</Button></div><Button variant="ghost" aria-label="Adiar instalação" onClick={pwa.dismiss}><X size={17}/></Button></section>}
export function PwaMenuItem(){const pwa=useContext(PwaContext);if(pwa.installed)return null;return <Button variant="ghost" onClick={pwa.open}><Download size={16}/>{pwa.available?'Instalar Minha Saúde':pwa.ios?'Adicionar à Tela de Início':'Como instalar o aplicativo'}</Button>}
