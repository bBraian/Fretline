/**
 * Esc faz o mesmo que o "← Voltar" da tela.
 *
 * Fica num gancho, e não num ouvinte no roteador, porque voltar não é a
 * mesma coisa em toda tela: a calibração precisa parar a medição antes de
 * sair, e os ajustes têm um "cancelar" interno — a captura de tecla — que
 * responde ao Esc primeiro. Um ouvinte central só conheceria `setScreen`, e
 * essas duas telas teriam que desligá-lo na mão.
 *
 * O palco não usa este gancho: lá o Esc pausa, que é outra ação.
 *
 * A função fica guardada numa `ref` de propósito. Assim a tela pode passar
 * uma closure nova a cada render — e quase sempre passa, porque a ação lê
 * estado — sem que o ouvinte seja desinscrito e reinscrito junto.
 */

import { useEffect, useRef } from 'react'
import { useGame } from './store'
import { mixer } from '../audio/mixer'

export function useBackKey(onBack: () => void) {
  const acao = useRef(onBack)
  acao.current = onBack

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      // Alguém mais perto do gesto já resolveu este Esc — a captura de
      // tecla dos ajustes, por exemplo, que roda na fase de captura.
      if (event.defaultPrevented) return
      event.preventDefault()
      acao.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

/**
 * O caso comum: voltar é sair para o menu principal, e soa como tal.
 *
 * Cinco telas fazem exatamente isto no botão de voltar. Repetir o corpo em
 * cada uma seria o caminho curto para uma delas ficar muda numa refatoração
 * — o mesmo motivo pelo qual os sons das listas moram no `store`.
 */
export function useBackToMenu() {
  const setScreen = useGame((s) => s.setScreen)
  useBackKey(() => {
    mixer.play('back')
    setScreen('menu')
  })
}
