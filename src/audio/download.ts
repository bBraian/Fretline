/**
 * Baixar uma faixa sabendo quanto falta.
 *
 * `response.arrayBuffer()` só responde no fim: com 31 MB numa conexão
 * lenta, a tela ficava meio minuto sem dizer nada. Lendo o corpo aos
 * pedaços contra o `Content-Length`, cada pedaço vira progresso.
 *
 * A falha vem classificada, porque o que o jogador pode fazer muda: rede
 * se tenta de novo; um arquivo que não decodifica, não adianta. Cancelar
 * não é falha — rejeita com o `AbortError` do próprio sinal, para quem
 * chama sair calado.
 */

import { STALL_MS, watchStall } from '../net/stall'

export interface TrackProgress {
  state: 'waiting' | 'receiving' | 'done'
  loaded: number
  /** Do `Content-Length`; ausente quando o servidor não informa. */
  total?: number
}

export class TrackLoadError extends Error {
  readonly kind: 'network' | 'decode'
  /** O status HTTP, quando a falha foi uma resposta de erro. */
  readonly status?: number

  constructor(
    kind: 'network' | 'decode',
    message: string,
    options?: ErrorOptions & { status?: number },
  ) {
    super(message, options)
    this.name = 'TrackLoadError'
    this.kind = kind
    this.status = options?.status
  }
}

interface LoadOptions {
  signal?: AbortSignal
  onProgress?: (progress: TrackProgress) => void
  /** Quanto tempo sem chegar nada até desistir desta tentativa. */
  stallMs?: number
}

/**
 * O progresso de uma nova tentativa sobre o da anterior.
 *
 * A tentativa nova recomeça do zero, e relatar isso faria a barra andar
 * para trás. Até terminar, vale o máximo do que já tinha chegado.
 */
export function keepProgress(anterior: TrackProgress, novo: TrackProgress): TrackProgress {
  if (novo.state === 'done') return novo
  return {
    ...novo,
    loaded: Math.max(anterior.loaded, novo.loaded),
    total: novo.total ?? anterior.total,
  }
}

/**
 * Carrega vários de uma vez; a primeira falha cancela as outras.
 *
 * Sem isto, uma faixa com 404 rejeitava a partida enquanto as outras seis
 * continuavam descendo — até 30 MB baixados para o painel de erro.
 */
export async function loadAll<T, R>(
  items: readonly T[],
  load: (item: T, signal: AbortSignal) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const irmas = new AbortController()
  const combinado = signal ? AbortSignal.any([signal, irmas.signal]) : irmas.signal
  return Promise.all(
    items.map(async (item) => {
      try {
        return await load(item, combinado)
      } catch (error) {
        irmas.abort()
        throw error
      }
    }),
  )
}

export async function loadTrack<T>(
  url: string,
  decode: (data: ArrayBuffer) => Promise<T>,
  { signal, onProgress, stallMs = STALL_MS }: LoadOptions = {},
): Promise<T> {
  const data = await download(url, signal, onProgress, stallMs)
  try {
    return await decode(data)
  } catch (error) {
    if (signal?.aborted) throw signal.reason
    throw new TrackLoadError('decode', `Não consegui decodificar ${url}`, { cause: error })
  }
}

async function download(
  url: string,
  signal: AbortSignal | undefined,
  onProgress: LoadOptions['onProgress'],
  stallMs: number,
): Promise<ArrayBuffer> {
  const vigia = watchStall(stallMs)
  const sinal = signal ? AbortSignal.any([signal, vigia.signal]) : vigia.signal
  try {
    signal?.throwIfAborted()
    const response = await fetch(url, { signal: sinal })
    vigia.touch()
    if (!response.ok) {
      throw new TrackLoadError('network', `${url} respondeu ${response.status}`, {
        status: response.status,
      })
    }

    const header = Number(response.headers.get('Content-Length'))
    const total = header > 0 ? header : undefined
    onProgress?.({ state: 'receiving', loaded: 0, total })

    if (!response.body) {
      const data = await response.arrayBuffer()
      onProgress?.({ state: 'done', loaded: data.byteLength, total })
      return data
    }

    const reader = response.body.getReader()
    const pedacos: Uint8Array[] = []
    let loaded = 0
    for (;;) {
      signal?.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      vigia.touch()
      pedacos.push(value)
      loaded += value.byteLength
      onProgress?.({ state: 'receiving', loaded, total })
    }

    const data = new Uint8Array(loaded)
    let offset = 0
    for (const pedaco of pedacos) {
      data.set(pedaco, offset)
      offset += pedaco.byteLength
    }
    onProgress?.({ state: 'done', loaded, total })
    return data.buffer
  } catch (error) {
    if (signal?.aborted) throw signal.reason
    if (error instanceof TrackLoadError) throw error
    const motivo = vigia.signal.aborted ? `${url} parou de chegar` : `Não consegui baixar ${url}`
    throw new TrackLoadError('network', motivo, { cause: error })
  } finally {
    vigia.stop()
  }
}
