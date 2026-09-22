/**
 * O sorteio dos efeitos que têm mais de uma versão.
 *
 * É a única parte do banco de samples que roda fora do navegador, e é
 * justamente a que tem regra própria: `Math.random()` puro repete o mesmo
 * som duas e três vezes seguidas com facilidade, e num jogo de ritmo o erro
 * de nota acontece em rajada — a repetição fica óbvia.
 */

import { describe, expect, it } from 'vitest'
import { ShuffleBag } from './sfx'

/** Gerador determinístico, para o teste não depender da sorte. */
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

describe('ShuffleBag', () => {
  it('só devolve itens do conjunto', () => {
    const bag = new ShuffleBag(['a', 'b', 'c'], seeded(1))
    for (let i = 0; i < 50; i++) expect(['a', 'b', 'c']).toContain(bag.next())
  })

  it('passa por todos os itens antes de repetir qualquer um', () => {
    const items = ['a', 'b', 'c', 'd']
    const bag = new ShuffleBag(items, seeded(7))

    // Cinco voltas: cada janela do tamanho do conjunto é uma permutação.
    for (let volta = 0; volta < 5; volta++) {
      const tirados = items.map(() => bag.next())
      expect([...tirados].sort()).toEqual([...items].sort())
    }
  })

  it('não repete o item na emenda entre duas voltas', () => {
    // O ponto fraco do saco: a volta pode terminar em X e a seguinte
    // começar em X, produzindo o par repetido que o saco existe para evitar.
    for (let seed = 1; seed <= 40; seed++) {
      const bag = new ShuffleBag(['a', 'b', 'c'], seeded(seed))
      let anterior = bag.next()
      for (let i = 0; i < 30; i++) {
        const atual = bag.next()
        expect(atual).not.toBe(anterior)
        anterior = atual
      }
    }
  })

  it('com dois itens, alterna — é o melhor possível sem repetir', () => {
    const bag = new ShuffleBag(['a', 'b'], seeded(3))
    const saida = Array.from({ length: 8 }, () => bag.next())
    for (let i = 1; i < saida.length; i++) expect(saida[i]).not.toBe(saida[i - 1])
  })

  it('com um item só, devolve sempre ele e não entra em laço', () => {
    const bag = new ShuffleBag(['a'], seeded(5))
    expect(Array.from({ length: 5 }, () => bag.next())).toEqual(['a', 'a', 'a', 'a', 'a'])
  })

  it('embaralha de verdade: sementes diferentes dão ordens diferentes', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    const ordem = (seed: number) => {
      const bag = new ShuffleBag(items, seeded(seed))
      return items.map(() => bag.next()).join('')
    }
    const ordens = new Set([1, 2, 3, 4, 5, 6].map(ordem))
    expect(ordens.size).toBeGreaterThan(1)
  })
})
