/**
 * Ajustes: dificuldade, velocidade do braço, volume e remapeamento de teclas.
 */

import { useEffect, useState } from 'react'
import { useGame } from '../store'
import { difficultyName } from './MenuScreen'
import { DIFFICULTIES, FRET_COLORS, FRET_NAMES } from '../../engine/types'
import { DEFAULT_GAMEPAD, DEFAULT_KEYBOARD, keyLabel } from '../../input/bindings'

type Listening = { kind: 'fret'; index: number } | { kind: 'starPower' | 'whammy' } | null

export function SettingsScreen() {
  const { settings, updateSettings, setScreen } = useGame()
  const [listening, setListening] = useState<Listening>(null)
  const [gamepadName, setGamepadName] = useState<string | null>(null)

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
  useEffect(() => {
    const check = () => {
      const pad = (navigator.getGamepads?.() ?? []).find((p) => p?.connected)
      setGamepadName(pad ? pad.id : null)
    }
    check()
    const id = window.setInterval(check, 1000)
    return () => window.clearInterval(id)
  }, [])

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
              onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
            />
            <span className="field-value">{Math.round(settings.volume * 100)}%</span>
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
              ? `Conectado: ${gamepadName}. Trastes nos quatro botões de ação mais o bumper direito.`
              : 'Nenhum controle detectado. Conecte e aperte um botão — o navegador só o revela depois disso.'}
          </p>
          <button
            className="btn btn-ghost"
            onClick={() => updateSettings({ gamepad: DEFAULT_GAMEPAD })}
          >
            Restaurar o padrão
          </button>
        </div>
      </div>

      <footer className="screen-foot">
        <button className="btn btn-ghost" onClick={() => setScreen('menu')}>
          ← Voltar
        </button>
      </footer>
    </div>
  )
}
