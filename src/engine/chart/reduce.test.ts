import { describe, expect, it } from 'vitest'
import { fillMissingDifficulties, reduceChart } from './reduce'
import { countFrets, fretsToArray, type Chart, type Note } from '../types'

const BEAT = 0.5
const beats = Array.from({ length: 200 }, (_, i) => i * BEAT)

/** Chart de expert sintético: posições em batidas, trastes por índice. */
function expertOf(
  specs: Array<{ beat: number; frets: number; duration?: number; open?: boolean }>,
): Chart {
  const notes: Note[] = specs.map((s, i) => ({
    index: i,
    time: s.beat * BEAT,
    duration: (s.duration ?? 0) * BEAT,
    frets: s.frets,
    type: 'strum',
    isOpen: s.open ?? false,
  }))
  return { difficulty: 'expert', notes, starPower: [], beats }
}

const G = 0b00001
const R = 0b00010
const Y = 0b00100
const B = 0b01000
const O = 0b10000

describe('grade de subdivisão', () => {
  it('o fácil guarda uma nota por batida', () => {
    // Quatro semicolcheias dentro da mesma batida.
    const source = expertOf([
      { beat: 0, frets: G },
      { beat: 0.25, frets: R },
      { beat: 0.5, frets: Y },
      { beat: 0.75, frets: B },
      { beat: 1, frets: G },
    ])
    const easy = reduceChart(source, 'easy')
    expect(easy.notes).toHaveLength(2)
    expect(easy.notes.map((n) => n.time)).toEqual([0, BEAT])
  })

  it('o médio guarda uma nota por colcheia', () => {
    const source = expertOf([
      { beat: 0, frets: G },
      { beat: 0.25, frets: R },
      { beat: 0.5, frets: Y },
      { beat: 0.75, frets: B },
    ])
    expect(reduceChart(source, 'medium').notes).toHaveLength(2)
  })

  it('fica a primeira nota da célula, que é a do tempo forte', () => {
    const source = expertOf([
      { beat: 0, frets: O },
      { beat: 0.3, frets: G },
    ])
    const easy = reduceChart(source, 'easy')
    expect(easy.notes).toHaveLength(1)
    expect(easy.notes[0].time).toBe(0)
  })

  it('o difícil mantém quase tudo', () => {
    const source = expertOf(
      Array.from({ length: 8 }, (_, i) => ({ beat: i * 0.25, frets: G << (i % 3) })),
    )
    expect(reduceChart(source, 'hard').notes.length).toBeGreaterThanOrEqual(7)
  })
})

describe('alcance de trastes', () => {
  it('o fácil usa três trastes', () => {
    const source = expertOf([
      { beat: 0, frets: O },
      { beat: 1, frets: B },
      { beat: 2, frets: Y },
    ])
    const easy = reduceChart(source, 'easy')
    for (const note of easy.notes) {
      for (const lane of fretsToArray(note.frets)) expect(lane).toBeLessThanOrEqual(2)
    }
  })

  it('o médio usa quatro', () => {
    const source = expertOf([{ beat: 0, frets: O }])
    expect(fretsToArray(reduceChart(source, 'medium').notes[0].frets)[0]).toBeLessThanOrEqual(3)
  })

  it('o difícil mantém os cinco', () => {
    const source = expertOf([{ beat: 0, frets: O }])
    expect(reduceChart(source, 'hard').notes[0].frets).toBe(O)
  })
})

describe('acordes', () => {
  it('somem no fácil e no médio', () => {
    const source = expertOf([{ beat: 0, frets: G | Y | O }])
    expect(countFrets(reduceChart(source, 'easy').notes[0].frets)).toBe(1)
    expect(countFrets(reduceChart(source, 'medium').notes[0].frets)).toBe(1)
  })

  it('viram no máximo duas notas no difícil', () => {
    const source = expertOf([{ beat: 0, frets: G | Y | B | O }])
    expect(countFrets(reduceChart(source, 'hard').notes[0].frets)).toBe(2)
  })

  it('o que fica de um acorde são os trastes mais graves', () => {
    const source = expertOf([{ beat: 0, frets: R | B | O }])
    expect(reduceChart(source, 'hard').notes[0].frets).toBe(R | B)
  })
})

