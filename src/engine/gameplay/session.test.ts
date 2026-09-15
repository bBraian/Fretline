import { describe, expect, it } from 'vitest'
import { Session } from './session'
import { HIT_WINDOW, POINTS_PER_NOTE } from './rules'
import type { Chart, Note, NoteType } from '../types'

/** Monta um chart sintético: cada entrada vira uma nota num tempo exato. */
function chartOf(
  specs: Array<{ time: number; frets: number; type?: NoteType; duration?: number; open?: boolean }>,
  starPower: Array<{ start: number; end: number }> = [],
): Chart {
  const notes: Note[] = specs.map((s, i) => ({
    index: i,
    time: s.time,
    duration: s.duration ?? 0,
    frets: s.frets,
    type: s.type ?? 'strum',
    isOpen: s.open ?? false,
  }))
  // Uma batida de meio segundo, o bastante para cobrir os testes.
  const beats = Array.from({ length: 200 }, (_, i) => i * 0.5)
  return { difficulty: 'expert', notes, starPower, beats }
}

const GREEN = 0b00001
const RED = 0b00010
const YELLOW = 0b00100

describe('acerto por palhetada', () => {
  it('acerta a nota quando o traste certo está pressionado', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')
    s.update(0.9)
    s.handleInput({ kind: 'frets', mask: GREEN, time: 0.95 })
    s.handleInput({ kind: 'strum', time: 1.0 })

    expect(s.statusOf(0)).toBe('hit')
    expect(s.getState().score).toBe(POINTS_PER_NOTE)
    expect(s.getState().streak).toBe(1)
  })

  it('aceita dentro da janela e recusa fora dela', () => {
    const dentro = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')
    dentro.handleInput({ kind: 'frets', mask: GREEN, time: 0 })
    dentro.handleInput({ kind: 'strum', time: 1 - HIT_WINDOW * 0.9 })
    expect(dentro.statusOf(0)).toBe('hit')

    const fora = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')
    fora.handleInput({ kind: 'frets', mask: GREEN, time: 0 })
    fora.handleInput({ kind: 'strum', time: 1 - HIT_WINDOW * 1.5 })
    expect(fora.statusOf(0)).toBe('pending')
  })

  it('classifica como perfeito só bem no centro da janela', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')
    s.handleInput({ kind: 'frets', mask: GREEN, time: 0 })
    s.handleInput({ kind: 'strum', time: 1.005 })
    expect(s.getState().lastJudgement?.verdict).toBe('perfect')
  })

  it('palhetada com o traste errado não acerta e quebra a corrente', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')
    s.handleInput({ kind: 'frets', mask: RED, time: 0.9 })
    s.handleInput({ kind: 'strum', time: 1.0 })

    expect(s.statusOf(0)).toBe('pending')
    expect(s.getState().streak).toBe(0)
    expect(s.getState().rockMeter).toBeLessThan(0.5)
  })

  it('palhetar sem nota nenhuma na janela é punido', () => {
    const s = new Session(chartOf([{ time: 5, frets: GREEN }]), 'expert')
    s.update(1)
    s.handleInput({ kind: 'strum', time: 1 })

    const events = s.consumeEvents()
    expect(events.some((e) => e.kind === 'overstrum')).toBe(true)
    expect(s.getState().rockMeter).toBeLessThan(0.5)
  })
})

describe('regra dos trastes', () => {
  it('segurar trastes abaixo do alvo é permitido numa nota simples', () => {
    const s = new Session(chartOf([{ time: 1, frets: YELLOW }]), 'expert')
    s.handleInput({ kind: 'frets', mask: GREEN | RED | YELLOW, time: 0.9 })
    s.handleInput({ kind: 'strum', time: 1 })
    expect(s.statusOf(0)).toBe('hit')
  })

  it('segurar um traste acima do alvo invalida', () => {
    const s = new Session(chartOf([{ time: 1, frets: RED }]), 'expert')
    s.handleInput({ kind: 'frets', mask: RED | YELLOW, time: 0.9 })
    s.handleInput({ kind: 'strum', time: 1 })
    expect(s.statusOf(0)).toBe('pending')
  })

  it('acorde exige correspondência exata', () => {
    const exato = new Session(chartOf([{ time: 1, frets: GREEN | YELLOW }]), 'expert')
    exato.handleInput({ kind: 'frets', mask: GREEN | YELLOW, time: 0.9 })
    exato.handleInput({ kind: 'strum', time: 1 })
    expect(exato.statusOf(0)).toBe('hit')

    const sobrando = new Session(chartOf([{ time: 1, frets: GREEN | YELLOW }]), 'expert')
    sobrando.handleInput({ kind: 'frets', mask: GREEN | RED | YELLOW, time: 0.9 })
    sobrando.handleInput({ kind: 'strum', time: 1 })
    expect(sobrando.statusOf(0)).toBe('pending')
  })

  it('nota aberta exige nenhum traste pressionado', () => {
    const s = new Session(chartOf([{ time: 1, frets: 0, open: true }]), 'expert')
    s.handleInput({ kind: 'frets', mask: GREEN, time: 0.9 })
    s.handleInput({ kind: 'strum', time: 1 })
    expect(s.statusOf(0)).toBe('pending')

    s.handleInput({ kind: 'frets', mask: 0, time: 1.0 })
    s.handleInput({ kind: 'strum', time: 1.01 })
    expect(s.statusOf(0)).toBe('hit')
  })

  it('acorde paga por traste', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN | YELLOW }]), 'expert')
    s.handleInput({ kind: 'frets', mask: GREEN | YELLOW, time: 0.9 })
    s.handleInput({ kind: 'strum', time: 1 })
    expect(s.getState().score).toBe(POINTS_PER_NOTE * 2)
  })
})

