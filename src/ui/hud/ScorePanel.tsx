/**
 * Painel de pontuação: mostrador de sete segmentos, multiplicador e corrente.
 *
 * O visor verde imita um display de LED — é a referência do original, e tem
 * uma vantagem prática: dígitos de largura fixa não fazem o número inteiro
 * dançar a cada ponto somado, coisa que uma fonte proporcional faz e cansa a
 * vista no canto do olho.
 *
 * As luzes da lateral são o caminho até o próximo multiplicador, uma por nota
 * da corrente, como no original. Sem elas o multiplicador saltava do nada: o
 * jogador via o 3× virar 4× sem ter visto que estava a duas notas disso.
 */

import { MAX_MULTIPLIER, NOTES_PER_MULTIPLIER_STEP } from '../../engine/gameplay/rules'

export interface ScorePanelProps {
  score: number
  multiplier: number
  streak: number
  starPowerActive: boolean
}

export function ScorePanel({ score, multiplier, streak, starPowerActive }: ScorePanelProps) {
  // Largura fixa de seis dígitos, com zeros à esquerda apagados atrás do
  // número — o mesmo truque de um display de verdade.
  const digits = String(Math.min(999999, score)).padStart(6, '0')
  const firstSignificant = digits.search(/[1-9]/)

  // O degrau sem o dobro do star power: é ele que as luzes contam.
  const step = starPowerActive ? multiplier / 2 : multiplier
  const lit = step >= MAX_MULTIPLIER ? NOTES_PER_MULTIPLIER_STEP : streak % NOTES_PER_MULTIPLIER_STEP

  return (
    <div className="score-panel" data-star={starPowerActive} data-level={step}>
      <div className="streak-lights" aria-hidden>
        {Array.from({ length: NOTES_PER_MULTIPLIER_STEP }, (_, i) => (
          // A primeira luz fica embaixo: a coluna enche de baixo para cima.
          <i key={i} data-on={NOTES_PER_MULTIPLIER_STEP - 1 - i < lit} />
        ))}
      </div>

      <div className="score-main">
        <div className="lcd">
          {[...digits].map((digit, i) => (
            <span key={i} className="lcd-digit" data-off={firstSignificant >= 0 && i < firstSignificant}>
              {digit}
            </span>
          ))}
        </div>

        <div className="score-bottom">
          <div className="multiplier-badge" aria-label={`Multiplicador ${multiplier}×`}>
            <small>×</small>
            <span>{multiplier}</span>
          </div>

          <div className="streak-readout" aria-label={`${streak} notas seguidas`}>
            <span className="streak-note" aria-hidden>
              ♪
            </span>
            <span className="streak-count">{streak}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
