/**
 * Silhuetas de corpo, braço e headstock.
 *
 * Cada família de guitarra é um contorno 2D desenhado em curvas de Bézier,
 * que depois é extrudado e chanfrado. As proporções seguem os arquétipos
 * conhecidos — corte simples, corte duplo, offset, V — sem usar nome nem
 * marca de fabricante nenhum: o que identifica essas guitarras à primeira
 * vista é a silhueta, e é a silhueta que está aqui.
 *
 * Convenção: o corpo fica centrado em (0,0), com +Y apontando para o braço.
 * Uma unidade equivale a mais ou menos 30cm, para que uma guitarra inteira
 * meça por volta de 2,5 unidades da ponta do corpo à do headstock.
 */

import * as THREE from 'three'

export type BodyShape =
  | 'single-cut'
  | 'double-cut'
  | 'sg'
  | 'tele'
  | 'offset'
  | 'v'
  | 'explorer'
  | 'super-strat'

export type HeadstockStyle = 'open-book' | 'inline' | 'pointed'

export type PickupKind = 'humbucker' | 'single' | 'p90'

export interface BodySpec {
  shape: THREE.Shape
  /** Espessura do corpo antes do chanfro. */
  depth: number
  /** Tampo abaulado, como nas de corte simples. */
  carvedTop: boolean
  /** Onde o braço encontra o corpo, em Y. */
  neckJoint: number
  /** Comprimento do braço a partir da junção. */
  neckLength: number
  headstock: HeadstockStyle
  /** Captadores: posição em Y e tipo. */
  pickups: Array<{ y: number; kind: PickupKind; angled?: boolean }>
  /** Potenciômetros: posição em XY. */
  knobs: Array<[number, number]>
  /** Chave seletora: posição em XY e para que lado aponta. */
  selector: [number, number, number]
  /** Ponte com alavanca, em vez de fixa. */
  tremolo: boolean
  /** Escudo cobrindo boa parte do tampo. */
  pickguard: boolean
  /** Filete claro na borda do corpo. */
  binding: boolean
}

/**
 * Constrói um contorno fechado e suave passando por pontos-guia.
 *
 * Desenhar um corpo de guitarra em curvas de Bézier à mão é um exercício de
 * adivinhar pontos de controle: a cintura some, os bojos incham, e cada
 * ajuste estraga o anterior. Com uma spline fechada passando pelos pontos, o
 * que se edita é a própria silhueta — mover um ponto move a borda ali, e só
 * ali. A tensão baixa mantém as curvas cheias sem estufar entre os pontos.
 */
function outline(points: Array<[number, number]>): THREE.Shape {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    true,
    'catmullrom',
    0.4,
  )
  const sampled = curve.getPoints(220).map((p) => new THREE.Vector2(p.x, p.y))
  return new THREE.Shape(sampled)
}

/** Contorno anguloso, sem suavização: as pontas precisam ficar vivas. */
function polygon(points: Array<[number, number]>): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(points[0][0], points[0][1])
  for (const [x, y] of points.slice(1)) shape.lineTo(x, y)
  shape.closePath()
  return shape
}

/**
 * Corte simples: ombro cheio do lado agudo, cintura marcada, bojo inferior
 * largo, e um recorte arredondado do lado grave para alcançar as casas altas.
 */
function singleCut(): THREE.Shape {
  return outline([
    [0.06, 0.60], [0.26, 0.58], [0.40, 0.47], [0.45, 0.30], [0.38, 0.14],
    [0.355, 0.02], [0.42, -0.16], [0.49, -0.38], [0.40, -0.58], [0.20, -0.71],
    [-0.04, -0.735], [-0.26, -0.68], [-0.42, -0.54], [-0.49, -0.32],
    [-0.44, -0.10], [-0.375, 0.04], [-0.40, 0.18], [-0.475, 0.36],
    [-0.47, 0.545], [-0.38, 0.64], [-0.27, 0.62], [-0.215, 0.50],
    [-0.15, 0.43], [-0.06, 0.47], [0.00, 0.545],
  ])
}

/**
 * Corte duplo clássico: dois chifres, o do lado grave mais longo, cintura
 * funda e bojo inferior deslocado — o desenho que virou padrão.
 */
function doubleCut(): THREE.Shape {
  return outline([
    [0.07, 0.50], [0.20, 0.60], [0.34, 0.63], [0.44, 0.52], [0.465, 0.34],
    [0.40, 0.16], [0.365, 0.02], [0.435, -0.18], [0.475, -0.40], [0.36, -0.60],
    [0.14, -0.70], [-0.10, -0.70], [-0.30, -0.60], [-0.44, -0.40],
    [-0.475, -0.16], [-0.42, 0.04], [-0.375, 0.18], [-0.44, 0.40],
    [-0.47, 0.62], [-0.40, 0.76], [-0.28, 0.74], [-0.19, 0.60],
    [-0.13, 0.48], [-0.04, 0.45],
  ])
}