describe('HOPO e tap', () => {
  it('HOPO é acertado só com o traste, se a corrente está viva', () => {
    const s = new Session(
      chartOf([
        { time: 1, frets: GREEN },
        { time: 1.1, frets: RED, type: 'hopo' },
      ]),
      'expert',
    )
    s.handleInput({ kind: 'frets', mask: GREEN, time: 0.95 })
    s.handleInput({ kind: 'strum', time: 1 })
    s.handleInput({ kind: 'frets', mask: RED, time: 1.1 })

    expect(s.statusOf(1)).toBe('hit')
  })

  it('HOPO não vale com a corrente quebrada', () => {
    const s = new Session(chartOf([{ time: 1, frets: RED, type: 'hopo' }]), 'expert')
    s.handleInput({ kind: 'frets', mask: RED, time: 1 })
    expect(s.statusOf(0)).toBe('pending')
  })

  it('tap vale sempre, mesmo sem corrente', () => {
    const s = new Session(chartOf([{ time: 1, frets: RED, type: 'tap' }]), 'expert')
    s.handleInput({ kind: 'frets', mask: RED, time: 1 })
    expect(s.statusOf(0)).toBe('hit')
  })

  it('nota de palhetada não é acertada só com o traste', () => {
    const s = new Session(chartOf([{ time: 1, frets: RED, type: 'strum' }]), 'expert')
    s.handleInput({ kind: 'frets', mask: RED, time: 1 })
    expect(s.statusOf(0)).toBe('pending')
  })
})

describe('notas perdidas', () => {
  it('expira a nota que passou da janela', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')
    s.update(1 + HIT_WINDOW + 0.001)
    expect(s.statusOf(0)).toBe('missed')
    expect(s.getState().streak).toBe(0)
  })

  it('não expira antes da hora', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')
    s.update(1)
    expect(s.statusOf(0)).toBe('pending')
  })

  it('zera o medidor depois de erros suficientes e falha', () => {
    const notes = Array.from({ length: 30 }, (_, i) => ({ time: 1 + i * 0.5, frets: GREEN }))
    const s = new Session(chartOf(notes), 'expert')
    s.update(60)
    expect(s.getState().failed).toBe(true)
    expect(s.getState().rockMeter).toBe(0)
  })

  it('noFail mantém a música viva', () => {
    const notes = Array.from({ length: 30 }, (_, i) => ({ time: 1 + i * 0.5, frets: GREEN }))
    const s = new Session(chartOf(notes), 'expert', { noFail: true })
    s.update(60)
    expect(s.getState().failed).toBe(false)
  })
})

describe('multiplicador', () => {
  it('sobe a cada dez acertos e trava em quatro', () => {
    const notes = Array.from({ length: 45 }, (_, i) => ({ time: 1 + i * 0.5, frets: GREEN }))
    const s = new Session(chartOf(notes), 'expert')
    s.handleInput({ kind: 'frets', mask: GREEN, time: 0 })

    let played = 0
    const playMore = (n: number) => {
      for (let i = 0; i < n; i++) {
        const t = 1 + played * 0.5
        played++
        s.update(t)
        s.handleInput({ kind: 'strum', time: t })
      }
      return s.getState().multiplier
    }

    expect(playMore(1)).toBe(1)
    expect(playMore(9)).toBe(2)
    expect(playMore(10)).toBe(3)
    expect(playMore(10)).toBe(4)
    expect(playMore(10)).toBe(4)
  })

  it('erro devolve o multiplicador para um', () => {
    const notes = Array.from({ length: 15 }, (_, i) => ({ time: 1 + i * 0.5, frets: GREEN }))
    const s = new Session(chartOf(notes), 'expert')
    s.handleInput({ kind: 'frets', mask: GREEN, time: 0 })
    for (let i = 0; i < 12; i++) {
      const t = 1 + i * 0.5
      s.update(t)
      s.handleInput({ kind: 'strum', time: t })
    }
    expect(s.getState().multiplier).toBe(2)

    s.update(1 + 12 * 0.5 + HIT_WINDOW + 0.01)
    expect(s.getState().multiplier).toBe(1)
  })
})

