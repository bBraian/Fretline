/**
 * Fundo de todas as telas de menu: a colagem de cartaz do Guitar Hero III.
 *
 * O original é arte desenhada à mão — painéis de tatuagem velha espalhados
 * pela tela, cada um com uma borda de osso, girados fora do esquadro. Aqui
 * não há bitmap nenhum: os painéis são retângulos com preenchimento de
 * `<pattern>`, e os padrões são geométricos, do vocabulário do flash de
 * tatuagem (raios, chamas, estrelas, hachura). Fica um primo abstrato do
 * original, não uma cópia — que é o limite honesto de gerar tudo em código.
 *
 * A lista de painéis é fixa, e não sorteada: um fundo que muda a cada
 * montagem faria a comparação de capturas de tela (`npm run menus`) acusar
 * diferença em toda execução, e a conferência visual deixaria de servir.
 *
 * O desenho todo vive num viewBox de 1280x720 com `slice`, então em telas
 * mais largas ou mais altas a colagem é cortada em vez de esticada.
 *
 * Duas intensidades. O menu principal tem seis palavras na tela e aguenta a
 * colagem no volume cheio; as telas de conteúdo têm listas, números e
 * parágrafos, e ali a mesma colagem vira ruído em cima do texto. `content`
 * afunda a arte e é o padrão para tudo que não seja o menu.
 */

import { memo } from 'react'

type PatternId = 'rays' | 'flames' | 'stars' | 'hatch' | 'bolts' | 'rings'

interface Panel {
  x: number
  y: number
  w: number
  h: number
  /** Giro em graus; o original nunca deixa um painel no esquadro. */
  rotate: number
  pattern: PatternId
}

/**
 * Os painéis cobrem a tela inteira, inclusive o miolo: a vinheta é que
 * apaga o centro para o texto respirar. Deixar o meio vazio produzia um
 * buraco preto no lugar onde a colagem deveria continuar atrás do logo.
 *
 * Sangram para fora das bordas de propósito, e os tamanhos variam bastante
 * — uma grade de painéis do mesmo tamanho lê como azulejo, não como pilha
 * de papel.
 */
const PANELS: Panel[] = [
  // borda de cima
  { x: -46, y: -38, w: 246, h: 196, rotate: -5, pattern: 'rays' },
  { x: 168, y: -54, w: 172, h: 148, rotate: 4, pattern: 'stars' },
  { x: 314, y: -30, w: 232, h: 176, rotate: -2, pattern: 'hatch' },
  { x: 520, y: -58, w: 148, h: 202, rotate: 6, pattern: 'bolts' },
  { x: 652, y: -34, w: 208, h: 142, rotate: -3, pattern: 'flames' },
  { x: 842, y: -50, w: 176, h: 188, rotate: 3, pattern: 'rings' },
  { x: 1002, y: -40, w: 236, h: 164, rotate: -4, pattern: 'stars' },
  { x: 1196, y: -56, w: 152, h: 214, rotate: 5, pattern: 'rays' },

  // faixa do meio, que a vinheta apaga
  { x: -34, y: 132, w: 194, h: 236, rotate: 3, pattern: 'flames' },
  { x: 136, y: 168, w: 154, h: 124, rotate: -6, pattern: 'bolts' },
  { x: 250, y: 118, w: 216, h: 198, rotate: 2, pattern: 'rings' },
  { x: 424, y: 186, w: 132, h: 168, rotate: -4, pattern: 'stars' },
  { x: 534, y: 122, w: 198, h: 156, rotate: 5, pattern: 'hatch' },
  { x: 700, y: 176, w: 164, h: 212, rotate: -2, pattern: 'rays' },
  { x: 828, y: 118, w: 186, h: 142, rotate: 4, pattern: 'bolts' },
  { x: 982, y: 162, w: 148, h: 186, rotate: -5, pattern: 'flames' },
  { x: 1096, y: 112, w: 226, h: 244, rotate: 3, pattern: 'hatch' },
  { x: 380, y: 326, w: 176, h: 148, rotate: -3, pattern: 'flames' },
  { x: 592, y: 318, w: 142, h: 176, rotate: 6, pattern: 'rings' },
  { x: 776, y: 356, w: 196, h: 138, rotate: -4, pattern: 'stars' },
  { x: 150, y: 352, w: 168, h: 158, rotate: 5, pattern: 'bolts' },
  { x: 918, y: 322, w: 156, h: 172, rotate: 2, pattern: 'rays' },

  // borda de baixo
  { x: -40, y: 448, w: 214, h: 214, rotate: -3, pattern: 'rings' },
  { x: 142, y: 494, w: 186, h: 254, rotate: 4, pattern: 'hatch' },
  { x: 296, y: 528, w: 154, h: 216, rotate: -6, pattern: 'stars' },
  { x: 428, y: 502, w: 234, h: 238, rotate: 2, pattern: 'rays' },
  { x: 638, y: 546, w: 168, h: 198, rotate: -4, pattern: 'flames' },
  { x: 788, y: 512, w: 202, h: 232, rotate: 3, pattern: 'bolts' },
  { x: 962, y: 552, w: 148, h: 186, rotate: -5, pattern: 'rings' },
  { x: 1074, y: 488, w: 258, h: 250, rotate: 2, pattern: 'hatch' },
]

