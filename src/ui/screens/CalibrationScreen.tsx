/**
 * Calibração.
 *
 * São dois atrasos diferentes e por isso duas medidas. O de áudio é o tempo
 * entre o jogo agendar um som e o som sair do alto-falante; ele desloca o
 * julgamento das notas. O de vídeo é o tempo entre desenhar um quadro e ele
 * aparecer; desloca só o desenho. Num mesmo computador os dois podem ser
 * bem diferentes — uma caixa de som Bluetooth atrasa dezenas de
 * milissegundos de áudio sem atrasar nada de imagem.
 *
 * Em ambos os casos o jogador bate junto com uma referência e o que vale é a
 * mediana dos desvios, não a média: uma batida perdida no meio do teste
 * estragaria a média e não move a mediana.
 */

import { useEffect, useRef, useState } from 'react'
import { useGame } from '../store'

type Mode = 'idle' | 'audio' | 'video'

const INTERVAL = 0.6
const NEEDED = 12

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

export function CalibrationScreen() {
  const { settings, updateSettings, setScreen } = useGame()
  const [mode, setMode] = useState<Mode>('idle')
  const [taps, setTaps] = useState<number[]>([])
  const [pulse, setPulse] = useState(0)

  const ctxRef = useRef<AudioContext | null>(null)
  const startRef = useRef(0)
  const frameRef = useRef(0)

  const stop = () => {
    setMode('idle')
    cancelAnimationFrame(frameRef.current)
    void ctxRef.current?.close()
    ctxRef.current = null
  }

  useEffect(() => () => stop(), [])

  const begin = async (next: 'audio' | 'video') => {
    stop()
    setTaps([])
    setMode(next)

    const ctx = new AudioContext({ latencyHint: 'interactive' })
    ctxRef.current = ctx
    await ctx.resume()

    const start = ctx.currentTime + 0.4
    startRef.current = start

    if (next === 'audio') {
      // Cliques curtos e secos: quanto mais definido o ataque, mais precisa
      // fica a batida do jogador.
      for (let i = 0; i < NEEDED + 8; i++) {
        const when = start + i * INTERVAL
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = i % 4 === 0 ? 1600 : 1100
        gain.gain.setValueAtTime(0.0001, when)
        gain.gain.exponentialRampToValueAtTime(0.4, when + 0.002)
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.06)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(when)
        osc.stop(when + 0.08)
      }
    }

    const tick = () => {
      const ctxNow = ctxRef.current
      if (!ctxNow) return
      const elapsed = ctxNow.currentTime - startRef.current
      const phase = ((elapsed % INTERVAL) + INTERVAL) % INTERVAL
      setPulse(Math.max(0, 1 - phase / 0.18))
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
  }

  // Cada espaço marca uma batida; o desvio é a distância até a referência
  // mais próxima, com sinal.
  useEffect(() => {
    if (mode === 'idle') return

    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.code !== 'Enter') return
      event.preventDefault()

      const ctx = ctxRef.current
      if (!ctx) return

      const latency = mode === 'audio' ? ctx.outputLatency || ctx.baseLatency || 0 : 0
      const age = Math.max(0, (performance.now() - event.timeStamp) / 1000)
      const now = ctx.currentTime - latency - age - startRef.current
      if (now < -0.1) return

      const nearest = Math.round(now / INTERVAL) * INTERVAL
      const delta = now - nearest
      if (Math.abs(delta) > INTERVAL / 2.5) return

      setTaps((current) => [...current, delta])
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  const result = median(taps)
  const enough = taps.length >= NEEDED

  const apply = () => {
    // O jogador batendo "atrasado" significa que o estímulo chegou atrasado,
    // então o deslocamento tem o mesmo sinal do desvio medido.
    if (mode === 'audio') updateSettings({ audioOffset: Number(result.toFixed(3)) })
    else updateSettings({ videoOffset: Number(result.toFixed(3)) })
    stop()
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1 className="screen-title">Calibração</h1>
          <p className="screen-subtitle">
            Bata espaço junto com a referência, umas quinze vezes. Vale a mediana, então errar uma
            ou outra não estraga a medida.
          </p>
        </div>
      </header>

      <div className="screen-body">
        <div className="field">
          <span className="field-label">1. Áudio</span>
          <p className="field-hint">
            Ouça o clique e bata junto, sem olhar a tela. Mede o atraso da saída de som — é o que
            desloca o julgamento das notas.
          </p>
          <div className="field-row">
            <button className="btn" onClick={() => void begin('audio')}>
              {mode === 'audio' ? 'Medindo…' : 'Começar'}
            </button>
            <span className="field-value">
              atual: {Math.round(settings.audioOffset * 1000)} ms
            </span>
          </div>
        </div>

        <div className="field">
          <span className="field-label">2. Vídeo</span>
          <p className="field-hint">
            Sem som: bata junto com o pulso na tela. Mede o atraso do display — desloca só o
            desenho das notas, nunca o julgamento.
          </p>
          <div className="field-row">
            <button className="btn" onClick={() => void begin('video')}>
              {mode === 'video' ? 'Medindo…' : 'Começar'}
            </button>
            <span className="field-value">
              atual: {Math.round(settings.videoOffset * 1000)} ms
            </span>
          </div>
        </div>

        {mode !== 'idle' && (
          <>
            <div
              className="calibration-strip"
              style={{ marginTop: 20, boxShadow: `inset 0 0 ${40 * pulse}px rgba(75,123,255,${pulse})` }}
            >
              <div className="calibration-line" />
              <div
                className="calibration-dot"
                style={{
                  left: '50%',
                  transform: `scale(${0.6 + pulse * 1.6})`,
                  opacity: 0.35 + pulse * 0.65,
                }}
              />
            </div>

            <p className="screen-subtitle" style={{ marginTop: 14 }}>
              {taps.length} de {NEEDED} batidas · desvio mediano{' '}
              <b>{Math.round(result * 1000)} ms</b>
            </p>

            <div className="hits">
              {taps.map((t, i) => (
                <span key={i}>{t > 0 ? '+' : ''}{Math.round(t * 1000)}</span>
              ))}
            </div>

            <div className="field-row" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" disabled={!enough} onClick={apply}>
                Aplicar {Math.round(result * 1000)} ms
              </button>
              <button className="btn btn-ghost" onClick={stop}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>

      <footer className="screen-foot">
        <button
          className="btn btn-ghost"
          onClick={() => {
            stop()
            setScreen('menu')
          }}
        >
          ← Voltar
        </button>
      </footer>
    </div>
  )
}
