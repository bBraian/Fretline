/**
 * Ajustes: dificuldade, velocidade do braço, volume e remapeamento de teclas.
 */

import { useEffect, useState } from 'react'
import { useGame } from '../store'
import { difficultyName } from './MenuScreen'
import { DIFFICULTIES, FRET_COLORS, FRET_NAMES } from '../../engine/types'
import { gamepadAxisLabel, gamepadButtonLabel, DEFAULT_GAMEPAD, DEFAULT_KEYBOARD, keyLabel } from '../../input/bindings'
import { Backdrop } from '../Backdrop'
import { mixer } from '../../audio/mixer'
import { useBackKey } from '../useBackKey'

type Listening = { kind: 'fret'; index: number } | { kind: 'starPower' | 'whammy' } | null

/** O mesmo, para o controle. */
type PadListening =
  | { kind: 'fret'; index: number }
  | { kind: 'starPower' | 'strumUp' | 'strumDown' }
  | null

export function SettingsScreen() {
  const { settings, updateSettings, setScreen } = useGame()
  const [listening, setListening] = useState<Listening>(null)
  const [gamepadName, setGamepadName] = useState<string | null>(null)
  const [padListening, setPadListening] = useState<PadListening>(null)
  const [livePressed, setLivePressed] = useState<number[]>([])
  const [axes, setAxes] = useState<number[]>([])

  /**
   * Esc aqui tem dois donos, e o de dentro vem primeiro.
   *
   * Com uma captura de comando aberta, Esc a cancela — é o que o rótulo
   * "aperte uma tecla" promete. Só sem captura nenhuma é que ele sai da
   * tela. A captura de teclado já se defende sozinha, na fase de captura;
   * a de controle não, e é por ela que a guarda existe.
   */
  useBackKey(() => {
    if (listening || padListening) {
      setListening(null)
      setPadListening(null)
      return
    }
    mixer.play('back')
    setScreen('menu')
  })

  // Captura a próxima tecla apertada e grava no comando escolhido.
  useEffect(() => {
    if (!listening) return

    const onKey = (event: KeyboardEvent) => {
      event.preventDefault()
      if (event.code === 'Escape') {
        setListening(null)
        return
      }

      const keyboard = { ...settings.keyboard, frets: [...settings.keyboard.frets] }
      if (listening.kind === 'fret') keyboard.frets[listening.index] = event.code
      else keyboard[listening.kind] = event.code

      updateSettings({ keyboard })
      setListening(null)
    }

    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [listening, settings.keyboard, updateSettings])

  // Mostra se há controle conectado, para o jogador não ficar no escuro.
  /**
   * Lê o controle continuamente.
   *
   * A API de gamepad não emite eventos de botão — só expõe um retrato do
   * estado —, então descobrir qual botão o jogador apertou exige perguntar a
   * cada quadro. É o mesmo laço que alimenta a lista de "apertados agora" e a
   * captura de um novo mapeamento.
   *
   * Conectar e desconectar também passam por aqui: o retrato some quando o
   * controle sai, e a tela acompanha sem precisar recarregar.
   */
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const pad = (navigator.getGamepads?.() ?? []).find((p) => p?.connected) ?? null
      setGamepadName(pad ? pad.id : null)
      const pressed = pad ? pad.buttons.flatMap((b, i) => (b.pressed ? [i] : [])) : []
      setLivePressed((antes) =>
        antes.length === pressed.length && antes.every((v, i) => v === pressed[i]) ? antes : pressed,
      )
      setAxes((antes) => {
        const atual = pad ? [...pad.axes] : []
        return antes.length === atual.length && antes.every((v, i) => v === atual[i]) ? antes : atual
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  /**
   * Grava o próximo botão apertado no comando escolhido.
   *
   * Espera o botão ser **solto e apertado de novo**: sem isso, o clique do
   * mouse que abriu a captura já chegaria com um botão do controle
   * pressionado e gravaria o errado.
   */
  useEffect(() => {
    if (!padListening) return
    let armado = livePressed.length === 0
    let frame = 0
    const tick = () => {
      const pad = (navigator.getGamepads?.() ?? []).find((p) => p?.connected)
      const apertado = pad?.buttons.findIndex((b) => b.pressed) ?? -1
      if (apertado < 0) armado = true
      else if (armado) {
        const gamepad = { ...settings.gamepad, frets: [...settings.gamepad.frets] }
        if (padListening.kind === 'fret') gamepad.frets[padListening.index] = apertado
        else gamepad[padListening.kind] = apertado
        updateSettings({ gamepad })
        mixer.play('select')
        setPadListening(null)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    const cancelar = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setPadListening(null)
    }
    window.addEventListener('keydown', cancelar)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', cancelar)
    }
  }, [padListening, livePressed.length, settings.gamepad, updateSettings])

  const padButton = (label: string, index: number, target: PadListening) => {
    const ativo = padListening !== null && JSON.stringify(padListening) === JSON.stringify(target)
    return (
      <div className="field-row" key={label}>
        <span style={{ minWidth: 130 }}>{label}</span>
        <button
          className="btn key-binding"
          data-listening={ativo}
          onClick={() => {
            setPadListening(target)
            mixer.play('move')
          }}
        >
          {ativo ? 'aperte um botão…' : gamepadButtonLabel(index)}
        </button>
      </div>
    )
  }

  const bindingButton = (label: string, code: string, target: Listening) => (
    <div className="field-row" key={label}>
      <span style={{ minWidth: 130 }}>{label}</span>
      <button
        className="btn key-binding"
        data-listening={listening !== null && JSON.stringify(listening) === JSON.stringify(target)}
        onClick={() => setListening(target)}
      >
        {listening && JSON.stringify(listening) === JSON.stringify(target)
          ? 'aperte…'
          : keyLabel(code)}
      </button>
    </div>
  )

  return (
    <div className="screen">
      <Backdrop variant="content" />
      <header className="screen-head">
        <div>
          <h1 className="screen-title">Ajustes</h1>
          <p className="screen-subtitle">Tudo é gravado no navegador assim que você muda.</p>
        </div>
      </header>

      <div className="screen-body">
        <div className="field">
          <span className="field-label">Dificuldade</span>
          <div className="segmented">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                data-active={settings.difficulty === d}
                onClick={() => updateSettings({ difficulty: d })}
              >
                {difficultyName(d)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Velocidade do braço</span>
          <p className="field-hint">
            Não muda a música, só o quanto ela ocupa da tela. Mais rápido significa notas mais
            espalhadas e mais fáceis de ler nos trechos densos.
          </p>
          <div className="field-row">
            <input
              type="range"
              min={5}
              max={20}
              step={0.5}
              value={settings.noteSpeed}
              onChange={(e) => updateSettings({ noteSpeed: Number(e.target.value) })}
            />
            <span className="field-value">{settings.noteSpeed.toFixed(1)}</span>
          </div>
        </div>

        <div className="field">
          <span className="field-label">Volume</span>
          <div className="field-row">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={settings.volume}
              onChange={(e) => {
                updateSettings({ volume: Number(e.target.value) })
                mixer.play('tweak')
              }}
            />
            <span className="field-value">{Math.round(settings.volume * 100)}%</span>
          </div>
        </div>

        <div className="field">
          <span className="field-label">Música nos menus</span>
          <p className="field-hint">
            Um laço de fundo enquanto você escolhe música e personagem. Toca à metade do volume
            geral, para não disputar com os efeitos.
          </p>
          <label className="field-row">
            <input
              type="checkbox"
              checked={settings.menuMusic}
              onChange={(e) => {
                updateSettings({ menuMusic: e.target.checked })
                mixer.play('tweak')
              }}
            />
            <span className="field-value">{settings.menuMusic ? 'Ligada' : 'Desligada'}</span>
          </label>
        </div>

        <div className="field">
          <span className="field-label">Qualidade gráfica</span>
          <p className="field-hint">
            Na alta, o show ganha brilho difuso e sombras projetadas. Na baixa esses dois saem, o
            que devolve bastante quadro por segundo em máquinas modestas — a jogabilidade e o
            julgamento das notas não mudam em nada.
          </p>
          <div className="segmented">
            {(['alta', 'baixa'] as const).map((q) => (
              <button key={q} data-active={settings.quality === q} onClick={() => updateSettings({ quality: q })}>
                {q === 'alta' ? 'Alta' : 'Baixa'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Sem falha</span>
          <p className="field-hint">
            O medidor continua se mexendo, mas a música nunca é interrompida. Útil para aprender
            um trecho difícil.
          </p>
          <div className="field-row">
            <label className="field-row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={settings.noFail}
                onChange={(e) => updateSettings({ noFail: e.target.checked })}
              />
              Nunca falhar a música
            </label>
          </div>
        </div>

        <div className="field">
          <span className="field-label">Calibração</span>
          <p className="field-hint">
            Dois números diferentes: o de áudio desloca o julgamento das notas, o de vídeo desloca
            só o desenho. A tela de calibração mede os dois para você.
          </p>
          <div className="field-row">
            <span style={{ minWidth: 60 }}>Áudio</span>
            <input
              type="range"
              min={-0.2}
              max={0.2}
              step={0.001}
              value={settings.audioOffset}
              onChange={(e) => updateSettings({ audioOffset: Number(e.target.value) })}
            />
            <span className="field-value">{Math.round(settings.audioOffset * 1000)} ms</span>
          </div>
          <div className="field-row">
            <span style={{ minWidth: 60 }}>Vídeo</span>
            <input
              type="range"
              min={-0.2}
              max={0.2}
              step={0.001}
              value={settings.videoOffset}
              onChange={(e) => updateSettings({ videoOffset: Number(e.target.value) })}
            />
            <span className="field-value">{Math.round(settings.videoOffset * 1000)} ms</span>
          </div>
          <button className="btn" onClick={() => setScreen('calibration')}>
            Medir automaticamente
          </button>
        </div>

        <div className="field">
          <span className="field-label">Teclado</span>
          <p className="field-hint">
            Não há palhetada: a nota é tocada no traste. Notas abertas — a barra larga que ocupa
            a pista inteira — são tocadas soltando todos os trastes.
          </p>
          {settings.keyboard.frets.map((code, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                className="swatch"
                style={{ background: `#${FRET_COLORS[i].toString(16).padStart(6, '0')}` }}
              />
              {bindingButton(`Traste ${FRET_NAMES[i]}`, code, { kind: 'fret', index: i })}
            </div>
          ))}
          {bindingButton('Star power', settings.keyboard.starPower, { kind: 'starPower' })}
          {bindingButton('Alavanca', settings.keyboard.whammy, { kind: 'whammy' })}

          <button
            className="btn btn-ghost"
            onClick={() => updateSettings({ keyboard: DEFAULT_KEYBOARD })}
          >
            Restaurar o padrão
          </button>
        </div>

        <div className="field">
          <span className="field-label">Controle</span>
          <p className="field-hint">
            {gamepadName
              ? `Conectado: ${gamepadName}. Clique num comando e aperte o botão que quer usar.`
              : 'Nenhum controle detectado. Conecte e aperte um botão — o navegador só o revela depois disso.'}
          </p>

          {gamepadName && (
            <>
              {settings.gamepad.frets.map((button, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    className="swatch"
                    style={{ background: `#${FRET_COLORS[i].toString(16).padStart(6, '0')}` }}
                  />
                  {padButton(`Traste ${FRET_NAMES[i]}`, button, { kind: 'fret', index: i })}
                </div>
              ))}
              {padButton('Star power', settings.gamepad.starPower, { kind: 'starPower' })}
              {padButton('Strum para cima', settings.gamepad.strumUp, { kind: 'strumUp' })}
              {padButton('Strum para baixo', settings.gamepad.strumDown, { kind: 'strumDown' })}

              <div className="field-row">
                <span style={{ minWidth: 92 }}>Alavanca</span>
                <select
                  value={settings.gamepad.whammyAxis}
                  onChange={(e) => {
                    updateSettings({
                      gamepad: { ...settings.gamepad, whammyAxis: Number(e.target.value) },
                    })
                    mixer.play('tweak')
                  }}
                >
                  <option value={-1}>desligada</option>
                  {axes.map((_, i) => (
                    <option key={i} value={i}>
                      {gamepadAxisLabel(i)}
                    </option>
                  ))}
                </select>
                <span className="field-value">
                  {(axes[settings.gamepad.whammyAxis] ?? 0).toFixed(2)}
                </span>
              </div>

              {/* Um retrato do que o controle está mandando agora: é o que
                  permite descobrir o número de um botão sem consultar tabela
                  nenhuma. */}
              <p className="field-hint">
                Apertados agora: {livePressed.length ? livePressed.map(gamepadButtonLabel).join(', ') : 'nenhum'}
              </p>
            </>
          )}

          <button
            className="btn btn-ghost"
            onClick={() => {
              updateSettings({ gamepad: DEFAULT_GAMEPAD })
              mixer.play('back')
            }}
          >
            Restaurar o padrão
          </button>
        </div>
      </div>

      <footer className="screen-foot">
        <button className="btn btn-ghost" onClick={() => {
            mixer.play('back')
            setScreen('menu')
          }}>
          ← Voltar
        </button>
      </footer>
    </div>
  )
}
