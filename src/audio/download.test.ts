import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrackLoadError, loadTrack, type TrackProgress } from './download'

/** Uma resposta com o corpo em pedaços, como a rede entrega. */
function resposta(pedacos: number[], { comTamanho = true, status = 200 } = {}) {
  const total = pedacos.reduce((a, b) => a + b, 0)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const n of pedacos) controller.enqueue(new Uint8Array(n))
      controller.close()
    },
  })
  const headers: Record<string, string> = comTamanho ? { 'Content-Length': String(total) } : {}
  return new Response(body, { status, headers })
}

const tamanho = async (data: ArrayBuffer) => data.byteLength

afterEach(() => vi.unstubAllGlobals())

describe('loadTrack', () => {
  it('relata os bytes recebidos contra o Content-Length', async () => {
    vi.stubGlobal('fetch', async () => resposta([100, 200, 300]))
    const vistos: TrackProgress[] = []
    const bytes = await loadTrack('a.opus', tamanho, { onProgress: (p) => vistos.push(p) })

    expect(bytes).toBe(600)
    expect(vistos[0]).toEqual({ state: 'receiving', loaded: 0, total: 600 })
    expect(vistos.at(-1)).toEqual({ state: 'done', loaded: 600, total: 600 })
    expect(vistos.some((p) => p.loaded > 0 && p.loaded < 600)).toBe(true)
    const carregados = vistos.map((p) => p.loaded)
    expect(carregados).toEqual([...carregados].sort((a, b) => a - b))
  })

  it('sem Content-Length, o total fica desconhecido', async () => {
    vi.stubGlobal('fetch', async () => resposta([100, 200], { comTamanho: false }))
    const vistos: TrackProgress[] = []
    await loadTrack('a.opus', tamanho, { onProgress: (p) => vistos.push(p) })
    expect(vistos[0].total).toBeUndefined()
    expect(vistos.at(-1)).toEqual({ state: 'done', loaded: 300, total: undefined })
  })

  it('um status de erro é falha de rede', async () => {
    vi.stubGlobal('fetch', async () => resposta([10], { status: 404 }))
    const erro = await loadTrack('a.opus', tamanho).catch((e) => e)
    expect(erro).toBeInstanceOf(TrackLoadError)
    expect(erro.kind).toBe('network')
    expect(erro.message).toContain('404')
    expect(erro.status).toBe(404)
  })

  it('um fetch que rejeita é falha de rede', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    const erro = await loadTrack('a.opus', tamanho).catch((e) => e)
    expect(erro).toBeInstanceOf(TrackLoadError)
    expect(erro.kind).toBe('network')
  })

  it('um áudio que não decodifica é falha de decodificação', async () => {
    vi.stubGlobal('fetch', async () => resposta([10]))
    const erro = await loadTrack('a.opus', async () => {
      throw new DOMException('Unable to decode audio data', 'EncodingError')
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(TrackLoadError)
    expect(erro.kind).toBe('decode')
  })

  it('cancelar no meio rejeita com AbortError, e não como falha', async () => {
    vi.stubGlobal('fetch', async () => resposta([100, 100, 100]))
    const controller = new AbortController()
    const erro = await loadTrack('a.opus', tamanho, {
      signal: controller.signal,
      onProgress: (p) => {
        if (p.loaded > 0) controller.abort()
      },
    }).catch((e) => e)
    expect(erro).not.toBeInstanceOf(TrackLoadError)
    expect(erro.name).toBe('AbortError')
  })

  it('já cancelado, nem pede', async () => {
    const pedir = vi.fn(async () => resposta([10]))
    vi.stubGlobal('fetch', pedir)
    const controller = new AbortController()
    controller.abort()
    const erro = await loadTrack('a.opus', tamanho, { signal: controller.signal }).catch((e) => e)
    expect(erro.name).toBe('AbortError')
    expect(pedir).not.toHaveBeenCalled()
  })
})
