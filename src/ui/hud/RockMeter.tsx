/**
 * O medidor de rock: um mostrador de meia-lua com ponteiro.
 *
 * É desenhado em SVG, não em WebGL. O mostrador precisa de traços finos,
 * texto pequeno e legível e um ponteiro que não tremule — coisas que vetor
 * resolve de graça em qualquer densidade de tela, e que em 3D exigiriam
 * atlas de fonte e antisserrilhado próprio.
 *
 * O arco vai do vermelho ao verde passando pelo amarelo, como no original: a
 * posição do ponteiro diz sozinha se a música está indo bem, sem precisar de
 * número nenhum.
 */

const RADIUS = 58
const CENTER = { x: 70, y: 70 }
const START_ANGLE = 180
const SWEEP = 180

/** Ponto na circunferência do mostrador, em graus a partir da esquerda. */
function polar(angleDegrees: number, radius: number) {
  const radians = (angleDegrees * Math.PI) / 180
  return {
    x: CENTER.x + Math.cos(radians) * radius,
    y: CENTER.y + Math.sin(radians) * radius,
  }
}

/** Caminho de um pedaço de arco, de `from` a `to` em fração do mostrador. */
function arc(from: number, to: number, radius: number) {
  const a = polar(START_ANGLE + from * SWEEP, radius)
  const b = polar(START_ANGLE + to * SWEEP, radius)
  const large = to - from > 0.5 ? 1 : 0
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`
}

export interface RockMeterProps {
  /** Nível do medidor, de 0 a 1. */
  value: number
  /** Carga de star power, de 0 a 1. */
  starPower: number
  starPowerActive: boolean
}

export function RockMeter({ value, starPower, starPowerActive }: RockMeterProps) {
  const needle = polar(START_ANGLE + value * SWEEP, RADIUS - 12)
  const base = polar(START_ANGLE + value * SWEEP + 90, 6)
  const baseOpposite = polar(START_ANGLE + value * SWEEP - 90, 6)

  return (
    <div className="rock-dial" data-danger={value < 0.25} data-star={starPowerActive}>
      {/* A altura sobra abaixo do eixo de propósito: é onde o rótulo cabe
          sem o ponteiro passar por cima dele. */}
      <svg viewBox="0 0 140 98" role="img" aria-label={`Medidor de rock em ${Math.round(value * 100)}%`}>
        {/* Arco do star power, por fora do mostrador. */}
        <path d={arc(0, 1, RADIUS + 9)} className="dial-track" />
        {starPower > 0 && (
          <path d={arc(0, Math.max(0.001, starPower), RADIUS + 9)} className="dial-star" />
        )}

        {/* Faixas do medidor. */}
        <path d={arc(0, 0.28, RADIUS)} className="dial-zone dial-red" />
        <path d={arc(0.28, 0.58, RADIUS)} className="dial-zone dial-yellow" />
        <path d={arc(0.58, 1, RADIUS)} className="dial-zone dial-green" />

        {/* Marcas a cada oitavo. */}
        {Array.from({ length: 9 }, (_, i) => {
          const outer = polar(START_ANGLE + (i / 8) * SWEEP, RADIUS - 5)
          const inner = polar(START_ANGLE + (i / 8) * SWEEP, RADIUS - (i % 2 === 0 ? 14 : 10))
          return (
            <line
              key={i}
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              className="dial-tick"
            />
          )
        })}

        {/* Ponteiro: um triângulo fino a partir do eixo. */}
        <polygon
          points={`${needle.x},${needle.y} ${base.x},${base.y} ${baseOpposite.x},${baseOpposite.y}`}
          className="dial-needle"
        />
        <circle cx={CENTER.x} cy={CENTER.y} r="7" className="dial-hub" />

        <text x={CENTER.x} y={CENTER.y + 24} className="dial-label">
          ROCK
        </text>
      </svg>
    </div>
  )
}
