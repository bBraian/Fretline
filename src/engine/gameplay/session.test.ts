import { describe, expect, it } from 'vitest'
import { Session } from './session'
import {
  CHORD_GRACE,
  GHOST_TAP_COST,
  HIT_WINDOW,
  METER_BY_DIFFICULTY,
  METER_START,
  POINTS_PER_NOTE,
} from './rules'
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

/** Aperta trastes num instante; a máscara é o estado completo da mão. */
function press(session: Session, mask: number, time: number) {
  session.handleInput({ kind: 'frets', mask, time })
}

describe('acerto pelo traste', () => {
  it('apertar o traste certo dentro da janela acerta a nota', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')
    s.update(0.9)
    press(s, GREEN, 1.0)

    expect(s.statusOf(0)).toBe('hit')
    expect(s.getState().score).toBe(POINTS_PER_NOTE)
    expect(s.getState().streak).toBe(1)
  })

  it('aceita dentro da janela e recusa fora dela', () => {
    const dentro = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')
    press(dentro, GREEN, 1 - HIT_WINDOW * 0.9)
    expect(dentro.statusOf(0)).toBe('hit')

    const fora = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')
    press(fora, GREEN, 1 - HIT_WINDOW * 1.5)
    expect(fora.statusOf(0)).toBe('pending')
  })

  it('classifica como perfeito só bem no centro da janela', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')
    press(s, GREEN, 1.005)
    expect(s.getState().lastJudgement?.verdict).toBe('perfect')
  })

  it('soltar o traste não acerta nota comum', () => {
    const s = new Session(
      chartOf([
        { time: 1, frets: GREEN },
        { time: 1.2, frets: GREEN },
      ]),
      'expert',
    )
    press(s, GREEN, 1.0)
    expect(s.statusOf(0)).toBe('hit')

    // Soltar não pode valer como a segunda nota.
    press(s, 0, 1.2)
    expect(s.statusOf(1)).toBe('pending')
  })

  it('duas notas no mesmo traste exigem soltar e apertar de novo', () => {
    const s = new Session(
      chartOf([
        { time: 1, frets: GREEN },
        { time: 1.2, frets: GREEN },
      ]),
      'expert',
    )
    press(s, GREEN, 1.0)
    press(s, 0, 1.1)
    press(s, GREEN, 1.2)

    expect(s.statusOf(0)).toBe('hit')
    expect(s.statusOf(1)).toBe('hit')
    expect(s.getState().streak).toBe(2)
  })
})

/**
 * Sem palhetada, nem toda nota é alcançável por um aperto.
 *
 * Quando a digitação da nota seguinte já está contida na que está na mão —
 * um acorde verde+vermelho resolvendo para um vermelho sozinho — o gesto
 * natural é *soltar* o verde. Nenhum traste novo desce, e o jogo precisa
 * resolver a nota mesmo assim: exigir soltar tudo e reapertar transforma a
 * música numa sequência de reinícios de mão.
 */
describe('soltura que resolve nota', () => {
  it('soltar o traste que sobra toca a nota contida no acorde anterior', () => {
    const s = new Session(
      chartOf([
        { time: 1, frets: GREEN | RED },
        { time: 1.2, frets: RED },
      ]),
      'expert',
    )

    press(s, GREEN | RED, 1.0)
    expect(s.statusOf(0)).toBe('hit')

    // O vermelho continua na mão; só o verde sai.
    press(s, RED, 1.2)
    expect(s.statusOf(1)).toBe('hit')
    expect(s.getState().streak).toBe(2)
  })
})

/**
 * A barra de strum de um controle de guitarra.
 *
 * O jogo não exige palhetada e continua não exigindo — mas quem tem o
 * controle vai palhetar, porque é o gesto que o instrumento pede. Antes a
 * barra estava ligada ao star power, então tocar a música normalmente
 * disparava o star power a cada nota. Ela é um segundo gatilho para a nota
 * que já está debaixo dos dedos, e nada além disso.
 */
describe('barra de strum', () => {
  it('palhetar com o traste certo na mão resolve a nota', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')

    // O traste desce cedo demais para valer como acerto.
    press(s, GREEN, 0.5)
    s.update(0.5 + CHORD_GRACE + 0.01)
    s.consumeEvents()
    expect(s.statusOf(0)).toBe('pending')

    s.handleInput({ kind: 'strum', time: 1.0 })
    expect(s.statusOf(0)).toBe('hit')
  })

  it('palhetar no vazio não castiga', () => {
    const s = new Session(chartOf([{ time: 5, frets: GREEN }]), 'expert')
    s.handleInput({ kind: 'strum', time: 1.0 })
    s.update(1 + CHORD_GRACE + 0.01)

    expect(s.getState().rockMeter).toBe(METER_START)
    expect(s.getState().streak).toBe(0)
    expect(s.consumeEvents().some((e) => e.kind === 'ghostTap')).toBe(false)
  })
})

