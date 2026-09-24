import { describe, expect, it } from 'vitest'
import { mapInOrder } from './mapInOrder'

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('mapInOrder', () => {
  it('devolve na ordem da entrada, mesmo terminando fora de ordem', async () => {
    const atrasos = [30, 5, 20, 1]
    const out = await mapInOrder(atrasos, 4, async (ms, i) => {
      await esperar(ms)
      return i
    })
    expect(out).toEqual([0, 1, 2, 3])
  })

  it('nunca passa do limite de tarefas no ar', async () => {
    let noAr = 0
    let pico = 0
    await mapInOrder(Array.from({ length: 20 }, (_, i) => i), 6, async () => {
      pico = Math.max(pico, ++noAr)
      await esperar(2)
      noAr--
    })
    expect(pico).toBe(6)
  })

  it('conta o progresso até o total', async () => {
    const chamadas: Array<[number, number]> = []
    await mapInOrder([1, 2, 3], 2, async (x) => x, (feitos, total) => chamadas.push([feitos, total]))
    expect(chamadas).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ])
  })

  it('um item que falhou e virou null não atrapalha os outros', async () => {
    const out = await mapInOrder(['a', 'ruim', 'c'], 2, async (x) => (x === 'ruim' ? null : x))
    expect(out).toEqual(['a', null, 'c'])
  })

  it('lista vazia devolve vazio sem chamar o progresso', async () => {
    let chamou = false
    expect(await mapInOrder([], 6, async (x) => x, () => (chamou = true))).toEqual([])
    expect(chamou).toBe(false)
  })
})
