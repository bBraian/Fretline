/**
 * Controles que recusam em vez de ignorar.
 *
 * Um `<button disabled>` não emite evento nenhum: o clique não chega ao
 * JavaScript, e por isso não há como dizer "não dá". Silêncio é a única
 * resposta possível, e silêncio se confunde com defeito — quem clicou não
 * sabe se o botão está bloqueado ou se o jogo travou.
 *
 * Trocar `disabled` por `aria-disabled` resolve isso sem mudar nada do que
 * se vê: o controle continua anunciado como indisponível para leitores de
 * tela, continua com a mesma aparência (as regras de estilo ganharam o
 * seletor equivalente), e passa a poder responder. Ele responde com o som
 * de recusa e não faz mais nada.
 *
 * Vale só para bloqueio que a interface conhece sozinha — estrelas de
 * menos, música sem áudio, calibração sem amostras suficientes. Bloqueio
 * que é regra de progresso, como não ter dinheiro, é recusado pela loja em
 * `store.ts`, que é onde a regra mora; espalhar a mesma recusa nos dois
 * lugares tocaria o som duas vezes.
 */

import { mixer } from '../audio/mixer'

interface BlockedProps {
  'aria-disabled'?: true
  onClick: () => void
}

/**
 * Propriedades de um controle que pode estar bloqueado.
 *
 * Passando `false`, devolve o controle normal — dá para usar sem espalhar
 * condicional pelo JSX.
 */
export function blockable(blocked: boolean, onClick: () => void): BlockedProps {
  if (!blocked) return { onClick }
  return {
    'aria-disabled': true,
    onClick: () => mixer.play('blocked'),
  }
}
