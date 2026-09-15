/**
 * O painel sobre o braço.
 *
 * Fica em DOM, sobreposto ao canvas, e não dentro da cena 3D: texto em
 * WebGL exige atlas de fonte e fica pior em telas de alta densidade, e o
 * navegador já compõe camadas sem custo perceptível.
 *
 * O painel atualiza a quinze quadros por segundo, não a sessenta. Um número
 * de pontuação mudando mais rápido que isso não é legível de qualquer forma,
 * e reconciliar o React a cada quadro roubaria tempo do laço que importa.
 */

import type { SessionState } from '../../engine/gameplay/session'
import type { Verdict } from '../../engine/types'

export interface HudProps {
  state: SessionState
  verdict: { verdict: Verdict; delta: number } | null
  songName: string
  artist: string
}

function meterColor(value: number) {
  if (value > 0.6) return 'linear-gradient(180deg, #6ee7a8, #22c55e)'
  if (value > 0.3) return 'linear-gradient(180deg, #ffd166, #f59e0b)'
  return 'linear-gradient(180deg, #ff8fa3, #ef4444)'
}

export function Hud({ state, verdict, songName, artist }: HudProps) {
  const accuracy = state.notesSeen > 0 ? state.notesHit / state.notesSeen : 1

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="score-block">
          <div className="score-value">{state.score.toLocaleString('pt-BR')}</div>
          <div className="score-label">
            {songName} — {artist}
          </div>
        </div>

        <div className="streak-block">
          <div className="multiplier" data-star={state.starPowerActive}>
            {state.multiplier}×
          </div>
          <div className="score-label">
            {state.streak} seguidas · {Math.round(accuracy * 100)}%
          </div>
        </div>
      </div>

      <div />

      <div className="hud-bottom">
        <div className="verdict" data-show={verdict !== null} style={{ color: verdictColor(verdict) }}>
          {verdict ? verdictLabel(verdict) : ''}
        </div>
      </div>

      <div className="rock-meter">
        <div
          className="rock-meter-fill"
          style={{
            height: `${Math.round(state.rockMeter * 100)}%`,
            background: meterColor(state.rockMeter),
          }}
        />
      </div>

      <div className="star-meter" data-active={state.starPowerActive}>
        <div className="star-meter-fill" style={{ height: `${Math.round(state.starPowerAmount * 100)}%` }} />
      </div>
    </div>
  )
}

function verdictLabel(v: { verdict: Verdict; delta: number }) {
  if (v.verdict === 'perfect') return 'no ponto'
  // Mostrar de que lado o jogador errou ensina mais que só dizer "quase".
  return v.delta < 0 ? 'adiantado' : 'atrasado'
}

function verdictColor(v: { verdict: Verdict; delta: number } | null) {
  if (!v) return 'transparent'
  return v.verdict === 'perfect' ? 'var(--good)' : 'var(--text-dim)'
}