describe('toque no vazio', () => {
  it('apertar sem nota nenhuma por perto é castigado', () => {
    const s = new Session(chartOf([{ time: 5, frets: GREEN }]), 'expert')
    s.update(1)
    press(s, GREEN, 1)
    s.update(1 + CHORD_GRACE + 0.001)

    expect(s.consumeEvents().some((e) => e.kind === 'ghostTap')).toBe(true)
    expect(s.getState().rockMeter).toBeLessThan(0.5)
    expect(s.getState().streak).toBe(0)
  })

  it('apertar o traste errado em cima da nota é castigado', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')
    press(s, RED, 1.0)
    s.update(1 + CHORD_GRACE + 0.001)

    expect(s.statusOf(0)).toBe('pending')
    expect(s.getState().rockMeter).toBeLessThan(0.5)
  })

  it('não castiga antes da folga do acorde passar', () => {
    const s = new Session(chartOf([{ time: 5, frets: GREEN }]), 'expert')
    press(s, GREEN, 1)
    s.update(1 + CHORD_GRACE * 0.5)
    expect(s.getState().rockMeter).toBe(0.5)
  })

  it('soltar trastes nunca é castigado', () => {
    const s = new Session(chartOf([{ time: 5, frets: GREEN }]), 'expert')
    press(s, GREEN, 0.5)
    s.consumeEvents()
    s.update(0.5 + CHORD_GRACE + 0.01)
    const meterAfterTap = s.getState().rockMeter

    press(s, 0, 1)
    s.update(1 + CHORD_GRACE + 0.01)
    expect(s.getState().rockMeter).toBe(meterAfterTap)
  })
})

describe('acordes', () => {
  it('dedos chegando em tempos diferentes formam o acorde sem castigo', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN | YELLOW }]), 'expert')
    // Primeiro dedo: ainda não satisfaz o acorde.
    press(s, GREEN, 0.99)
    expect(s.statusOf(0)).toBe('pending')

    // Segundo dedo, dentro da folga: fecha o acorde.
    press(s, GREEN | YELLOW, 0.99 + CHORD_GRACE * 0.6)
    s.update(1.2)

    expect(s.statusOf(0)).toBe('hit')
    expect(s.getState().rockMeter).toBeGreaterThan(0.5)
    expect(s.consumeEvents().some((e) => e.kind === 'ghostTap')).toBe(false)
  })

  /**
   * Um acorde lento não é martelada.
   *
   * Ninguém fecha três trastes no mesmo instante, e o espalhamento dos dedos
   * de um jogador comum passa dos 30ms com facilidade. Enquanto os dedos que
   * desceram forem *parte* do acorde que está chegando, a mão está montando
   * a nota — castigar aí cobra por tocar certo, só que devagar.
   */
  it('acorde montado devagar, além da folga, não é castigado', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN | YELLOW }]), 'expert')

    press(s, GREEN, 0.98)
    s.update(0.98 + CHORD_GRACE + 0.02)
    expect(s.consumeEvents().some((e) => e.kind === 'ghostTap')).toBe(false)

    press(s, GREEN | YELLOW, 1.02)
    s.update(1.2)

    expect(s.statusOf(0)).toBe('hit')
    expect(s.getState().streak).toBe(1)
    expect(s.consumeEvents().some((e) => e.kind === 'ghostTap')).toBe(false)
  })

  /**
   * E quando o acorde nunca fecha, a conta é uma só.
   *
   * Antes o jogador levava as duas: o castigo por toque no vazio quando a
   * folga vencia, e a nota perdida logo depois. Duas punições pela mesma
   * falha, e o medidor descia o dobro do devido.
   */
  it('um dedo que nunca fecha o acorde custa a nota, e só ela', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN | YELLOW }]), 'expert')
    press(s, GREEN, 0.99)
    s.update(1 + HIT_WINDOW + 0.05)

    const events = s.consumeEvents()
    expect(events.filter((e) => e.kind === 'miss')).toHaveLength(1)
    expect(events.some((e) => e.kind === 'ghostTap')).toBe(false)
  })

  it('acorde exige correspondência exata', () => {
    const sobrando = new Session(chartOf([{ time: 1, frets: GREEN | YELLOW }]), 'expert')
    press(sobrando, GREEN | RED | YELLOW, 1)
    expect(sobrando.statusOf(0)).toBe('pending')
  })

  it('acorde paga por traste', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN | YELLOW }]), 'expert')
    press(s, GREEN | YELLOW, 1)
    expect(s.getState().score).toBe(POINTS_PER_NOTE * 2)
  })
})

