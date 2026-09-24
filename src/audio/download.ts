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
}

export async function loadTrack<T>(
  url: string,
  decode: (data: ArrayBuffer) => Promise<T>,
  { signal, onProgress }: LoadOptions = {},
): Promise<T> {
  const data = await download(url, signal, onProgress)
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
): Promise<ArrayBuffer> {
  try {
    signal?.throwIfAborted()
    const response = await fetch(url, { signal })
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
    throw new TrackLoadError('network', `Não consegui baixar ${url}`, { cause: error })
  }
}
