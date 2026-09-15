import { describe, expect, it } from 'vitest'
import { parseMidi } from './parseMidi'
import { parseMidiFile } from './midiFile'

/**
 * Construtor de arquivos MIDI para os testes.
 *
 * Escrever os bytes à mão é o único jeito honesto de testar um leitor
 * binário: usar uma biblioteca para gerar o arquivo testaria o acordo entre
 * duas bibliotecas, não a leitura do formato.
 */
class MidiBuilder {
  private tracks: number[][] = []

  constructor(private division = 480) {}

  track(build: (t: TrackBuilder) => void) {
    const builder = new TrackBuilder()
    build(builder)
    this.tracks.push(builder.finish())
    return this
  }

  build(): ArrayBuffer {
    const bytes: number[] = []
    push(bytes, ascii('MThd'))
    push(bytes, u32(6))
    push(bytes, u16(1))
    push(bytes, u16(this.tracks.length))
    push(bytes, u16(this.division))
    for (const track of this.tracks) push(bytes, track)
    return new Uint8Array(bytes).buffer
  }
}

class TrackBuilder {
  /**
   * Os eventos são guardados com o tick absoluto e só viram deltas no fim.
   *
   * O formato MIDI exige ordem cronológica dentro da trilha, e escrever os
   * deltas na hora obriga quem monta o teste a chamar os métodos em ordem —
   * um erro fácil de cometer e difícil de ver, porque um delta negativo
   * codifica sem reclamar e desloca tudo que vem depois.
   */
  private events: Array<{ tick: number; order: number; bytes: number[] }> = []
  private sequence = 0

  private at(tick: number, bytes: number[]) {
    this.events.push({ tick, order: this.sequence++, bytes })
  }

  name(text: string) {
    this.at(0, [0xff, 0x03, text.length, ...ascii(text)])
    return this
  }

  tempo(tick: number, bpm: number) {
    const microseconds = Math.round(60_000_000 / bpm)
    this.at(tick, [
      0xff,
      0x51,
      0x03,
      (microseconds >> 16) & 0xff,
      (microseconds >> 8) & 0xff,
      microseconds & 0xff,
    ])
    return this
  }

  timeSignature(tick: number, numerator: number, denominatorExponent: number) {
    this.at(tick, [0xff, 0x58, 0x04, numerator, denominatorExponent, 24, 8])
    return this
  }

  note(note: number, startTick: number, lengthTicks: number) {
    this.at(startTick, [0x90, note, 100])
    this.at(startTick + lengthTicks, [0x80, note, 0])
    return this
  }

  /** Marca um trecho de nota aberta no formato do Phase Shift. */
  openSpan(startTick: number, endTick: number, difficulty: number) {
    for (const [tick, enabled] of [
      [startTick, 1],
      [endTick, 0],
    ] as const) {
      const data = [0x50, 0x53, 0x00, 0x00, difficulty, 0x01, enabled, 0xf7]
      this.at(tick, [0xf0, ...varint(data.length), ...data])
    }
    return this
  }

  finish() {
    const sorted = [...this.events].sort((a, b) => a.tick - b.tick || a.order - b.order)

    const body: number[] = []
    let lastTick = 0
    for (const event of sorted) {
      push(body, varint(event.tick - lastTick))
      push(body, event.bytes)
      lastTick = event.tick
    }
    push(body, [0x00, 0xff, 0x2f, 0x00])

    return [...ascii('MTrk'), ...u32(body.length), ...body]
  }
}

function ascii(text: string) {
  return [...text].map((c) => c.charCodeAt(0))
}
function u16(value: number) {
  return [(value >> 8) & 0xff, value & 0xff]
}
function u32(value: number) {
  return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}
function varint(value: number) {
  const out = [value & 0x7f]
  let rest = value >> 7
  while (rest > 0) {
    out.unshift((rest & 0x7f) | 0x80)
    rest >>= 7
  }
  return out
}
function push(target: number[], values: number[]) {
  for (const value of values) target.push(value)
}

const EXPERT = 96
const DIVISION = 480

describe('leitor de MIDI', () => {
  it('lê cabeçalho, nomes de trilha e eventos', () => {
    const buffer = new MidiBuilder(DIVISION)
      .track((t) => t.name('tempo').tempo(0, 120))
      .track((t) => t.name('PART GUITAR').note(EXPERT, 0, 120))
      .build()

    const file = parseMidiFile(buffer)
    expect(file.division).toBe(DIVISION)
    expect(file.tracks.map((t) => t.name)).toEqual(['tempo', 'PART GUITAR'])
  })

  it('recusa divisão SMPTE em vez de calcular tempos errados', () => {
    const buffer = new MidiBuilder(0x8000 | 0x6300).track((t) => t.name('x')).build()
    expect(() => parseMidiFile(buffer)).toThrow(/SMPTE/)
  })
})

