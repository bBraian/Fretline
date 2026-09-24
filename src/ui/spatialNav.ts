/**
 * Para onde o foco vai quando o direcional aponta para um lado.
 *
 * As telas com lista cuidam das próprias setas — o menu principal, as
 * músicas, a carreira. As outras (loja, ajustes, resultados, a pausa) são
 * formulários de botões espalhados pela tela, e ali andar com o controle é
 * andar no plano: o próximo foco é o controle mais perto na direção pedida.
 *
 * Só geometria, sem DOM: quem chama mede os retângulos. É o que deixa a
 * regra ser conferida em Node, com retângulos escritos à mão.
 */

import type { Direction } from '../input/padNav'

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Sobreposição tolerada no eixo do movimento.
 *
 * Bordas de 2px encostadas, uma sombra que avança um pouco sobre a linha
 * seguinte: sem folga, o vizinho de baixo que encosta no de cima deixaria de
 * estar "embaixo".
 */
const SLACK = 6

/** Distância entre dois intervalos; zero se eles se cruzam. */
function gap(a0: number, a1: number, b0: number, b1: number) {
  if (b1 < a0) return a0 - b1
  if (b0 > a1) return b0 - a1
  return 0
}

/**
 * O índice do candidato mais perto de `from` na direção pedida, ou -1.
 *
 * Um candidato só conta se estiver de fato daquele lado: começa depois de
 * onde `from` termina, com a folga de `SLACK`, e o centro dele avança na
 * direção. Entre os que contam, vence a menor soma da distância no eixo do
 * movimento com o dobro do desvio no eixo cruzado — o dobro é o que faz a
 * seta para baixo preferir o botão logo abaixo a um mais perto mas lá do
 * outro lado da tela.
 */
export function pickInDirection(from: Rect, candidates: readonly Rect[], dir: Direction): number {
  const fx = (from.left + from.right) / 2
  const fy = (from.top + from.bottom) / 2
  let best = -1
  let bestScore = Infinity

  candidates.forEach((c, i) => {
    const cx = (c.left + c.right) / 2
    const cy = (c.top + c.bottom) / 2

    let along: number
    let advance: number
    let cross: number
    let offset: number
    if (dir === 'down' || dir === 'up') {
      along = dir === 'down' ? c.top - from.bottom : from.top - c.bottom
      advance = dir === 'down' ? cy - fy : fy - cy
      cross = gap(from.left, from.right, c.left, c.right)
      offset = Math.abs(cx - fx)
    } else {
      along = dir === 'right' ? c.left - from.right : from.left - c.right
      advance = dir === 'right' ? cx - fx : fx - cx
      cross = gap(from.top, from.bottom, c.top, c.bottom)
      offset = Math.abs(cy - fy)
    }
    if (along < -SLACK || advance <= 0) return

    // O desvio entre centros só desempata: entre dois alinhados, o mais
    // centrado.
    const score = Math.max(0, along) + cross * 2 + offset * 0.05
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  })

  return best
}
