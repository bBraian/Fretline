/**
 * Painel de pontuação: mostrador de sete segmentos, multiplicador e corrente.
 *
 * O visor verde imita um display de LED — é a referência do original, e tem
 * uma vantagem prática: dígitos de largura fixa não fazem o número inteiro
 * dançar a cada ponto somado, coisa que uma fonte proporcional faz e cansa a
 * vista no canto do olho.
 */

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

  return (
    <div className="score-panel" data-star={starPowerActive}>
      <div className="lcd">
        {[...digits].map((digit, i) => (
          <span key={i} className="lcd-digit" data-off={firstSignificant >= 0 && i < firstSignificant}>
            {digit}
          </span>
        ))}
      </div>

      <div className="score-bottom">
        <div className="multiplier-badge" data-star={starPowerActive}>
          <span>{multiplier}</span>
          <small>×</small>
        </div>

        <div className="streak-readout">
          <span className="streak-note" aria-hidden>
            ♪
          </span>
          <span className="streak-count">{streak}</span>
        </div>
      </div>
    </div>
  )
}
