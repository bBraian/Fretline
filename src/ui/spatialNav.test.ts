/**
 * O direcional nas telas de formulário: o próximo foco é o vizinho de
 * verdade naquela direção, não o primeiro da lista nem o mais perto em
 * linha reta.
 */

import { describe, expect, it } from 'vitest'
import { pickInDirection, type Rect } from './spatialNav'

function box(left: number, top: number, width: number, height: number): Rect {
  return { left, top, right: left + width, bottom: top + height }
}

describe('pickInDirection', () => {
  // Uma coluna de linhas de loja, e o botão de comprar à esquerda, no pé do
  // visor.
  const linhas = [box(700, 100, 400, 60), box(700, 164, 400, 60), box(700, 228, 400, 60)]
  const comprar = box(80, 560, 240, 50)
  const voltar = box(20, 660, 120, 40)

  it('para baixo, a linha seguinte', () => {
    expect(pickInDirection(linhas[0], [...linhas, comprar, voltar], 'down')).toBe(1)
  })

  it('para cima da primeira linha, nada', () => {
    expect(pickInDirection(linhas[0], [...linhas, comprar, voltar], 'up')).toBe(-1)
  })

  it('não confunde o vizinho do lado com o de baixo', () => {
    const esquerda = box(0, 0, 100, 40)
    const direita = box(110, 0, 100, 40)
    const embaixo = box(0, 60, 100, 40)
    expect(pickInDirection(esquerda, [direita, embaixo], 'down')).toBe(1)
    expect(pickInDirection(esquerda, [direita, embaixo], 'right')).toBe(0)
  })

  it('para a esquerda de uma linha, o botão do visor, mesmo mais abaixo', () => {
    expect(pickInDirection(linhas[1], [...linhas, comprar, voltar], 'left')).toBe(3)
  })

  it('prefere o alinhado ao que está perto mas deslocado', () => {
    const origem = box(100, 0, 100, 40)
    const alinhado = box(100, 120, 100, 40)
    const deslocado = box(400, 60, 100, 40)
    expect(pickInDirection(origem, [deslocado, alinhado], 'down')).toBe(1)
  })

  it('aceita a borda encostada de uma linha na seguinte', () => {
    const cima = box(0, 0, 200, 50)
    const baixo = box(0, 48, 200, 50)
    expect(pickInDirection(cima, [baixo], 'down')).toBe(0)
  })

  it('ignora o próprio ponto de partida', () => {
    expect(pickInDirection(linhas[0], [linhas[0]], 'down')).toBe(-1)
  })
})
