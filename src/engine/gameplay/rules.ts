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

/**
 * Meia janela de acerto, em segundos.
 *
 * Mais larga que a de um jogo com palhetada, e de propósito: aqui a nota é
 * resolvida no toque do traste, e duas notas seguidas no mesmo traste exigem
 * soltar e apertar dentro da janela. Esse movimento é mais lento que
 * palhetar, e com 70ms ele ficava impossível nos trechos rápidos.
 */
export const HIT_WINDOW = 0.09

/** Dentro desta distância o acerto conta como perfeito, o que o HUD mostra. */
export const PERFECT_WINDOW = 0.025

/**
 * Tolerância para montar um acorde.
 *
 * Sem palhetada, a nota é resolvida no toque do traste — mas ninguém aperta
 * três trastes no mesmo instante. Um toque que não resolve nada espera este
 * tanto antes de virar castigo, para dar tempo dos outros dedos chegarem.
 * Acima de uns 40ms o castigo por martelar deixa de doer; abaixo de uns
 * 20ms acordes honestos começam a ser punidos.
 */
export const CHORD_GRACE = 0.03

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
  /** Quanto desce pelo primeiro erro de uma sequência. */
  loss: number
  /**
   * Quanto cada erro seguido agrava o próximo.
   *
   * É o que separa um tropeço de um naufrágio. Com perda fixa, errar cinco
   * notas numa passagem difícil custa o mesmo que errar cinco espalhadas
   * pela música inteira — e o jogador que erra uma e se recupera é punido
   * como o que perdeu o compasso. Escalando, um erro isolado quase não
   * pesa e uma sequência longa afunda rápido, que é como o original se
   * comporta.
   */
  escalation: number
}

/**
 * O medidor perdoa mais nas dificuldades baixas.
 *
 * As taxas são assimétricas de propósito: errar precisa doer mais do que
 * acertar recompensa, senão a música nunca apresenta risco de falhar. Mas a
 * diferença entre os níveis está mais na escalada do que na perda inicial —
 * antes o expert tirava quase um décimo do medidor por nota perdida, e uma
 * única passagem ruim acabava com a música.
 */
export const METER_BY_DIFFICULTY: Record<Difficulty, MeterTuning> = {
  easy: { gain: 0.034, loss: 0.032, escalation: 0.22 },
  medium: { gain: 0.028, loss: 0.038, escalation: 0.28 },
  hard: { gain: 0.023, loss: 0.045, escalation: 0.34 },
  expert: { gain: 0.02, loss: 0.05, escalation: 0.4 },
}

/** Depois deste tanto de erros seguidos, a escalada para de crescer. */
export const ESCALATION_CAP = 8

/**
 * Um toque no vazio custa menos que uma nota perdida.
 *
 * Não é a mesma falha: perder a nota é não tocar a música, e apertar demais
 * é ruído. Num trecho rápido, o dedo que se antecipa já é punido por
 * quebrar a corrente — cobrar o preço cheio no medidor punia duas vezes.
 */
export const GHOST_TAP_COST = 0.55

export const METER_START = 0.5

/**
 * Decide se os trastes pressionados satisfazem uma nota.
 *
 * A regra vem do original e não é intuitiva: numa nota simples vale segurar
 * trastes **abaixo** do alvo — a mão fica apoiada no braço — desde que o
 * traste mais alto pressionado seja exatamente o da nota. Segurar um traste
 * acima invalida. Acordes exigem correspondência exata, sem sobras.
 *
 * Ela vale igual sem palhetada: é o que permite subir a escala arrastando a
 * mão, em vez de levantar todos os dedos entre uma nota e a seguinte.
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
