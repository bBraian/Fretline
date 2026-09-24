/**
 * A abertura: o que o jogo mostra desce antes do menu, e ela termina em
 * "Pressione qualquer tecla".
 *
 * O gesto é o que cria o áudio: navegador nenhum deixa tocar antes de um,
 * e antes o menu abria mudo até o primeiro clique. Sai-se ao **soltar** a
 * tecla, não ao apertar — o `keydown` já deu ao navegador a ativação que
 * libera o som, e sair nele deixaria o `keyup` do Espaço (ou o botão ainda
 * apertado do controle) confirmar o primeiro item do menu recém-montado.
 */

import { useEffect, useState } from 'react'
import { Backdrop } from '../Backdrop'
import { useGame } from '../store'
import { getBootState, startBoot } from '../boot'
import { bootView } from '../bootView'

/** Teclas que não contam como "qualquer tecla": foco, janela e modificadores. */
const IGNORADAS = new Set(['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'F11', 'F12'])

export function BootScreen() {
  const setScreen = useGame((s) => s.setScreen)
  const refreshLocalLibrary = useGame((s) => s.refreshLocalLibrary)
  const [estado, setEstado] = useState(getBootState)

  useEffect(() => {
    startBoot(refreshLocalLibrary)
    const leitura = window.setInterval(() => setEstado(getBootState()), 120)
    return () => window.clearInterval(leitura)
  }, [refreshLocalLibrary])

  const view = bootView(estado)

  useEffect(() => {
    if (!view.ready) return
    const entrar = () => setScreen('menu')

    let tecla: string | null = null
    const apertou = (event: KeyboardEvent) => {
      if (!IGNORADAS.has(event.key)) tecla = event.code
    }
    const soltou = (event: KeyboardEvent) => {
      if (event.code !== tecla) return
      event.preventDefault()
      entrar()
    }
    const clicou = (event: MouseEvent) => {
      // O botão de tela cheia continua sendo só o botão de tela cheia.
      if ((event.target as Element | null)?.closest('button')) return
      entrar()
    }
    window.addEventListener('keydown', apertou)
    window.addEventListener('keyup', soltou)
    window.addEventListener('click', clicou)

    // Controle: sondagem, porque a API não tem evento de botão. Sai quando
    // um botão apertado é solto.
    let quadro = 0
    let segurando = false
    const sondar = () => {
      quadro = requestAnimationFrame(sondar)
      const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected)
      const algum = Boolean(pad?.buttons.some((botao) => botao.pressed))
      if (segurando && !algum) entrar()
      segurando = algum
    }
    quadro = requestAnimationFrame(sondar)

    return () => {
      window.removeEventListener('keydown', apertou)
      window.removeEventListener('keyup', soltou)
      window.removeEventListener('click', clicou)
      cancelAnimationFrame(quadro)
    }
  }, [view.ready, setScreen])

  return (
    <div className="screen boot-screen">
      <Backdrop />

      <div className="boot">
        <div className="boot-brand">
          {/* Título partido: o nome acessível vem do `aria-label` — armadilha 3
              do contrato de design. */}
          <h1 className="wordmark" aria-label="Fretline">
            <span className="wordmark-line" aria-hidden>
              Fret
            </span>
            <span className="wordmark-line wordmark-line-2" aria-hidden>
              line
            </span>
          </h1>
          <p className="wordmark-sub">Cinco trastes, sem palhetada</p>
        </div>

        <div className="boot-status" aria-live="polite">
          {view.ready ? (
            <>
              <p className="boot-press">Pressione qualquer tecla</p>
              <p className="boot-line boot-line-dim">{view.library}</p>
              {view.failures && <p className="boot-line boot-line-dim">{view.failures}</p>}
            </>
          ) : (
            <>
              <div className={view.bar === null ? 'loading-bar is-waiting' : 'loading-bar'}>
                <i style={view.bar === null ? undefined : { width: `${view.bar * 100}%` }} />
              </div>
              <p className="boot-line">{view.line}</p>
              <p className="boot-line boot-line-dim">{view.library}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
