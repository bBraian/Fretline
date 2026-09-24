/**
 * O interruptor de tela cheia, no canto inferior direito.
 *
 * Vive fora das telas, no roteador, por dois motivos: é a mesma ação em
 * todas elas, e o estado de tela cheia atravessa a navegação — colocá-lo
 * numa tela faria o botão sumir ao entrar noutra e reaparecer com o ícone
 * errado.
 *
 * **Quem manda é o navegador, não este componente.** O ícone acompanha
 * `document.fullscreenElement`, e não uma variável própria: sair pela tecla
 * Esc — o caminho mais comum — não passa por aqui, e um estado próprio
 * ficaria mostrando "sair" com a janela já restaurada.
 *
 * O palco não recebe o botão. Ali o canto inferior direito é do HUD, e um
 * controle de janela por cima da pista é exatamente o tipo de coisa que se
 * clica sem querer no meio de uma música.
 */

import { useEffect, useState } from 'react'
import { mixer } from '../audio/mixer'
import { useT } from './useT'

export function FullscreenButton() {
  const [full, setFull] = useState(() => Boolean(document.fullscreenElement))
  const t = useT()

  useEffect(() => {
    const sincronizar = () => setFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', sincronizar)
    return () => document.removeEventListener('fullscreenchange', sincronizar)
  }, [])

  // Num iframe sem permissão, ou num navegador sem a API, não há o que
  // oferecer — e um botão que não faz nada é pior que botão nenhum.
  if (!document.fullscreenEnabled) return null

  const alternar = () => {
    mixer.play('select')
    // A promessa é recusada quando o gesto não conta como tal para o
    // navegador. Não é erro do jogo: a janela só continua como estava.
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void document.documentElement.requestFullscreen().catch(() => {})
  }

  return (
    <button
      type="button"
      className="fullscreen-toggle"
      onClick={alternar}
      title={full ? t.fullscreen.exit : t.fullscreen.enter}
      aria-label={full ? t.fullscreen.exit : t.fullscreen.enter}
    >
      <span className="fullscreen-icon" aria-hidden>
        {full ? <CompressIcon /> : <ExpandIcon />}
      </span>
      <span className="fullscreen-label">{full ? t.fullscreen.exitShort : t.fullscreen.enter}</span>
    </button>
  )
}

/** Quatro cantos apontando para fora. */
function ExpandIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
      <path
        d="M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
      />
    </svg>
  )
}

/** Os mesmos quatro cantos, apontando para dentro. */
function CompressIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
      <path
        d="M6 1v5H1M15 6h-5V1M10 15v-5h5M1 10h5v5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
      />
    </svg>
  )
}