describe('regra dos trastes', () => {
  it('segurar trastes abaixo do alvo é permitido numa nota simples', () => {
    const s = new Session(chartOf([{ time: 1, frets: YELLOW }]), 'expert')
    press(s, GREEN | RED, 0.5)
    s.update(0.5 + CHORD_GRACE + 0.01)
    s.consumeEvents()

    // A mão sobe até o amarelo sem soltar os de baixo.
    press(s, GREEN | RED | YELLOW, 1)
    expect(s.statusOf(0)).toBe('hit')
  })

  it('segurar um traste acima do alvo invalida', () => {
    const s = new Session(chartOf([{ time: 1, frets: RED }]), 'expert')
    press(s, RED | YELLOW, 1)
    expect(s.statusOf(0)).toBe('pending')
  })
})

describe('nota aberta', () => {
  it('é tocada soltando todos os trastes', () => {
    const s = new Session(chartOf([{ time: 1, frets: 0, open: true }]), 'expert')
    press(s, GREEN, 0.5)
    s.update(0.5 + CHORD_GRACE + 0.01)
    s.consumeEvents()

    press(s, 0, 1.0)
    expect(s.statusOf(0)).toBe('hit')
  })

  it('soltar parcialmente não basta', () => {
    const s = new Session(chartOf([{ time: 1, frets: 0, open: true }]), 'expert')
    press(s, GREEN | RED, 0.5)
    s.update(0.5 + CHORD_GRACE + 0.01)

    press(s, GREEN, 1.0)
    expect(s.statusOf(0)).toBe('pending')
  })

  it('apertar um traste com nota aberta à frente não é castigado', () => {
    const s = new Session(chartOf([{ time: 1, frets: 0, open: true }]), 'expert')
    const meterBefore = s.getState().rockMeter

    press(s, GREEN, 0.98)
    s.update(0.98 + CHORD_GRACE + 0.01)
    expect(s.getState().rockMeter).toBe(meterBefore)
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

describe('medidor: escalada dos erros', () => {
  function missing(count: number, difficulty: 'easy' | 'expert' = 'expert') {
    const notes = Array.from({ length: count }, (_, i) => ({ time: 1 + i * 0.5, frets: GREEN }))
    const s = new Session(chartOf(notes), difficulty)
    s.update(1 + count * 0.5 + HIT_WINDOW + 0.01)
    return METER_START - s.getState().rockMeter
  }

  it('o primeiro erro custa a perda base', () => {
    expect(missing(1)).toBeCloseTo(METER_BY_DIFFICULTY.expert.loss, 6)
  })

  it('erros seguidos custam progressivamente mais', () => {
    const um = missing(1)
    const dois = missing(2)
    const tres = missing(3)

    // O segundo erro custa mais que o primeiro, e o terceiro mais que o
    // segundo: é a escalada que separa um tropeço de um naufrágio.
    expect(dois - um).toBeGreaterThan(um)
    expect(tres - dois).toBeGreaterThan(dois - um)
  })

  it('acertar zera a escalada', () => {
    const notes = [
      { time: 1, frets: GREEN },
      { time: 1.5, frets: GREEN },
      { time: 2, frets: GREEN },
      { time: 2.5, frets: GREEN },
    ]
    const s = new Session(chartOf(notes), 'expert')

    // Erra duas, acerta uma, erra a quarta.
    s.update(1 + HIT_WINDOW + 0.01)
    s.update(1.5 + HIT_WINDOW + 0.01)
    const afterTwo = s.getState().rockMeter

    press(s, GREEN, 2)
    press(s, 0, 2.05)
    s.update(2.5 + HIT_WINDOW + 0.01)

    const lastMiss = afterTwo + METER_BY_DIFFICULTY.expert.gain - s.getState().rockMeter
    expect(lastMiss).toBeCloseTo(METER_BY_DIFFICULTY.expert.loss, 6)
  })

  it('o fácil perdoa mais que o expert na mesma sequência', () => {
    expect(missing(4, 'easy')).toBeLessThan(missing(4, 'expert'))
  })

  it('a escalada tem teto', () => {
    // Sem teto, uma passagem longa zeraria o medidor de qualquer nível quase
    // instantaneamente, e a diferença entre as dificuldades sumiria.
    const s = new Session(
      chartOf(Array.from({ length: 40 }, (_, i) => ({ time: 1 + i * 0.5, frets: GREEN }))),
      'easy',
    )
    s.update(4)
    const afterSix = s.getState().rockMeter
    s.update(5)
    const afterEight = s.getState().rockMeter

    // Depois do teto, cada erro tira sempre o mesmo tanto.
    s.update(6)
    const afterTen = s.getState().rockMeter
    if (afterTen > 0) {
      expect(afterEight - afterTen).toBeCloseTo(afterSix - afterEight, 1)
    }
  })
})

describe('medidor: toque no vazio custa menos', () => {
  it('um toque no vazio tira menos que uma nota perdida', () => {
    const vazio = new Session(chartOf([{ time: 9, frets: GREEN }]), 'expert')
    press(vazio, GREEN, 1)
    vazio.update(1 + CHORD_GRACE + 0.01)
    const custoDoVazio = METER_START - vazio.getState().rockMeter

    const perdida = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')
    perdida.update(1 + HIT_WINDOW + 0.01)
    const custoDaPerdida = METER_START - perdida.getState().rockMeter

    expect(custoDoVazio).toBeLessThan(custoDaPerdida)
    expect(custoDoVazio).toBeCloseTo(custoDaPerdida * GHOST_TAP_COST, 6)
  })
})

describe('multiplicador', () => {
  /** Toca uma sequência de notas verdes, soltando entre uma e outra. */
  function play(session: Session, times: number[]) {
    for (const t of times) {
      session.update(t - 0.01)
      press(session, GREEN, t)
      press(session, 0, t + 0.01)
    }
  }

  it('sobe a cada dez acertos e trava em quatro', () => {
    const times = Array.from({ length: 45 }, (_, i) => 1 + i * 0.5)
    const s = new Session(chartOf(times.map((time) => ({ time, frets: GREEN }))), 'expert')

    play(s, times.slice(0, 1))
    expect(s.getState().multiplier).toBe(1)
    play(s, times.slice(1, 10))
    expect(s.getState().multiplier).toBe(2)
    play(s, times.slice(10, 20))
    expect(s.getState().multiplier).toBe(3)
    play(s, times.slice(20, 30))
    expect(s.getState().multiplier).toBe(4)
    play(s, times.slice(30, 40))
    expect(s.getState().multiplier).toBe(4)
  })

  it('erro devolve o multiplicador para um', () => {
    const times = Array.from({ length: 15 }, (_, i) => 1 + i * 0.5)
    const s = new Session(chartOf(times.map((time) => ({ time, frets: GREEN }))), 'expert')

    play(s, times.slice(0, 12))
    expect(s.getState().multiplier).toBe(2)

    s.update(times[12] + HIT_WINDOW + 0.01)
    expect(s.getState().multiplier).toBe(1)
  })
})

describe('sustains', () => {
  it('paga enquanto o traste é mantido', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN, duration: 1 }]), 'expert')
    press(s, GREEN, 1)
    const afterHit = s.getState().score

    s.update(1.5)
    expect(s.getState().score).toBeGreaterThan(afterHit)
    expect(s.getState().activeSustains).toEqual([0])
  })

  it('soltar o traste encerra o sustain', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN, duration: 1 }]), 'expert')
    press(s, GREEN, 1)
    s.update(1.2)
    press(s, 0, 1.3)
    s.update(1.4)

    expect(s.getState().activeSustains).toEqual([])
  })

  it('para de pagar quando o sustain termina', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN, duration: 1 }]), 'expert')
    press(s, GREEN, 1)
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

  /** Acerta uma nota verde, soltando o traste em seguida. */
  function tap(session: Session, time: number) {
    session.update(time - 0.01)
    press(session, GREEN, time)
    press(session, 0, time + 0.01)
  }

  it('completar um trecho carrega o medidor', () => {
    const s = new Session(phraseChart(), 'expert')
    tap(s, 1)
    expect(s.getState().starPowerAmount).toBe(0)
    tap(s, 1.5)
    expect(s.getState().starPowerAmount).toBeCloseTo(0.25, 6)
  })

  it('perder uma nota invalida o trecho inteiro', () => {
    const s = new Session(phraseChart(), 'expert')
    s.update(1.2)
    tap(s, 1.5)
    expect(s.getState().starPowerAmount).toBe(0)
  })

  it('não ativa abaixo de meio medidor', () => {
    const s = new Session(phraseChart(), 'expert')
    tap(s, 1)
    tap(s, 1.5)
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
    for (const t of [1, 1.5, 2, 2.5]) tap(s, t)
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
    for (const t of [1, 1.5, 2, 2.5]) tap(s, t)
    s.handleInput({ kind: 'starPower', time: 2.6 })
    const meterBefore = s.getState().rockMeter

    // Toque no vazio durante o star power: não pode tirar medidor.
    press(s, RED, 3)
    s.update(3 + CHORD_GRACE + 0.01)
    expect(s.getState().rockMeter).toBe(meterBefore)
  })
})

describe('fim da música', () => {
  it('avisa quando a última nota passa', () => {
    const s = new Session(chartOf([{ time: 1, frets: GREEN }]), 'expert')
    press(s, GREEN, 1)
    s.consumeEvents()

    s.update(2)
    expect(s.getState().finished).toBe(true)
    expect(s.consumeEvents().some((e) => e.kind === 'finished')).toBe(true)
  })
})
