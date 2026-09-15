/**
 * A música que já vem no jogo.
 *
 * Existe para que o jogo seja jogável na primeira execução, antes de
 * qualquer pasta de músicas ser importada, e para servir de referência ao
 * ajustar a sensação do braço. Não é um arquivo de áudio: é uma partitura em
 * código, da qual saem tanto o chart quanto o som — o sintetizador em
 * `audio/demoTrack.ts` toca exatamente estas notas. Assim o áudio e as notas
 * estão sincronizados por construção, sem chance de deriva.
 */

import type { Chart, Difficulty, Note, NoteType, Phrase, Song } from '../engine/types'

const BPM = 148
const BEAT = 60 / BPM

/** Uma nota da partitura, em batidas desde o começo. */
interface ScoreNote {
  beat: number
  /** Duração em batidas; 0 é nota seca. */
  length: number
  /** Traste de 0 a 4, ou -1 para nota aberta. */
  lane: number
  /** Altura em nota MIDI, usada pelo sintetizador. */
  pitch: number
  /** Trastes extras, para formar acordes. */
  with?: number[]
}

/** Escala menor em Mi, que é onde mora esse tipo de riff. */
const E = 40
const SCALE = [0, 2, 3, 5, 7, 8, 10, 12]

function pitchOf(step: number, octave = 0) {
  return E + SCALE[((step % 7) + 7) % 7] + 12 * (octave + Math.floor(step / 7))
}

/** Escreve um padrão repetido a partir de um compasso. */
function riff(startBeat: number, bars: number, pattern: Array<[number, number, number]>): ScoreNote[] {
  const out: ScoreNote[] = []
  for (let bar = 0; bar < bars; bar++) {
    for (const [offset, lane, step] of pattern) {
      out.push({
        beat: startBeat + bar * 4 + offset,
        length: 0,
        lane,
        pitch: pitchOf(step),
      })
    }
  }
  return out
}

function buildScore(): ScoreNote[] {
  const notes: ScoreNote[] = []

  // Introdução: colcheias no traste grave, para o jogador achar o pulso.
  notes.push(...riff(4, 4, [
    [0, 0, 0],
    [0.5, 0, 0],
    [1, 1, 2],
    [1.5, 0, 0],
    [2, 2, 3],
    [2.5, 0, 0],
    [3, 1, 2],
    [3.5, 2, 3],
  ]))

  // Verso: mesma ideia subindo a escala, com um acorde no fim do compasso.
  notes.push(...riff(20, 4, [
    [0, 0, 0],
    [0.75, 1, 1],
    [1.5, 2, 3],
    [2, 3, 4],
    [2.5, 2, 3],
    [3, 1, 1],
  ]))
  for (let bar = 0; bar < 4; bar++) {
    notes.push({ beat: 23.5 + bar * 4, length: 0.5, lane: 3, pitch: pitchOf(4), with: [4] })
  }

  // Refrão: acordes longos com um contracanto entre eles.
  const chorusChords: Array<[number, number, number[]]> = [
    [36, 0, [0, 1]],
    [38, 2, [2, 3]],
    [40, 1, [1, 2]],
    [42, 3, [3, 4]],
  ]
  for (let repeat = 0; repeat < 2; repeat++) {
    for (const [beat, step, lanes] of chorusChords) {
      notes.push({
        beat: beat + repeat * 8,
        length: 1.25,
        lane: lanes[0],
        pitch: pitchOf(step),
        with: lanes.slice(1),
      })
    }
    for (let i = 0; i < 4; i++) {
      notes.push({
        beat: 37 + i * 2 + repeat * 8,
        length: 0,
        lane: 4,
        pitch: pitchOf(6, 1),
      })
    }
  }

  // Solo: semicolcheias correndo pelos cinco trastes, ida e volta.
  const ladder = [0, 1, 2, 3, 4, 3, 2, 1]
  for (let i = 0; i < 64; i++) {
    notes.push({
      beat: 52 + i * 0.25,
      length: 0,
      lane: ladder[i % ladder.length],
      pitch: pitchOf(i % 8, i > 32 ? 1 : 0),
    })
  }

  // Nota aberta encerrando cada frase do solo.
  for (const beat of [59.75, 67.75]) {
    notes.push({ beat, length: 1.5, lane: -1, pitch: E - 12 })
  }

  // Coda: acordes largos com sustain, para terminar segurando.
  notes.push({ beat: 70, length: 2, lane: 0, pitch: pitchOf(0), with: [1, 2] })
  notes.push({ beat: 74, length: 4, lane: 2, pitch: pitchOf(4), with: [3, 4] })

  return notes.sort((a, b) => a.beat - b.beat)
}

