/**
 * As regras que definem a sensação do jogo: o que conta como acerto, quanto
 * vale, e com que rapidez o medidor sobe e desce.
 *
 * Tudo aqui é constante ou função pura, para que a sessão fique só com a
 * orquestração e estes números possam ser ajustados sem mexer na máquina de
 * estados.
 */

import type { Difficulty, Note } from '../types'
import { countFrets, highestFret } from '../types'

/** Meia janela de acerto, em segundos. Uma nota aceita input em ±este valor. */
export const HIT_WINDOW = 0.07

/** Dentro desta distância o acerto conta como perfeito, o que o HUD mostra. */
export const PERFECT_WINDOW = 0.025

/** Pontos por nota. Um acorde paga por traste, como no original. */
export const POINTS_PER_NOTE = 50

/** Pontos por batida de sustain mantido. */
export const POINTS_PER_SUSTAIN_BEAT = 25

/** Acertos consecutivos necessários para cada degrau do multiplicador. */
export const NOTES_PER_MULTIPLIER_STEP = 10

/** Multiplicador máximo antes do star power dobrar. */
export const MAX_MULTIPLIER = 4

/** Fração do medidor que cada trecho de star power completo entrega. */
export const STAR_POWER_PER_PHRASE = 0.25

/** Mínimo de medidor para conseguir ativar. */
export const STAR_POWER_ACTIVATION_MINIMUM = 0.5

/** Um medidor cheio dura 32 batidas de música. */
export const STAR_POWER_BEATS_PER_FULL_BAR = 32

export interface MeterTuning {
  /** Quanto o medidor sobe por nota acertada. */
  gain: number
  /** Quanto desce por nota perdida ou palhetada no vazio. */
  loss: number
}

/**
 * O medidor perdoa mais nas dificuldades baixas. As taxas são assimétricas
 * de propósito: errar precisa doer mais do que acertar recompensa, senão a
 * música nunca apresenta risco de falhar.
 */
export const METER_BY_DIFFICULTY: Record<Difficulty, MeterTuning> = {
  easy: { gain: 0.035, loss: 0.05 },
  medium: { gain: 0.03, loss: 0.065 },
  hard: { gain: 0.025, loss: 0.08 },
  expert: { gain: 0.02, loss: 0.095 },
}

export const METER_START = 0.5

/**
 * Decide se os trastes pressionados satisfazem uma nota.
 *
 * A regra vem do original e não é intuitiva: numa nota simples vale segurar
 * trastes **abaixo** do alvo — a mão fica apoiada no braço — desde que o
 * traste mais alto pressionado seja exatamente o da nota. Segurar um traste
 * acima invalida. Acordes exigem correspondência exata, sem sobras.
 */
export function fretsSatisfyNote(mask: number, note: Note): boolean {
  if (note.isOpen) return mask === 0
  if (countFrets(note.frets) > 1) return mask === note.frets
  return highestFret(mask) === highestFret(note.frets)
}

/**
 * Duração de uma batida no instante dado, lida da grade de batidas do chart.
 * Serve para pagar sustains no ritmo da música em vez de por segundo fixo.
 */
export function beatDurationAt(beats: number[], time: number): number {
  if (beats.length < 2) return 0.5
  let lo = 0
  let hi = beats.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (beats[mid] <= time) lo = mid
    else hi = mid - 1
  }
  return Math.max(0.05, beats[lo + 1] - beats[lo])
}

export function multiplierFor(streak: number, starPowerActive: boolean): number {
  const base = Math.min(MAX_MULTIPLIER, 1 + Math.floor(streak / NOTES_PER_MULTIPLIER_STEP))
  return starPowerActive ? base * 2 : base
}
