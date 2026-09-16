/**
 * O painel sobre o braço.
 *
 * Fica em DOM, sobreposto ao canvas, e não dentro da cena 3D: texto em WebGL
 * exige atlas de fonte e fica pior em telas de alta densidade, e o navegador
 * já compõe camadas sem custo perceptível.
 *
 * O painel atualiza a quinze quadros por segundo, não a sessenta. Um número
 * de pontuação mudando mais rápido que isso não é legível de qualquer forma,
 * e reconciliar o React a cada quadro roubaria tempo do laço que importa.
 *
 * A disposição segue o original: pontuação à esquerda do braço, medidor de
 * rock à direita, e o veredito logo acima dos botões. O meio da tela fica
 * livre porque é por onde as notas descem.
 */

import type { SessionState } from '../../engine/gameplay/session'
import type { Verdict } from '../../engine/types'
import { RockMeter } from './RockMeter'
import { ScorePanel } from './ScorePanel'

export interface HudProps {
  state: SessionState
  verdict: { verdict: Verdict; delta: number } | null
  songName: string
  artist: string
}

export function Hud({ state, verdict, songName, artist }: HudProps) {
  const accuracy = state.notesSeen > 0 ? state.notesHit / state.notesSeen : 1

  return (
    <div className="hud">
      <div className="hud-song">
        <strong>{songName}</strong>
        <span>{artist}</span>
      </div>

      <div className="hud-left">
        <ScorePanel
          score={state.score}
          multiplier={state.multiplier}
          streak={state.streak}
          starPowerActive={state.starPowerActive}
        />
      </div>

      <div className="hud-right">
        <RockMeter
          value={state.rockMeter}
          starPower={state.starPowerAmount}
          starPowerActive={state.starPowerActive}
        />
        <div className="accuracy-readout">
          {state.notesHit}/{state.notesTotal} · {Math.round(accuracy * 100)}%
        </div>
      </div>

      <div className="hud-bottom">
        <div
          className="verdict"
          data-show={verdict !== null}
          style={{ color: verdictColor(verdict) }}
        >
          {verdict ? verdictLabel(verdict) : ''}
        </div>
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