describe('sustains', () => {
  it('paga enquanto o traste é mantido', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN, duration: 1 }]), 'expert')
    s.handleInput({ kind: 'frets', mask: GREEN, time: 0.9 })
    s.handleInput({ kind: 'strum', time: 1 })
    const afterHit = s.getState().score

    s.update(1.5)
    expect(s.getState().score).toBeGreaterThan(afterHit)
    expect(s.getState().activeSustains).toEqual([0])
  })

  it('soltar o traste encerra o sustain', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN, duration: 1 }]), 'expert')
    s.handleInput({ kind: 'frets', mask: GREEN, time: 0.9 })
    s.handleInput({ kind: 'strum', time: 1 })
    s.update(1.2)
    s.handleInput({ kind: 'frets', mask: 0, time: 1.3 })
    s.update(1.4)

    expect(s.getState().activeSustains).toEqual([])
  })

  it('para de pagar quando o sustain termina', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN, duration: 1 }]), 'expert')
    s.handleInput({ kind: 'frets', mask: GREEN, time: 0.9 })
    s.handleInput({ kind: 'strum', time: 1 })
    s.update(2)
    const atEnd = s.getState().score
    s.update(5)
    expect(s.getState().score).toBe(atEnd)
  })
})

describe('star power', () => {
  const phraseChart = () =>
    chartOf(
      [
        { time: 1, frets: GREEN },
        { time: 1.5, frets: GREEN },
      ],
      [{ start: 0.9, end: 2 }],
    )

  it('completar um trecho carrega o medidor', () => {
    const s = new Session(phraseChart(), 'expert')
    s.handleInput({ kind: 'frets', mask: GREEN, time: 0 })
    s.handleInput({ kind: 'strum', time: 1 })
    expect(s.getState().starPowerAmount).toBe(0)
    s.handleInput({ kind: 'strum', time: 1.5 })
    expect(s.getState().starPowerAmount).toBeCloseTo(0.25, 6)
  })

  it('perder uma nota invalida o trecho inteiro', () => {
    const s = new Session(phraseChart(), 'expert')
    s.handleInput({ kind: 'frets', mask: GREEN, time: 0 })
    s.update(1.2)
    s.handleInput({ kind: 'strum', time: 1.5 })
    expect(s.getState().starPowerAmount).toBe(0)
  })

  it('não ativa abaixo de meio medidor', () => {
    const s = new Session(phraseChart(), 'expert')
    s.handleInput({ kind: 'frets', mask: GREEN, time: 0 })
    s.handleInput({ kind: 'strum', time: 1 })
    s.handleInput({ kind: 'strum', time: 1.5 })
    s.handleInput({ kind: 'starPower', time: 1.6 })
    expect(s.getState().starPowerActive).toBe(false)
  })

  it('ativo, dobra o multiplicador e escoa com o tempo', () => {
    const chart = chartOf(
      [
        { time: 1, frets: GREEN },
        { time: 1.5, frets: GREEN },
        { time: 2, frets: GREEN },
        { time: 2.5, frets: GREEN },
      ],
      [
        { start: 0.9, end: 1.7 },
        { start: 1.9, end: 2.7 },
      ],
    )
    const s = new Session(chart, 'expert')
    s.handleInput({ kind: 'frets', mask: GREEN, time: 0 })
    for (const t of [1, 1.5, 2, 2.5]) {
      s.update(t)
      s.handleInput({ kind: 'strum', time: t })
    }
    expect(s.getState().starPowerAmount).toBeCloseTo(0.5, 6)

    s.handleInput({ kind: 'starPower', time: 2.6 })
    expect(s.getState().starPowerActive).toBe(true)
    expect(s.getState().multiplier).toBe(2)

    s.update(4)
    expect(s.getState().starPowerAmount).toBeLessThan(0.5)
  })

  it('star power ativo protege o medidor', () => {
    const chart = chartOf(
      [
        { time: 1, frets: GREEN },
        { time: 1.5, frets: GREEN },
        { time: 2, frets: GREEN },
        { time: 2.5, frets: GREEN },
        { time: 9, frets: GREEN },
      ],
      [
        { start: 0.9, end: 1.7 },
        { start: 1.9, end: 2.7 },
      ],
    )
    const s = new Session(chart, 'expert')
    s.handleInput({ kind: 'frets', mask: GREEN, time: 0 })
    for (const t of [1, 1.5, 2, 2.5]) {
      s.update(t)
      s.handleInput({ kind: 'strum', time: t })
    }
    s.handleInput({ kind: 'starPower', time: 2.6 })
    const meterBefore = s.getState().rockMeter

    s.update(3)
    s.handleInput({ kind: 'strum', time: 3 })
    expect(s.getState().rockMeter).toBe(meterBefore)
  })
})

describe('fim da música', () => {
  it('avisa quando a última nota passa', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')
    s.handleInput({ kind: 'frets', mask: GREEN, time: 0.9 })
    s.handleInput({ kind: 'strum', time: 1 })
    s.consumeEvents()

    s.update(2)
    expect(s.getState().finished).toBe(true)
    expect(s.consumeEvents().some((e) => e.kind === 'finished')).toBe(true)
  })
})
