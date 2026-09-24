/**
 * O aviso de controle conectado, no canto superior direito.
 *
 * Vive no roteador, ao lado do botão de tela cheia, porque o controle pode
 * chegar em qualquer tela, inclusive no meio de uma música. Ali o canto de
 * cima à direita é o único que o HUD deixa livre, e o aviso não recebe
 * ponteiro: não há o que clicar nele, e quem está de controle na mão não
 * clicaria.
 *
 * Quem decide é `gamepadconnected`, e não a sondagem de `getGamepads()`. O
 * navegador só revela um controle depois que alguém aperta um botão nele,
 * por privacidade, então o evento chega no primeiro toque e não na hora em
 * que o cabo entra. É esse o momento de avisar. A sondagem vê o mesmo
 * controle a cada quadro e não sabe dizer quando ele é novidade.
 *
 * Não toca som: o toque que revela o controle é também um comando para a
 * tela embaixo, que já responde com o próprio som.
 */

import { useEffect, useState } from 'react'
import { useGame } from './store'
import { FRET_NAMES } from '../engine/types'
import { gamepadButtonLabel, gamepadName, pausePadButton } from '../input/bindings'

/** Quanto o aviso fica inteiro na tela, antes de sair. */
const VISIBLE_MS = 4200
/** A saída, igual à duração de `pad-toast-out` em `theme.css`. */
const LEAVE_MS = 220

const FRET_LABELS: Record<(typeof FRET_NAMES)[number], string> = {
  green: 'verde',
  red: 'vermelho',
  yellow: 'amarelo',
  blue: 'azul',
  orange: 'laranja',
}

interface Notice {
  name: string
  /** Um controle novo remonta o aviso, e a entrada recomeça. */
  key: number
}

export function GamepadToast() {
  const bindings = useGame((s) => s.settings.gamepad)
  const frets = bindings.frets
  const pausa = pausePadButton(bindings)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    let seq = 0
    const onConnect = (event: GamepadEvent) => {
      seq += 1
      setLeaving(false)
      setNotice({ name: gamepadName(event.gamepad.id), key: seq })
    }
    window.addEventListener('gamepadconnected', onConnect)
    return () => window.removeEventListener('gamepadconnected', onConnect)
  }, [])

  useEffect(() => {
    if (!notice) return
    const sair = window.setTimeout(() => setLeaving(true), VISIBLE_MS)
    const sumir = window.setTimeout(() => setNotice(null), VISIBLE_MS + LEAVE_MS)
    return () => {
      window.clearTimeout(sair)
      window.clearTimeout(sumir)
    }
  }, [notice])

  const mapa = frets
    .map((button, i) => `${FRET_LABELS[FRET_NAMES[i]]} ${gamepadButtonLabel(button)}`)
    .join(', ')

  // A região fica montada o tempo todo: leitor de tela só anuncia mudança
  // numa região viva que já existia antes dela.
  return (
    <div className="pad-toast-region" role="status" aria-live="polite">
      {notice && (
        <div key={notice.key} className="pad-toast" data-leaving={leaving}>
          <span className="pad-toast-icon" aria-hidden>
            <PadIcon />
          </span>
          <div className="pad-toast-body">
            <strong className="pad-toast-title">Controle conectado</strong>
            <span className="pad-toast-name">{notice.name}</span>
            <span className="pad-toast-frets" aria-label={`Trastes: ${mapa}`}>
              {frets.map((button, i) => (
                <span
                  key={i}
                  className="pad-toast-fret"
                  style={{ background: `var(--${FRET_NAMES[i]})` }}
                  aria-hidden
                >
                  {gamepadButtonLabel(button)}
                </span>
              ))}
            </span>
            {/* O botão de pausa depende do mapeamento — o Start costuma ser
                o star power —, e sem dizer qual é ninguém o acharia. */}
            {pausa >= 0 && <span className="pad-toast-hint">Pausa: {gamepadButtonLabel(pausa)}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

/** Um controle de frente: corpo, direcional e os quatro botões. */
function PadIcon() {
  return (
    <svg viewBox="0 0 32 22" width="32" height="22" focusable="false">
      <path
        d="M9 2h14c4 0 6.5 2.6 7.3 6.6l1 6.2c.5 3-1.4 5.2-3.9 5.2-1.7 0-2.8-.9-3.8-2.4L22 15H10l-1.6 2.6C7.4 19.1 6.3 20 4.6 20 2.1 20 .2 17.8.7 14.8l1-6.2C2.5 4.6 5 2 9 2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9 6.5v6M6 9.5h6" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
      <circle cx="23" cy="6.8" r="1.4" fill="currentColor" />
      <circle cx="23" cy="12.2" r="1.4" fill="currentColor" />
      <circle cx="20.3" cy="9.5" r="1.4" fill="currentColor" />
      <circle cx="25.7" cy="9.5" r="1.4" fill="currentColor" />
    </svg>
  )
}
