/**
 * Carreira: estrelas, dinheiro e o que cada coisa desbloqueia.
 *
 * O catálogo de músicas é do jogador, então a carreira não pode ser uma
 * lista fixa de faixas. Ela se organiza sobre o que estiver na biblioteca:
 * as músicas são agrupadas em setlists de tamanho fixo, e cada setlist abre
 * quando o total de estrelas atinge o limite do grupo. Com uma música só, a
 * carreira tem um grupo; com cinquenta, tem treze.
 */

import type { Difficulty } from '../engine/types'
import type { SessionState } from '../engine/gameplay/session'

export const SONGS_PER_SETLIST = 4

/** Estrelas necessárias para abrir cada setlist, da segunda em diante. */
export function starsToUnlockSetlist(index: number): number {
  return index === 0 ? 0 : index * 3 + (index - 1) * 2
}

/** Faixas de acerto que valem cada estrela. */
const STAR_THRESHOLDS = [0.45, 0.6, 0.72, 0.85, 0.94]

/** Multiplicador de recompensa por dificuldade. */
const PAYOUT: Record<Difficulty, number> = {
  easy: 0.6,
  medium: 0.85,
  hard: 1.15,
  expert: 1.6,
}

export interface Performance {
  score: number
  stars: number
  /** Fração de notas acertadas, de 0 a 1. */
  accuracy: number
  longestStreak: number
  money: number
  fullCombo: boolean
  failed: boolean
}

export function evaluate(state: SessionState, difficulty: Difficulty): Performance {
  const accuracy = state.notesTotal > 0 ? state.notesHit / state.notesTotal : 0
  const fullCombo = state.notesHit === state.notesTotal && state.notesTotal > 0

  let stars = 0
  if (!state.failed) {
    for (const threshold of STAR_THRESHOLDS) {
      if (accuracy >= threshold) stars++
    }
    // A sexta estrela é reservada para a música inteira sem um erro.
    if (fullCombo) stars = 6
  }

  const money = state.failed
    ? 0
    : Math.round((state.score / 40 + stars * 250) * PAYOUT[difficulty])

  return {
    score: state.score,
    stars,
    accuracy,
    longestStreak: state.longestStreak,
    money,
    fullCombo,
    failed: state.failed,
  }
}

export function starLabel(stars: number): string {
  if (stars >= 6) return 'Sem um erro'
  if (stars === 5) return 'Impecável'
  if (stars === 4) return 'Muito bom'
  if (stars === 3) return 'Aprovado'
  if (stars === 2) return 'Passou raspando'
  if (stars === 1) return 'Sobreviveu'
  return 'Não passou'
}