/** Dois chifres compridos e pontudos num corpo fino e quase simétrico. */
function sg(): THREE.Shape {
  return outline([
    [0.00, 0.40], [0.14, 0.58], [0.28, 0.78], [0.385, 0.83], [0.43, 0.70],
    [0.42, 0.46], [0.47, 0.22], [0.475, -0.10], [0.40, -0.40], [0.24, -0.60],
    [0.00, -0.66], [-0.24, -0.60], [-0.40, -0.40], [-0.475, -0.10],
    [-0.47, 0.22], [-0.42, 0.46], [-0.44, 0.74], [-0.375, 0.90],
    [-0.26, 0.86], [-0.13, 0.62],
  ])
}

/** Prancha de corte simples: ombros largos e bojo inferior quase circular. */
function tele(): THREE.Shape {
  return outline([
    [0.08, 0.60], [0.30, 0.575], [0.44, 0.44], [0.475, 0.20], [0.44, 0.02],
    [0.465, -0.20], [0.44, -0.44], [0.28, -0.63], [0.04, -0.70],
    [-0.20, -0.665], [-0.38, -0.52], [-0.465, -0.28], [-0.45, -0.02],
    [-0.42, 0.14], [-0.455, 0.34], [-0.42, 0.52], [-0.30, 0.60],
    [-0.18, 0.56], [-0.10, 0.52], [-0.02, 0.55],
  ])
}

/**
 * Contorno deslocado: os dois bojos não compartilham o mesmo eixo, o que dá
 * a silhueta torta característica desse tipo de corpo.
 */
function offset(): THREE.Shape {
  return outline([
    [0.10, 0.50], [0.25, 0.60], [0.40, 0.56], [0.485, 0.38], [0.47, 0.14],
    [0.395, -0.04], [0.42, -0.24], [0.38, -0.48], [0.22, -0.63], [0.00, -0.665],
    [-0.20, -0.60], [-0.35, -0.44], [-0.42, -0.22], [-0.40, 0.02],
    [-0.40, 0.22], [-0.47, 0.44], [-0.46, 0.68], [-0.36, 0.80],
    [-0.24, 0.74], [-0.14, 0.58], [-0.04, 0.48],
  ])
}

/** Duas asas retas saindo de um vértice. Só linhas, sem curva nenhuma. */
function flyingV(): THREE.Shape {
  return polygon([
    [0.05, 0.50], [0.30, 0.72], [0.66, -0.34], [0.52, -0.70], [0.32, -0.66],
    [0.00, 0.00], [-0.32, -0.66], [-0.52, -0.70], [-0.66, -0.34],
    [-0.30, 0.72], [-0.05, 0.50],
  ])
}

/** Silhueta angular e desequilibrada, com um gancho longo embaixo. */
function explorer(): THREE.Shape {
  return polygon([
    [0.14, 0.76], [0.50, 0.40], [0.44, -0.08], [0.30, -0.70], [0.08, -0.62],
    [0.00, -0.36], [-0.14, -0.72], [-0.44, -0.60], [-0.50, -0.14],
    [-0.26, 0.52], [-0.04, 0.82],
  ])
}

/** Corte duplo esticado, com chifres finos e afiados. */
function superStrat(): THREE.Shape {
  return outline([
    [0.06, 0.46], [0.22, 0.72], [0.38, 0.92], [0.46, 0.80], [0.47, 0.50],
    [0.44, 0.20], [0.375, 0.00], [0.43, -0.22], [0.44, -0.46], [0.30, -0.62],
    [0.06, -0.68], [-0.18, -0.60], [-0.36, -0.42], [-0.455, -0.14],
    [-0.44, 0.14], [-0.39, 0.34], [-0.45, 0.62], [-0.47, 0.94],
    [-0.38, 1.04], [-0.27, 0.90], [-0.16, 0.64], [-0.06, 0.48],
  ])
}

const HUMBUCKER_PAIR: BodySpec['pickups'] = [
  { y: 0.20, kind: 'humbucker' },
  { y: -0.08, kind: 'humbucker' },
]

const SINGLE_TRIO: BodySpec['pickups'] = [
  { y: 0.22, kind: 'single' },
  { y: 0.04, kind: 'single', angled: true },
  { y: -0.14, kind: 'single' },
]

