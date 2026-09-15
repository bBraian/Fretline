/**
 * Geometria do braço, em unidades de mundo.
 *
 * A linha de batida fica em z = 0 e a música vem de z negativo em direção à
 * câmera. Uma nota daqui a `t` segundos está em `z = -t * noteSpeed`, o que
 * torna a posição de qualquer nota uma conta só, sem estado acumulado.
 */

export const LANE_WIDTH = 0.52
export const LANE_COUNT = 5

/** Largura total da pista. */
export const HIGHWAY_WIDTH = LANE_WIDTH * LANE_COUNT

/** Comprimento desenhado do braço, atrás da linha de batida. */
export const HIGHWAY_LENGTH = 27

/** Quanto do braço aparece na frente da linha de batida. */
export const HIGHWAY_OVERSHOOT = 2.2

/** Centro horizontal de um traste. */
export function laneX(lane: number): number {
  return (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH
}

/** Velocidade padrão de rolagem, em unidades por segundo. */
export const DEFAULT_NOTE_SPEED = 11

/** Altura da superfície do braço. */
export const HIGHWAY_Y = 0

/** Altura em que as notas flutuam sobre o braço. */
export const NOTE_Y = 0.06
