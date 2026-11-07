export type ReadOptions = { signal?: AbortSignal; timeoutMs?: number }
export class ReadRequestError extends Error {
  kind: 'timeout' | 'network'
  constructor(kind: 'timeout' | 'network', message: string) { super(message); this.name = 'ReadRequestError'; this.kind = kind }
}
const configuredTimeout = Number(import.meta.env.VITE_READ_TIMEOUT_MS)
export const readTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 1000
  ? Math.min(configuredTimeout, 60000) : 15000

// Only technical metadata is emitted: never query strings, request bodies or credentials.
export const measuredFetch: typeof fetch = async (input, init) => {
  const started = performance.now()
  const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin).pathname
  const requestId = crypto.randomUUID()
  const emit = (status: number | null, outcome: string, serverRequestId?: string | null) => {
    if (!import.meta.env.DEV) return
    const metric = { requestId, path, method: init?.method || 'GET', status, outcome,
      durationMs: Math.round(performance.now() - started), serverRequestId: serverRequestId || undefined }
    console.debug('[Minha Saúde HTTP]', metric)
    window.dispatchEvent(new CustomEvent('minha-saude:request', { detail: metric }))
  }
  try {
    const response = await fetch(input, init)
    emit(response.status, response.ok ? 'success' : 'http-error', response.headers.get('sb-request-id') || response.headers.get('x-request-id') || response.headers.get('cf-ray'))
    return response
  } catch (error) {
    emit(null, init?.signal?.aborted ? (init.signal.reason?.name === 'TimeoutError' ? 'timeout' : 'aborted') : 'network-error')
    throw error
  }
}

export function retryRead(failureCount: number, error: unknown) {
  const e = error as { status?: number; code?: string; name?: string; kind?: string }
  if (e.kind === 'timeout') return false
  if (e.name === 'AbortError' || ['42501', '57014', 'PGRST301', 'PGRST302'].includes(e.code || '')) return false
  if (e.status && e.status >= 400 && e.status < 500 && ![408, 429].includes(e.status)) return false
  return failureCount < 1
}
export const readQueryPolicy = { staleTime: 60000, gcTime: 300000, retry: retryRead,
  retryDelay: (attempt: number) => Math.min(500 * 2 ** attempt, 2000), refetchOnWindowFocus: false }
