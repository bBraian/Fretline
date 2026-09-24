/**
 * O medidor de rock: um mostrador de meia-lua com ponteiro, e as válvulas do
 * star power em leque por cima dele.
 *
 * É desenhado em SVG, não em WebGL. O mostrador precisa de traços finos,
 * texto pequeno e legível e um ponteiro que não tremule — coisas que vetor
 * resolve de graça em qualquer densidade de tela, e que em 3D exigiriam
 * atlas de fonte e antisserrilhado próprio.
 *
 * O arco vai do vermelho ao verde passando pelo amarelo, como no original: a
 * posição do ponteiro diz sozinha se a música está indo bem, sem precisar de
 * número nenhum.
 *
 * **O star power são quatro válvulas, não um arco.** Antes era um arco por
 * fora do mostrador, e ele se soltava do desenho: passando da metade, o
 * caminho SVG pedia o "arco grande" entre dois pontos que distam menos de
 * meia volta, e o navegador — que precisa de *algum* círculo por eles —
 * desenhava o arco em volta de outro centro, longe do mostrador. Válvulas
 * também leem melhor as regras: cada trecho de star power completo acende
 * uma, e com duas acesas dá para ativar.
 */

import { STAR_POWER_ACTIVATION_MINIMUM, STAR_POWER_PER_PHRASE } from '../../engine/gameplay/rules'
import { useT } from '../useT'

const CENTER = { x: 80, y: 96 }
const RADIUS = 52
const START_ANGLE = 180
const SWEEP = 180

/** Uma válvula por trecho de star power: o medidor cheio são quatro. */
const TUBES = Math.round(1 / STAR_POWER_PER_PHRASE)
/** Inclinação de cada válvula a partir da vertical, em graus. */
const TUBE_ANGLES = Array.from({ length: TUBES }, (_, i) => -48 + (96 / (TUBES - 1)) * i)
const TUBE_BASE = RADIUS + 11
/** Altura útil do vidro, onde o brilho sobe. */
const TUBE_GLASS = 21

/** Ponto na circunferência do mostrador, em graus a partir da esquerda. */
function polar(angleDegrees: number, radius: number) {
  const radians = (angleDegrees * Math.PI) / 180
  return {
    x: CENTER.x + Math.cos(radians) * radius,
    y: CENTER.y + Math.sin(radians) * radius,
  }
}

/**
 * Caminho de um pedaço de arco, de `from` a `to` em fração do mostrador.
 *
 * A bandeira de arco grande vale para mais de meia volta *de círculo*, não
 * de mostrador — que só tem meia volta. Com o limite errado, o SVG escolhe o
 * outro dos dois círculos possíveis e o arco sai do lugar.
 */
function arc(from: number, to: number, radius: number) {
  const a = polar(START_ANGLE + from * SWEEP, radius)
  const b = polar(START_ANGLE + to * SWEEP, radius)
  const large = (to - from) * SWEEP > 180 ? 1 : 0
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
  const needle = polar(START_ANGLE + value * SWEEP, RADIUS - 11)
  const base = polar(START_ANGLE + value * SWEEP + 90, 6)
  const baseOpposite = polar(START_ANGLE + value * SWEEP - 90, 6)
  const ready = !starPowerActive && starPower >= STAR_POWER_ACTIVATION_MINIMUM
  const t = useT()

  return (
    <div
      className="rock-dial"
      data-danger={value < 0.25}
      data-star={starPowerActive}
      data-ready={ready}
    >
      <svg
        viewBox="0 0 160 124"
        role="img"
        aria-label={t.hud.rockMeter(Math.round(value * 100), Math.round(starPower * 100))}
      >
        {/* As válvulas do star power, em leque sobre o mostrador. */}
        {TUBE_ANGLES.map((angle, i) => {
          const fill = Math.min(1, Math.max(0, starPower * TUBES - i))
          const radians = (angle * Math.PI) / 180
          const x = CENTER.x + Math.sin(radians) * TUBE_BASE
          const y = CENTER.y - Math.cos(radians) * TUBE_BASE
          const glow = fill * TUBE_GLASS
          return (
            <g
              key={i}
              className="sp-tube"
              data-lit={fill >= 1}
              transform={`translate(${x} ${y}) rotate(${angle})`}
            >
              <rect x={-6} y={-TUBE_GLASS - 7} width={12} height={TUBE_GLASS + 4} rx={6} className="sp-glass" />
              {glow > 0.3 && (
                <rect
                  x={-4}
                  y={-3 - glow}
                  width={8}
                  height={glow}
                  rx={Math.min(4, glow / 2)}
                  className="sp-glow"
                />
              )}
              <line x1={0} y1={-6} x2={0} y2={-TUBE_GLASS + 1} className="sp-filament" />
              <rect x={-7.5} y={-4} width={15} height={7} rx={1.5} className="sp-socket" />
            </g>
          )
        })}

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

        {/* A altura sobra abaixo do eixo de propósito: é onde o rótulo cabe
            sem o ponteiro passar por cima dele. */}
        <text x={CENTER.x} y={CENTER.y + 24} className="dial-label">
          ROCK
        </text>
      </svg>
    </div>
  )
}
