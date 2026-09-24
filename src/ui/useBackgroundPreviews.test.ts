import { describe, expect, it } from 'vitest'
import { prefetchInOrder } from './useBackgroundPreviews'

const livre = async () => {}

describe('prefetchInOrder', () => {
  it('pede um de cada vez, na ordem', async () => {
    const eventos: string[] = []
    let noAr = 0
    let pico = 0
    await prefetchInOrder(['a', 'b', 'c'], {
      waitWhilePaused: livre,
      load: async (url) => {
        pico = Math.max(pico, ++noAr)
        eventos.push(url)
        await new Promise((resolve) => setTimeout(resolve, 2))
        noAr--
      },
    })
    expect(eventos).toEqual(['a', 'b', 'c'])
    expect(pico).toBe(1)
  })

  it('segue depois de um que falha', async () => {
    const pedidos: string[] = []
    await prefetchInOrder(['a', 'b'], {
      waitWhilePaused: livre,
      load: async (url) => {
        pedidos.push(url)
        if (url === 'a') throw new Error('rede')
      },
    })
    expect(pedidos).toEqual(['a', 'b'])
  })

  it('não pede nada enquanto está pausado', async () => {
    const pedidos: string[] = []
    let soltar!: () => void
    const pausa = new Promise<void>((resolve) => (soltar = resolve))
    const fim = prefetchInOrder(['a'], {
      waitWhilePaused: () => pausa,
      load: async (url) => {
        pedidos.push(url)
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(pedidos).toEqual([])
    soltar()
    await fim
    expect(pedidos).toEqual(['a'])
  })

  it('cancelado, para — mesmo esperando uma pausa', async () => {
    const pedidos: string[] = []
    const controller = new AbortController()
    const fim = prefetchInOrder(['a', 'b'], {
      signal: controller.signal,
      waitWhilePaused: () => new Promise<void>(() => {}),
      load: async (url) => {
        pedidos.push(url)
      },
    })
    controller.abort()
    await fim
    expect(pedidos).toEqual([])
  })
})