describe('parseMidi', () => {
  function song(build: (t: TrackBuilder) => void, bpm = 120) {
    const buffer = new MidiBuilder(DIVISION)
      .track((t) => t.name('tempo').timeSignature(0, 4, 2).tempo(0, bpm))
      .track((t) => {
        t.name('PART GUITAR')
        build(t)
      })
      .build()
    return parseMidi(buffer, { id: 'teste' })
  }

  it('converte tick em segundos pelo andamento', () => {
    // A 120 BPM uma semínima dura meio segundo.
    const chart = song((t) => t.note(EXPERT, 0, 100).note(EXPERT + 1, DIVISION, 100)).charts.expert!
    expect(chart.notes[0].time).toBeCloseTo(0, 5)
    expect(chart.notes[1].time).toBeCloseTo(0.5, 5)
  })

  it('agrupa notas do mesmo tick num acorde', () => {
    const chart = song((t) => t.note(EXPERT, 0, 100).note(EXPERT + 2, 0, 100)).charts.expert!
    expect(chart.notes).toHaveLength(1)
    expect(chart.notes[0].frets).toBe(0b00101)
  })

  it('mede sustains e descarta os curtos demais', () => {
    const chart = song((t) =>
      t.note(EXPERT, 0, DIVISION).note(EXPERT + 1, DIVISION * 2, 10),
    ).charts.expert!
    expect(chart.notes[0].duration).toBeCloseTo(0.5, 5)
    // Abaixo de um quarto de semínima não é sustain, é ruído de gravação.
    expect(chart.notes[1].duration).toBe(0)
  })

  it('separa as dificuldades pelas oitavas', () => {
    const parsed = song((t) => t.note(EXPERT, 0, 100).note(60, 0, 100).note(84, 0, 100))
    expect(Object.keys(parsed.charts).sort()).toEqual(['easy', 'expert', 'hard'])
    expect(parsed.charts.medium).toBeUndefined()
  })

  it('lê trechos de star power', () => {
    const chart = song((t) =>
      t.note(EXPERT, 0, 100).note(116, 0, DIVISION * 4),
    ).charts.expert!
    expect(chart.starPower).toHaveLength(1)
    expect(chart.starPower[0].end).toBeCloseTo(2, 5)
  })

  it('lê notas abertas marcadas por SysEx', () => {
    const chart = song((t) =>
      t.openSpan(0, 100, 3).note(EXPERT, 0, 50),
    ).charts.expert!
    expect(chart.notes[0].isOpen).toBe(true)
    expect(chart.notes[0].frets).toBe(0)
  })

  it('a marcação de dificuldade 0xFF vale para todas', () => {
    const parsed = song((t) => t.openSpan(0, 100, 0xff).note(EXPERT, 0, 50).note(60, 0, 50))
    expect(parsed.charts.expert!.notes[0].isOpen).toBe(true)
    expect(parsed.charts.easy!.notes[0].isOpen).toBe(true)
  })

  it('a flag de HOPO forçado troca o tipo derivado', () => {
    // Longe da anterior, seria strum; a marcação 101 força HOPO.
    const chart = song((t) =>
      t.note(EXPERT, 0, 50).note(EXPERT + 1, DIVISION * 2, 50).note(101, DIVISION * 2, 50),
    ).charts.expert!
    expect(chart.notes[1].type).toBe('hopo')
  })

  it('a nota 104 marca tap', () => {
    const chart = song((t) => t.note(EXPERT, 0, 50).note(104, 0, 50)).charts.expert!
    expect(chart.notes[0].type).toBe('tap')
  })

  it('encontra a trilha de guitarra mesmo sem nome conhecido', () => {
    const buffer = new MidiBuilder(DIVISION)
      .track((t) => t.name('tempo').tempo(0, 120))
      .track((t) => t.name('ALGUMA COISA').note(EXPERT, 0, 100).note(EXPERT + 1, 240, 100))
      .build()
    expect(parseMidi(buffer).charts.expert!.notes).toHaveLength(2)
  })

  it('produz a grade de batidas para o palco pulsar', () => {
    const chart = song((t) => t.note(EXPERT, 0, 100).note(EXPERT, DIVISION * 8, 100)).charts.expert!
    expect(chart.beats.length).toBeGreaterThan(4)
    expect(chart.beats[1]).toBeCloseTo(0.5, 5)
  })
})
