/**
 * O sorteio do palco: cada música num cenário da tabela, sem repetir o da
 * anterior, e a mesma apresentação no mesmo palco.
 */

import { describe, expect, it } from 'vitest'
import { STAGE_MODELS, drawStageId, stageForShow } from './stageModel'

describe('drawStageId', () => {
  const ids = ['club', 'runway', 'liveaid', 'starry']

  it('nunca repete o anterior quando há outro para dar', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(drawStageId(ids, 'runway', () => r)).not.toBe('runway')
    }
  })

  it('cobre todos os outros', () => {
    const saidos = new Set([0, 0.34, 0.67, 0.99].map((r) => drawStageId(ids, 'club', () => r)))
    expect(saidos).toEqual(new Set(['runway', 'liveaid', 'starry']))
  })

  it('com um cenário só, repete — é o que há', () => {
    expect(drawStageId(['club'], 'club', () => 0.5)).toBe('club')
  })

  it('sem cenário nenhum, o palco de código', () => {
    expect(drawStageId([], null)).toBeNull()
  })
})

describe('stageForShow', () => {
  it('a mesma apresentação recebe o mesmo palco', () => {
    const primeiro = stageForShow(101)
    expect(stageForShow(101)).toBe(primeiro)
  })

  it('a seguinte recebe outro, da tabela', () => {
    const antes = stageForShow(201)
    const depois = stageForShow(202)
    expect(depois).not.toBe(antes)
    expect(STAGE_MODELS).toContain(depois)
  })
})