const BONE = '#efe0bd'
const INK = '#1a1008'

export interface BackdropProps {
  /** `poster` é o menu principal; `content` é toda tela com texto para ler. */
  variant?: 'poster' | 'content'
}

/**
 * Memorizado: o desenho só depende da variante. As telas por cima dele
 * redesenham a cada item selecionado, e sem isto cada redesenho refazia a
 * comparação de algumas centenas de nós de SVG que nunca mudam.
 */
export const Backdrop = memo(function Backdrop({ variant = 'poster' }: BackdropProps) {
  const poster = variant === 'poster'
  const veil = poster ? 0.42 : 0.88
  return (
    <svg
      className="app-backdrop"
      viewBox="0 0 1280 720"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <PatternDefs />

        {/* Escurece o miolo, que é onde moram o logo e a lista. Sem isto a
            colagem briga com o texto e os dois perdem. */}
        <radialGradient id="gh-vignette" cx="50%" cy="48%" r="82%">
          <stop offset="0%" stopColor="#0d0805" stopOpacity="0.72" />
          <stop offset="40%" stopColor="#0d0805" stopOpacity="0.58" />
          <stop offset="78%" stopColor="#0d0805" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#0d0805" stopOpacity="0.1" />
        </radialGradient>

        <linearGradient id="gh-base" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#3a2614" />
          <stop offset="55%" stopColor="#241608" />
          <stop offset="100%" stopColor="#140c05" />
        </linearGradient>

        {/* Grão de impressão. Uma textura procedural custa um filtro e
            evita um arquivo de ruído no repositório. */}
        <filter id="gh-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" />
          <feColorMatrix type="saturate" values="0" />
        </filter>

        <filter id="gh-panel-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="4" dy="7" stdDeviation="7" floodColor="#000000" floodOpacity="0.72" />
        </filter>
      </defs>

      <rect width="1280" height="720" fill="url(#gh-base)" />

      {PANELS.map((panel, i) => (
        <g
          key={i}
          transform={`rotate(${panel.rotate} ${panel.x + panel.w / 2} ${panel.y + panel.h / 2})`}
          filter="url(#gh-panel-shadow)"
        >
          <rect
            x={panel.x}
            y={panel.y}
            width={panel.w}
            height={panel.h}
            fill={`url(#gh-p-${panel.pattern})`}
            stroke={BONE}
            strokeWidth={7}
          />
          {/* Filete interno escuro: é o que faz a borda de osso ler como
              moldura em vez de contorno. */}
          <rect
            x={panel.x + 7}
            y={panel.y + 7}
            width={panel.w - 14}
            height={panel.h - 14}
            fill="none"
            stroke={INK}
            strokeWidth={2}
            strokeOpacity={0.5}
          />
        </g>
      ))}

      <rect width="1280" height="720" fill="#140c05" opacity={veil} />
      <rect width="1280" height="720" fill="url(#gh-vignette)" />
      <rect
        width="1280"
        height="720"
        filter="url(#gh-grain)"
        opacity={poster ? 0.14 : 0.06}
        style={{ mixBlendMode: 'overlay' }}
      />

      {poster && <Frame />}
    </svg>
  )
})

/**
 * Moldura de cartaz: dois fios de osso em volta da tela e uma voluta em
 * cada canto, espelhada pelos quatro por transformação.
 */
