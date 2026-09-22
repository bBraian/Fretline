/**
 * Quantas faixas a partida precisa mesmo manter separadas.
 *
 * A resposta é duas, e vem do único lugar do jogo que trata faixas de forma
 * diferente: o abafamento no erro. A guitarra e a base calam; todo o resto
 * continua tocando. Nada mais no jogo sabe distinguir uma bateria de um
 * vocal.
 *
 * Um pacote de Rock Band, porém, traz sete faixas — em "When I Come Around"
 * são `guitar`, `rhythm`, `song`, `vocals` e **três** de bateria. Mantidas
 * separadas, são sete `AudioBuffer` de PCM decodificado (perto de 70MB cada
 * numa música de três minutos) e sete fontes tocando em paralelo, somadas
 * pela thread de áudio a cada bloco. A memória é o custo visível; o invisível
 * é a pressão na thread de áudio, e é ela que produz engasgo — que num jogo
 * de ritmo é o defeito que mais dói, porque o relógio da música é o áudio.
 *
 * Misturadas nos dois grupos que o jogo de fato usa, o custo cai para duas
 * de cada.
 */

import type { StemRole } from './songPlayer'

/** Esta faixa cala quando o jogador erra? */
export function isDuckedRole(role: StemRole): boolean {
  return role === 'guitar' || role === 'rhythm'
}

/**
 * Separa as faixas nos dois grupos que o jogo distingue.
 *
 * `ducked` é o que a mão do jogador é responsável por tocar, e portanto o
 * que some quando ela erra; `rest` é a banda, que não para.
 */
export function groupStems<T extends { role: StemRole }>(stems: T[]): { ducked: T[]; rest: T[] } {
  const ducked: T[] = []
  const rest: T[] = []
  for (const stem of stems) {
    if (isDuckedRole(stem.role)) ducked.push(stem)
    else rest.push(stem)
  }
  return { ducked, rest }
}