export const DEMO_SCORE = buildScore()
export const DEMO_BPM = BPM
export const DEMO_BEAT = BEAT

/**
 * As dificuldades mais baixas não são o expert com notas apagadas ao acaso:
 * cada nível define quantos trastes usa e qual a menor subdivisão que aceita,
 * e uma nota só entra se cair na grade daquele nível. É o que mantém o easy
 * tocável com três dedos e ainda reconhecível como a mesma música.
 */
const DIFFICULTY_RULES: Record<Difficulty, { lanes: number; grid: number; chords: boolean }> = {
  easy: { lanes: 3, grid: 1, chords: false },
  medium: { lanes: 4, grid: 0.5, chords: false },
  hard: { lanes: 5, grid: 0.25, chords: true },
  expert: { lanes: 5, grid: 0.25, chords: true },
}

function chartFor(difficulty: Difficulty, score: ScoreNote[], beats: number[]): Chart {
  const rules = DIFFICULTY_RULES[difficulty]
  const notes: Note[] = []
  let previous: { beat: number; frets: number } | null = null

  for (const entry of score) {
    // Encaixa na grade do nível: o que não cai numa subdivisão permitida sai.
    const onGrid = Math.abs(entry.beat / rules.grid - Math.round(entry.beat / rules.grid)) < 1e-6
    if (!onGrid) continue

    let frets = 0
    let isOpen = false

    if (entry.lane < 0) {
      isOpen = true
    } else {
      const lane = Math.min(entry.lane, rules.lanes - 1)
      frets = 1 << lane
      if (rules.chords && entry.with) {
        for (const extra of entry.with) {
          if (extra < rules.lanes) frets |= 1 << extra
        }
      }
    }

    // No expert, notas rápidas em trastes diferentes viram HOPO, como o
    // parser derivaria se a música viesse de um arquivo.
    let type: NoteType = 'strum'
    if (
      difficulty === 'expert' &&
      previous &&
      entry.beat - previous.beat <= 0.26 &&
      frets !== previous.frets &&
      !isOpen &&
      countBits(frets) === 1
    ) {
      type = 'hopo'
    }

    notes.push({
      index: notes.length,
      time: entry.beat * BEAT,
      duration: entry.length * BEAT,
      frets,
      type,
      isOpen,
    })

    previous = { beat: entry.beat, frets }
  }

  return { difficulty, notes, starPower: DEMO_PHRASES, beats }
}

function countBits(mask: number) {
  let n = 0
  while (mask) {
    n += mask & 1
    mask >>= 1
  }
  return n
}

/** Trechos de star power, em batidas convertidas para segundos. */
const DEMO_PHRASES: Phrase[] = [
  [20, 28],
  [36, 44],
  [52, 60],
  [68, 76],
].map(([start, end]) => ({ start: start * BEAT, end: end * BEAT }))

export function buildDemoSong(): Song {
  const score = DEMO_SCORE
  const lastBeat = Math.max(...score.map((n) => n.beat + n.length)) + 4
  const beats = Array.from({ length: Math.ceil(lastBeat) + 1 }, (_, i) => i * BEAT)

  return {
    meta: {
      id: 'fretline-demo',
      name: 'Corrente Alternada',
      artist: 'Fretline',
      charter: 'gerado em código',
      album: 'Faixa de demonstração',
      year: '2026',
      offset: 0,
      previewStart: 36 * BEAT,
      length: lastBeat * BEAT,
    },
    charts: {
      easy: chartFor('easy', score, beats),
      medium: chartFor('medium', score, beats),
      hard: chartFor('hard', score, beats),
      expert: chartFor('expert', score, beats),
    },
    audioFiles: [],
  }
}