function Frame() {
  return (
    <g>
      <rect
        x={14}
        y={14}
        width={1252}
        height={692}
        fill="none"
        stroke={BONE}
        strokeWidth={5}
        strokeOpacity={0.82}
      />
      <rect
        x={23}
        y={23}
        width={1234}
        height={674}
        fill="none"
        stroke="#8a6a2f"
        strokeWidth={2}
        strokeOpacity={0.9}
      />
      {[
        { t: 'translate(14 14)' },
        { t: 'translate(1266 14) scale(-1 1)' },
        { t: 'translate(14 706) scale(1 -1)' },
        { t: 'translate(1266 706) scale(-1 -1)' },
      ].map((corner, i) => (
        <g key={i} transform={corner.t}>
          <path
            d="M0 74 L0 0 L74 0 L74 9 L9 9 L9 74 Z"
            fill={BONE}
            fillOpacity={0.9}
          />
          <path
            d="M9 30 L9 9 L30 9"
            fill="none"
            stroke="#8a6a2f"
            strokeWidth={3}
          />
        </g>
      ))}
    </g>
  )
}

/**
 * Os seis padrões que preenchem os painéis.
 *
 * Cada um traz a própria cor de fundo, senão a colagem inteira sai na mesma
 * cor e os painéis somem uns nos outros.
 */
function PatternDefs() {
  return (
    <>
      {/* Raios saindo de um ponto — o sunburst do flash de tatuagem. */}
      <pattern id="gh-p-rays" width="120" height="120" patternUnits="userSpaceOnUse">
        <rect width="120" height="120" fill="#6d2f14" />
        {Array.from({ length: 12 }, (_, i) => (
          <path
            key={i}
            d="M60 60 L60 -40 L78 -40 Z"
            fill="#c2601f"
            transform={`rotate(${i * 30} 60 60)`}
          />
        ))}
        <circle cx={60} cy={60} r={13} fill="#efe0bd" fillOpacity={0.55} />
      </pattern>

      {/* Chamas: ondas encaixadas, do escuro para o claro. */}
      <pattern id="gh-p-flames" width="90" height="70" patternUnits="userSpaceOnUse">
        <rect width="90" height="70" fill="#7a3410" />
        <path d="M0 70 C14 44 24 50 32 28 C38 48 50 42 56 22 C64 46 78 40 90 70 Z" fill="#d07621" />
        <path d="M14 70 C24 52 30 56 36 40 C42 56 52 50 58 38 C64 54 74 52 82 70 Z" fill="#f0a63a" />
      </pattern>

      {/* Estrelas de cinco pontas em duas fileiras deslocadas. */}
      <pattern id="gh-p-stars" width="84" height="84" patternUnits="userSpaceOnUse">
        <rect width="84" height="84" fill="#20303c" />
        <path
          d="M21 8 L26 22 L41 22 L29 31 L33 45 L21 36 L9 45 L13 31 L1 22 L16 22 Z"
          fill="#e8d6ae"
          fillOpacity={0.88}
        />
        <path
          d="M63 50 L68 64 L83 64 L71 73 L75 87 L63 78 L51 87 L55 73 L43 64 L58 64 Z"
          fill="#c2a97a"
          fillOpacity={0.7}
        />
      </pattern>

      {/* Hachura dupla, a sombra desenhada a bico de pena. */}
      <pattern id="gh-p-hatch" width="26" height="26" patternUnits="userSpaceOnUse">
        <rect width="26" height="26" fill="#3f2d1a" />
        <path d="M-6 6 L6 -6 M0 26 L26 0 M20 32 L32 20" stroke="#caa24f" strokeWidth={5} />
        <path d="M-6 20 L6 32 M0 0 L26 26" stroke="#7a5a26" strokeWidth={2} strokeOpacity={0.8} />
      </pattern>

      {/* Zigue-zague de relâmpago. */}
      <pattern id="gh-p-bolts" width="76" height="76" patternUnits="userSpaceOnUse">
        <rect width="76" height="76" fill="#4a1c2a" />
        <path d="M44 2 L20 38 L34 38 L26 74 L56 32 L40 32 Z" fill="#f2c94c" fillOpacity={0.92} />
        <path d="M44 2 L20 38 L34 38 L26 74 L56 32 L40 32 Z" fill="none" stroke="#1a1008" strokeWidth={2.5} />
      </pattern>

      {/* Anéis concêntricos, o alvo. */}
      <pattern id="gh-p-rings" width="96" height="96" patternUnits="userSpaceOnUse">
        <rect width="96" height="96" fill="#1f3326" />
        <circle cx={48} cy={48} r={42} fill="none" stroke="#8fae72" strokeWidth={7} strokeOpacity={0.75} />
        <circle cx={48} cy={48} r={27} fill="none" stroke="#d8cfa4" strokeWidth={6} strokeOpacity={0.7} />
        <circle cx={48} cy={48} r={12} fill="#a83224" />
      </pattern>
    </>
  )
}