export const BODY_SPECS: Record<BodyShape, BodySpec> = {
  'single-cut': {
    shape: singleCut(),
    depth: 0.16,
    carvedTop: true,
    neckJoint: 0.62,
    neckLength: 1.18,
    headstock: 'open-book',
    pickups: HUMBUCKER_PAIR,
    knobs: [
      [0.24, -0.26],
      [0.40, -0.14],
      [0.16, -0.44],
      [0.34, -0.36],
    ],
    selector: [-0.36, 0.34, 0.5],
    tremolo: false,
    pickguard: false,
    binding: true,
  },
  'double-cut': {
    shape: doubleCut(),
    depth: 0.12,
    carvedTop: false,
    neckJoint: 0.58,
    neckLength: 1.24,
    headstock: 'inline',
    pickups: SINGLE_TRIO,
    knobs: [
      [0.22, -0.30],
      [0.30, -0.42],
      [0.16, -0.46],
    ],
    selector: [0.08, -0.34, -0.6],
    tremolo: true,
    pickguard: true,
    binding: false,
  },
  sg: {
    shape: sg(),
    depth: 0.09,
    carvedTop: false,
    neckJoint: 0.5,
    neckLength: 1.3,
    headstock: 'open-book',
    pickups: HUMBUCKER_PAIR,
    knobs: [
      [0.26, -0.24],
      [0.38, -0.12],
      [0.18, -0.42],
      [0.34, -0.34],
    ],
    selector: [-0.34, 0.3, 0.5],
    tremolo: false,
    pickguard: true,
    binding: false,
  },
  tele: {
    shape: tele(),
    depth: 0.13,
    carvedTop: false,
    neckJoint: 0.58,
    neckLength: 1.24,
    headstock: 'inline',
    pickups: [
      { y: 0.24, kind: 'single' },
      { y: -0.14, kind: 'single', angled: true },
    ],
    knobs: [
      [0.2, -0.36],
      [0.3, -0.46],
    ],
    selector: [0.36, -0.26, -0.5],
    tremolo: false,
    pickguard: true,
    binding: false,
  },
  offset: {
    shape: offset(),
    depth: 0.12,
    carvedTop: false,
    neckJoint: 0.6,
    neckLength: 1.2,
    headstock: 'inline',
    pickups: [
      { y: 0.2, kind: 'p90' },
      { y: -0.1, kind: 'p90' },
    ],
    knobs: [
      [0.26, -0.3],
      [0.36, -0.42],
    ],
    selector: [-0.3, 0.42, 0.4],
    tremolo: true,
    pickguard: true,
    binding: false,
  },
  v: {
    shape: flyingV(),
    depth: 0.12,
    carvedTop: false,
    neckJoint: 0.5,
    neckLength: 1.3,
    headstock: 'pointed',
    pickups: HUMBUCKER_PAIR,
    knobs: [
      [0.3, -0.2],
      [0.38, -0.32],
    ],
    selector: [0.16, -0.06, 0.4],
    tremolo: false,
    pickguard: false,
    binding: false,
  },
  explorer: {
    shape: explorer(),
    depth: 0.13,
    carvedTop: false,
    neckJoint: 0.56,
    neckLength: 1.26,
    headstock: 'pointed',
    pickups: HUMBUCKER_PAIR,
    knobs: [
      [0.3, -0.24],
      [0.38, -0.36],
    ],
    selector: [0.12, -0.08, 0.4],
    tremolo: false,
    pickguard: false,
    binding: false,
  },
  'super-strat': {
    shape: superStrat(),
    depth: 0.11,
    carvedTop: false,
    neckJoint: 0.54,
    neckLength: 1.3,
    headstock: 'pointed',
    pickups: [
      { y: 0.2, kind: 'single' },
      { y: -0.08, kind: 'humbucker' },
    ],
    knobs: [[0.3, -0.34]],
    selector: [0.12, -0.46, -0.6],
    tremolo: true,
    pickguard: false,
    binding: false,
  },
}

/** Contorno do headstock, em coordenadas locais com +Y para a ponta. */
export function headstockShape(style: HeadstockStyle): THREE.Shape {
  const s = new THREE.Shape()

  if (style === 'open-book') {
    // Duas abas simétricas com um entalhe no meio da ponta.
    s.moveTo(-0.11, 0)
    s.lineTo(-0.13, 0.22)
    s.bezierCurveTo(-0.15, 0.34, -0.09, 0.40, -0.04, 0.34)
    s.bezierCurveTo(-0.02, 0.30, 0.02, 0.30, 0.04, 0.34)
    s.bezierCurveTo(0.09, 0.40, 0.15, 0.34, 0.13, 0.22)
    s.lineTo(0.11, 0)
    s.closePath()
  } else if (style === 'inline') {
    // Pá larga de um lado só, com as seis tarraxas alinhadas.
    s.moveTo(-0.09, 0)
    s.lineTo(-0.12, 0.30)
    s.bezierCurveTo(-0.13, 0.44, -0.04, 0.50, 0.03, 0.44)
    s.bezierCurveTo(0.10, 0.38, 0.11, 0.24, 0.10, 0.12)
    s.lineTo(0.09, 0)
    s.closePath()
  } else {
    // Ponta única inclinada, o formato das guitarras de metal.
    s.moveTo(-0.10, 0)
    s.lineTo(-0.12, 0.26)
    s.lineTo(0.02, 0.46)
    s.lineTo(0.11, 0.20)
    s.lineTo(0.10, 0)
    s.closePath()
  }

  return s
}

/**
 * Posições das tarraxas no headstock. Três de cada lado no formato de abas,
 * seis em linha nos outros dois.
 */
export function tunerPositions(style: HeadstockStyle): Array<[number, number]> {
  if (style === 'open-book') {
    return [
      [-0.14, 0.08],
      [-0.15, 0.18],
      [-0.16, 0.28],
      [0.14, 0.08],
      [0.15, 0.18],
      [0.16, 0.28],
    ]
  }
  return [
    [-0.13, 0.06],
    [-0.14, 0.14],
    [-0.15, 0.22],
    [-0.15, 0.30],
    [-0.14, 0.38],
    [-0.12, 0.45],
  ]
}