describe('adaptações ao jogo sem palhetada', () => {
  it('nos níveis baixos, duas notas seguidas trocam de traste', () => {
    // Repetir o mesmo traste exige soltar e apertar de novo — o movimento
    // mais difícil deste jogo, e o menos adequado a um nível inicial.
    const source = expertOf([
      { beat: 0, frets: R },
      { beat: 1, frets: R },
    ])
    const easy = reduceChart(source, 'easy')
    expect(easy.notes[0].frets).not.toBe(easy.notes[1].frets)
  })

  it('o difícil mantém as notas repetidas', () => {
    const source = expertOf([
      { beat: 0, frets: R },
      { beat: 1, frets: R },
    ])
    const hard = reduceChart(source, 'hard')
    expect(hard.notes[0].frets).toBe(hard.notes[1].frets)
  })

  it('nota aberta some dos níveis baixos', () => {
    const source = expertOf([{ beat: 0, frets: 0, open: true }])
    expect(reduceChart(source, 'easy').notes[0].isOpen).toBe(false)
    expect(reduceChart(source, 'hard').notes[0].isOpen).toBe(true)
  })
})

describe('sustains', () => {
  it('sustain curto vira nota seca no fácil', () => {
    const source = expertOf([{ beat: 0, frets: G, duration: 0.5 }])
    expect(reduceChart(source, 'easy').notes[0].duration).toBe(0)
  })

  it('sustain longo é preservado', () => {
    const source = expertOf([{ beat: 0, frets: G, duration: 2 }])
    expect(reduceChart(source, 'easy').notes[0].duration).toBeCloseTo(2 * BEAT, 6)
  })
})

describe('teto de densidade', () => {
  /** Expert longo e denso: semicolcheias por dois minutos. */
  const dense = expertOf(
    Array.from({ length: 960 }, (_, i) => ({ beat: i * 0.25, frets: 1 << (i % 5) })),
  )

  function notesPerSecond(chart: Chart) {
    const span = chart.notes.at(-1)!.time - chart.notes[0].time
    return chart.notes.length / span
  }

  it('o médio fica perto da densidade de um chart de verdade', () => {
    // Um chart feito à mão com os quatro níveis dá 1,4 notas por segundo no
    // médio. Sem teto, a grade de colcheias sozinha entregaria quase quatro.
    expect(notesPerSecond(reduceChart(dense, 'medium'))).toBeLessThanOrEqual(1.7)
  })

  it('o fácil fica em torno de uma nota por segundo', () => {
    expect(notesPerSecond(reduceChart(dense, 'easy'))).toBeLessThanOrEqual(1.1)
  })

  it('o difícil é mais denso que o médio, e menos que o expert', () => {
    const hard = notesPerSecond(reduceChart(dense, 'hard'))
    const medium = notesPerSecond(reduceChart(dense, 'medium'))
    expect(hard).toBeGreaterThan(medium)
    expect(hard).toBeLessThanOrEqual(2.7)
  })

  it('trecho curto demais não é afinado por densidade', () => {
    // Medir notas por segundo em dois segundos de música é ruído; afinar por
    // essa medida transformaria uma frase inteira numa nota só.
    const short = expertOf([
      { beat: 0, frets: G },
      { beat: 0.5, frets: R },
      { beat: 1, frets: Y },
      { beat: 1.5, frets: B },
    ])
    expect(reduceChart(short, 'medium').notes).toHaveLength(4)
  })
})

describe('preenchimento em cascata', () => {
  const expert = expertOf(
    Array.from({ length: 64 }, (_, i) => ({ beat: i * 0.25, frets: 1 << (i % 5) })),
  )

  it('cria os três níveis ausentes a partir do expert', () => {
    const filled = fillMissingDifficulties({ expert })
    expect(Object.keys(filled).sort()).toEqual(['easy', 'expert', 'hard', 'medium'])
  })

  it('a densidade nunca diminui com a dificuldade', () => {
    const filled = fillMissingDifficulties({ expert })
    const counts = (['easy', 'medium', 'hard', 'expert'] as const).map(
      (level) => filled[level]!.notes.length,
    )

    // O difícil pode empatar com o expert: a grade dele já comporta
    // semicolcheias, então uma fonte nessa subdivisão passa inteira.
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1])
    }

    // O que precisa valer sempre é a rampa existir de ponta a ponta.
    expect(counts[0]).toBeLessThan(counts[1])
    expect(counts[1]).toBeLessThan(counts[2])
    expect(counts[0] * 3).toBeLessThanOrEqual(counts[3])
  })

  it('não mexe no que o chart já trazia', () => {
    const medium: Chart = { ...expertOf([{ beat: 0, frets: G }]), difficulty: 'medium' }
    const filled = fillMissingDifficulties({ expert, medium })
    expect(filled.medium).toBe(medium)
  })

  it('funciona a partir de qualquer nível disponível', () => {
    const hard: Chart = { ...expert, difficulty: 'hard' }
    const filled = fillMissingDifficulties({ hard })
    expect(filled.easy).toBeDefined()
    expect(filled.medium).toBeDefined()
    expect(filled.expert).toBeUndefined()
  })

  it('música sem nenhum chart continua sem', () => {
    expect(fillMissingDifficulties({})).toEqual({})
  })
})
