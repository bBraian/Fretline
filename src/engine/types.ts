/** Tipos compartilhados do engine. Tempo sempre em segundos. */

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert']

/**
 * Tipo de nota, no sentido do formato de chart.
 *
 * O parser continua derivando isso porque faz parte do arquivo e outras
 * ferramentas contam com ele, mas o jogo não usa: aqui não há palhetada, e
 * toda nota é tocada apertando o traste. Os três tipos jogam igual.
 */
export type NoteType =
  | 'strum' // no formato original, exigiria palhetada
  | 'hopo' // hammer-on / pull-off
  | 'tap'

/**
 * Uma nota do chart. `frets` é um bitmask: bit 0 = verde ... bit 4 = laranja.
 * Um acorde tem mais de um bit ligado. `isOpen` significa nota aberta
 * (nenhum traste pressionado) e nesse caso `frets` é 0.
 */
export interface Note {
  /** Índice da nota no chart, estável, usado como identidade. */
  index: number
  time: number
  /** Duração do sustain em segundos; 0 para nota seca. */
  duration: number
  frets: number
  type: NoteType
  isOpen: boolean
}

/** Trecho de star power: acertar todas as notas dentro dele carrega meia barra. */
export interface Phrase {
  start: number
  end: number
}

export interface Chart {
  difficulty: Difficulty
  notes: Note[]
  starPower: Phrase[]
  /** Tempos de cada batida, para o palco pulsar junto e para o parser de HOPO. */
  beats: number[]
}

export interface SongMeta {
  id: string
  name: string
  artist: string
  charter: string
  album: string
  year: string
  /** Segundos de silêncio antes do áudio começar, declarado no chart. */
  offset: number
  /** Onde o preview do menu começa. */
  previewStart: number
  /** Duração total em segundos, se conhecida. */
  length: number
}

export interface Song {
  meta: SongMeta
  charts: Partial<Record<Difficulty, Chart>>
  /** Caminhos das faixas de áudio, relativos à pasta da música. */
  audioFiles: string[]
}

export type Verdict = 'perfect' | 'good' | 'miss'

export interface Judgement {
  noteIndex: number
  /** Diferença entre o input e o tempo da nota; negativo = adiantado. */
  delta: number
  verdict: Verdict
  time: number
}

export const FRET_COUNT = 5

export const FRET_NAMES = ['green', 'red', 'yellow', 'blue', 'orange'] as const

export type FretName = (typeof FRET_NAMES)[number]

/** Cores dos trastes, usadas pelo render e pela UI. */
export const FRET_COLORS = [0x22c55e, 0xef4444, 0xfacc15, 0x3b82f6, 0xf97316]

export function fretsToArray(mask: number): number[] {
  const out: number[] = []
  for (let i = 0; i < FRET_COUNT; i++) if (mask & (1 << i)) out.push(i)
  return out
}

export function highestFret(mask: number): number {
  for (let i = FRET_COUNT - 1; i >= 0; i--) if (mask & (1 << i)) return i
  return -1
}

export function countFrets(mask: number): number {
  let n = 0
  for (let i = 0; i < FRET_COUNT; i++) if (mask & (1 << i)) n++
  return n
}
