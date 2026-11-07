import { useEffect, useState, type ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { AlertTriangle, Clock3, WifiOff } from 'lucide-react'
import { Button } from './ui/button'
import { ReadRequestError } from '../lib/requests'
import type { SearchResult } from '../lib/network'

type Section = 'favorites' | 'recent'
export function DashboardFeedback({ section, error, busy, retry, cached = false }: {
  section: Section; error: unknown; busy: boolean; retry: () => void; cached?: boolean
}) {
  const failure = error as { status?: number; code?: string }
  const offline = !navigator.onLine || (error instanceof ReadRequestError && error.kind === 'network')
  const auth = [401, 403].includes(failure.status || 0) || failure.code === '42501'
  const timeout = error instanceof ReadRequestError && error.kind === 'timeout'
  const title = offline ? 'Parece que você está sem conexão.' : auth ? 'Sua sessão precisa ser verificada.'
    : timeout ? 'A consulta não respondeu a tempo.'
    : section === 'favorites' ? 'Não foi possível carregar seus favoritos.' : 'Não foi possível carregar os últimos cadastros.'
  const description = offline ? 'Verifique sua conexão com a internet e tente novamente.'
    : auth ? 'Confira o acesso da sua conta ou entre novamente para continuar.'
    : timeout ? 'A conexão demorou a responder. Tente atualizar a lista.'
    : section === 'favorites' ? 'Seus favoritos estão temporariamente indisponíveis. Tente atualizar para visualizá-los.'
    : 'Não conseguimos consultar seus registros recentes. Tente atualizar a lista.'
  const Icon = offline ? WifiOff : AlertTriangle
  return <div className="dashboard-feedback" role="alert"><Icon size={19}/><div><h3>{title}</h3><p>{description}</p>{cached && <p>Os dados carregados anteriormente continuam disponíveis.</p>}</div><Button variant="outline" disabled={busy} onClick={retry}>{busy ? 'Atualizando…' : 'Tentar novamente'}</Button></div>
}

export function DashboardSkeleton({ section }: { section: Section }) {
  return <div className={`dashboard-skeleton ${section}`} role="status" aria-label={section === 'favorites' ? 'Carregando seus favoritos' : 'Carregando os últimos cadastros'}>
    <span className="sr-only">Carregando…</span><div aria-hidden="true">{Array.from({ length: section === 'favorites' ? 2 : 3 }, (_, i) => <div className="skeleton-record" key={i}><span className="skeleton-icon"/><span className="skeleton-copy"><span/><span/></span></div>)}</div>
  </div>
}

export function DashboardContent({ query, section, empty, children }: {
  query: UseQueryResult<SearchResult, unknown>; section: Section; empty: ReactNode; children: (data: SearchResult) => ReactNode
}) {
  const [slow, setSlow] = useState(false)
  const [retryError, setRetryError] = useState<unknown>(null)
  useEffect(() => {
    if (!query.isFetching) return
    const timer = setTimeout(() => setSlow(true), 3000)
    return () => { clearTimeout(timer); setSlow(false) }
  }, [query.isFetching])
  const retry = () => {
    if (query.isFetching) return
    setRetryError(query.error)
    void query.refetch({ cancelRefetch: false }).finally(() => setRetryError(null))
  }
  const displayedError = query.fetchStatus === 'paused' ? new ReadRequestError('network', 'Consulta aguardando conexão.')
    : query.error || (query.isFetching ? retryError : null)
  return <>
    {!query.data && query.isFetching && <DashboardSkeleton section={section}/>}
    {query.isFetching && slow && <div className="dashboard-slow" role="status"><Clock3 size={17}/><div><strong>A consulta está demorando mais que o esperado.</strong><p>Ainda estamos tentando carregar as informações.</p></div></div>}
    {!!displayedError && <DashboardFeedback section={section} error={displayedError} busy={query.isFetching} retry={retry} cached={!!query.data}/>}
    {query.data && (query.data.items.length ? children(query.data) : empty)}
    {query.data && query.isFetching && !slow && <p className="dashboard-updating" role="status">Atualizando lista…</p>}
  </>
}
