import { supabase } from './supabase'
import { ReadRequestError, readTimeoutMs } from './requests'
import type { ReadOptions } from './requests'

export async function rpc<T>(name: string, args = {}, options?: ReadOptions): Promise<T> {
  if (!supabase) throw new Error('Sessão indisponível')
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort(options?.signal?.reason)
  const timer = options ? setTimeout(() => { timedOut = true; controller.abort(new DOMException('Request timed out', 'TimeoutError')) }, options.timeoutMs ?? readTimeoutMs) : undefined
  if (options?.signal?.aborted) cancel()
  options?.signal?.addEventListener('abort', cancel, { once: true })
  try {
    const request = supabase.rpc(name, args)
    const { data, error, status } = await (options ? request.abortSignal(controller.signal) : request)
    if (timedOut) throw new ReadRequestError('timeout', 'A consulta não respondeu a tempo.')
    if (options?.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError')
    if (error) {
      if (!status) throw new ReadRequestError('network', 'Não foi possível acessar o servidor.')
      throw Object.assign(error, { status })
    }
    return data as T
  } finally {
    clearTimeout(timer)
    options?.signal?.removeEventListener('abort', cancel)
  }
}
