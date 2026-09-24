import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOk } from './fetchOk'

const semEspera = { wait: async () => {} }
const texto = (response: Response) => response.text()

describe('fetchOk', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('devolve o corpo lido de uma resposta boa', async () => {
    vi.stubGlobal('fetch', async () => new Response('ok'))
    expect(await fetchOk('x', texto, { retry: semEspera })).toBe('ok')
  })

  it('um 404 falha com o status, sem insistir', async () => {
    let pedidos = 0
    vi.stubGlobal('fetch', async () => {
      pedidos++
      return new Response(null, { status: 404 })
    })
    const erro = await fetchOk('x', texto, { retry: semEspera }).catch((e) => e)
    expect(erro.status).toBe(404)
    expect(pedidos).toBe(1)
  })

  it('um 503 passageiro é tentado de novo', async () => {
    let pedidos = 0
    vi.stubGlobal('fetch', async () =>
      pedidos++ === 0 ? new Response(null, { status: 503 }) : new Response('ok'),
    )
    expect(await fetchOk('x', texto, { retry: semEspera })).toBe('ok')
    expect(pedidos).toBe(2)
  })

  it('um pedido pendurado vira falha de tempo, em vez de esperar para sempre', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      (_url: string, init?: RequestInit) =>
        new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))),
    )
    const promessa = fetchOk('x', texto, { stallMs: 1000, retry: { delays: [] } }).catch((e) => e)
    await vi.advanceTimersByTimeAsync(1000)
    expect((await promessa).name).toBe('TimeoutError')
  })
})
