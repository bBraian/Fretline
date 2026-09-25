/**
 * Ajustes: dificuldade, velocidade do braço, volume e remapeamento de teclas.
 */

import { useEffect, useState } from 'react'
import { useGame } from '../store'
import { DIFFICULTIES, FRET_COLORS, FRET_NAMES } from '../../engine/types'
import { gamepadAxisLabel, gamepadButtonLabel, DEFAULT_GAMEPAD, DEFAULT_KEYBOARD, keyLabel } from '../../input/bindings'
import { Backdrop } from '../Backdrop'
import { mixer } from '../../audio/mixer'
import { useBackKey } from '../useBackKey'
import { holdGamepadNav } from '../gamepadNav'
import { useT } from '../useT'
import { STRUM_MODES, looksLikeGuitar, type StrumMode } from '../../input/guitar'

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
  const [padMapping, setPadMapping] = useState('')
  const t = useT()

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
      // A tecla sintética é o controle navegando, não alguém escolhendo uma
      // tecla: gravar a seta do direcional num traste prenderia quem chegou
      // aqui de controle na mão. Só o Esc dele — o B — vale, e cancela.
      if (!event.isTrusted && event.code !== 'Escape') return
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
      setPadMapping(pad ? pad.mapping : '')
      const pressed = pad ? pad.buttons.flatMap((b, i) => (b.pressed ? [i] : [])) : []
      setLivePressed((antes) =>
        antes.length === pressed.length && antes.every((v, i) => v === pressed[i]) ? antes : pressed,
      )
      // Na precisão que a tela mostra. Um analógico em repouso nunca lê o
      // mesmo número dois quadros seguidos, e comparar o valor cru
      // redesenhava a tela inteira a cada quadro com o controle ligado.
      setAxes((antes) => {
        const atual = pad ? pad.axes.map((v) => Math.round(v * 100) / 100) : []
        return antes.length === atual.length && antes.every((v, i) => v === atual[i]) ? antes : atual
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // Esperando o botão a gravar, o controle não navega: o B gravado num
  // traste não pode também sair da tela.
  useEffect(() => {
    if (!padListening) return
    return holdGamepadNav()
  }, [padListening])

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

  const strumLabel = (mode: StrumMode) =>
    mode === 'guitar' ? t.settings.strumGuitar : mode === 'always' ? t.settings.strumAlways : t.settings.off

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
          {ativo ? t.settings.pressButton : gamepadButtonLabel(index, t.input)}
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
          ? t.settings.pressKey
          : keyLabel(code, t.input)}
      </button>
    </div>
  )

  return (
    <div className="screen">
      <Backdrop variant="content" />
      <header className="screen-head">
        <div>
          <h1 className="screen-title">{t.settings.title}</h1>
          <p className="screen-subtitle">{t.settings.subtitle}</p>
        </div>
      </header>

      <div className="screen-body">
        <div className="field">
          <span className="field-label">{t.settings.difficulty}</span>
          <div className="segmented">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                data-active={settings.difficulty === d}
                onClick={() => updateSettings({ difficulty: d })}
              >
                {t.difficulty[d]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">{t.settings.noteSpeed}</span>
          <p className="field-hint">{t.settings.noteSpeedHint}</p>
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
          <span className="field-label">{t.settings.volume}</span>
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
          <span className="field-label">{t.settings.menuMusic}</span>
          <p className="field-hint">{t.settings.menuMusicHint}</p>
          <label className="field-row">
            <input
              type="checkbox"
              checked={settings.menuMusic}
              onChange={(e) => {
                updateSettings({ menuMusic: e.target.checked })
                mixer.play('tweak')
              }}
            />
            <span className="field-value">{settings.menuMusic ? t.settings.on : t.settings.off}</span>
          </label>
        </div>

        <div className="field">
          <span className="field-label">{t.settings.quality}</span>
          <p className="field-hint">{t.settings.qualityHint}</p>
          <div className="segmented">
            {(['alta', 'baixa'] as const).map((q) => (
              <button key={q} data-active={settings.quality === q} onClick={() => updateSettings({ quality: q })}>
                {q === 'alta' ? t.settings.high : t.settings.low}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">{t.settings.noFail}</span>
          <p className="field-hint">{t.settings.noFailHint}</p>
          <div className="field-row">
            <label className="field-row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={settings.noFail}
                onChange={(e) => updateSettings({ noFail: e.target.checked })}
              />
              {t.settings.noFailToggle}
            </label>
          </div>
        </div>

        <div className="field">
          <span className="field-label">{t.settings.calibration}</span>
          <p className="field-hint">{t.settings.calibrationHint}</p>
          <div className="field-row">
            <span style={{ minWidth: 60 }}>{t.settings.audio}</span>
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
            <span style={{ minWidth: 60 }}>{t.settings.video}</span>
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
            {t.settings.measure}
          </button>
        </div>

        <div className="field">
          <span className="field-label">{t.settings.keyboard}</span>
          <p className="field-hint">{t.settings.keyboardHint}</p>
          {settings.keyboard.frets.map((code, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                className="swatch"
                style={{ background: `#${FRET_COLORS[i].toString(16).padStart(6, '0')}` }}
              />
              {bindingButton(t.settings.fret(t.frets[FRET_NAMES[i]]), code, { kind: 'fret', index: i })}
            </div>
          ))}
          {bindingButton(t.settings.starPower, settings.keyboard.starPower, { kind: 'starPower' })}
          {bindingButton(t.settings.whammy, settings.keyboard.whammy, { kind: 'whammy' })}

          <button
            className="btn btn-ghost"
            onClick={() => updateSettings({ keyboard: DEFAULT_KEYBOARD })}
          >
            {t.settings.restore}
          </button>
        </div>

        <div className="field">
          <span className="field-label">{t.settings.controller}</span>
          <p className="field-hint">
            {gamepadName ? t.settings.connected(gamepadName) : t.settings.noController}
          </p>

          {gamepadName && (
            <>
              {settings.gamepad.frets.map((button, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    className="swatch"
                    style={{ background: `#${FRET_COLORS[i].toString(16).padStart(6, '0')}` }}
                  />
                  {padButton(t.settings.fret(t.frets[FRET_NAMES[i]]), button, { kind: 'fret', index: i })}
                </div>
              ))}
              {padButton(t.settings.starPower, settings.gamepad.starPower, { kind: 'starPower' })}
              {padButton(t.settings.strumUp, settings.gamepad.strumUp, { kind: 'strumUp' })}
              {padButton(t.settings.strumDown, settings.gamepad.strumDown, { kind: 'strumDown' })}

              <div className="field-row">
                <span style={{ minWidth: 92 }}>{t.settings.whammy}</span>
                <select
                  value={settings.gamepad.whammyAxis}
                  onChange={(e) => {
                    updateSettings({
                      gamepad: { ...settings.gamepad, whammyAxis: Number(e.target.value) },
                    })
                    mixer.play('tweak')
                  }}
                >
                  <option value={-1}>{t.settings.whammyOff}</option>
                  {axes.map((_, i) => (
                    <option key={i} value={i}>
                      {gamepadAxisLabel(i, t.input)}
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
                {t.settings.pressedNow(livePressed.map((b) => gamepadButtonLabel(b, t.input)).join(', '))}
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
            {t.settings.restore}
          </button>
        </div>

        <div className="field">
          <span className="field-label">{t.settings.strum}</span>
          <p className="field-hint">{t.settings.strumHint}</p>
          <div className="segmented">
            {STRUM_MODES.map((mode) => (
              <button key={mode} data-active={settings.strum === mode} onClick={() => updateSettings({ strum: mode })}>
                {strumLabel(mode)}
              </button>
            ))}
          </div>
          {/* Com o controle na mão, o jogador vê se o "só na guitarra" o
              pegou — é o que diz quando escolher "todo controle". */}
          {gamepadName && settings.strum === 'guitar' && (
            <p className="field-hint">
              {looksLikeGuitar({ id: gamepadName, mapping: padMapping, axes }, settings.gamepad.whammyAxis)
                ? t.settings.guitarFound
                : t.settings.guitarNotFound}
            </p>
          )}
        </div>
      </div>

      <footer className="screen-foot">
        <button className="btn btn-ghost" onClick={() => {
            mixer.play('back')
            setScreen('menu')
          }}>
          {t.common.back}
        </button>
      </footer>
    </div>
  )
}
