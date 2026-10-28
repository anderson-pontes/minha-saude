import { Component, type ReactNode } from 'react'
import { HeartPulse, LoaderCircle, SearchX } from 'lucide-react'
import { Button } from './ui/button'
export function Brand() { return <span className="brand"><span className="brand-icon"><HeartPulse size={24} /></span><span>minha<span className="brand-light">saúde</span><small>SEU CUIDADO, POR PERTO</small></span></span> }
export function Loading() { return <div className="loading-state" role="status"><p><LoaderCircle className="spin" size={18}/> Carregando seu espaço…</p><div className="loading-skeleton" aria-hidden="true"><span/><span/><span/></div></div> }
export function Empty({ title, description }: { title: string; description: string }) { return <div className="empty"><span className="empty-icon"><SearchX size={30} /></span><h3>{title}</h3><p>{description}</p></div> }
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <main className="state"><h1>Não foi possível abrir esta página</h1><p>Tente carregar novamente.</p><Button onClick={() => window.location.reload()}>Recarregar</Button></main> : this.props.children }
}
