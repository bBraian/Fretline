/**
 * Guitarras.
 *
 * Cada entrada escolhe uma família de silhueta e um esquema de cores; o
 * modelo 3D é montado a partir disso em `render/guitar/guitarModel.ts`. As
 * famílias são os arquétipos que qualquer um reconhece de longe — corte
 * simples, corte duplo, offset, V — descritos pela forma, não por marca.
 */

import type { BodyShape } from '../render/guitar/shapes'

export type { BodyShape }

/**
 * Acabamento do corpo.
 *
 * `solid` é cor chapada; `sunburst` é o degradê do miolo claro para a borda
 * escura; `flame` acrescenta as faixas onduladas de um tampo de maple
 * flamejado por cima do degradê.
 */
export type Finish = 'solid' | 'sunburst' | 'flame'

export interface Guitar {
  id: string
  name: string
  brandless: string
  unlockAtStars: number
  price: number
  shape: BodyShape
  /** Padrão: cor chapada. */
  finish?: Finish
  /** Cores do degradê, quando o acabamento não é chapado. */
  burst?: { center: number; middle: number; edge: number }
  colors: {
    body: number
    neck: number
    fretboard: number
    hardware: number
    pickguard: number
  }
  /** Brilho do verniz, de fosco a espelhado. */
  gloss: number
  /** Intensidade do rastro luminoso no star power. */
  aura: number
}

const ROSEWOOD = 0x3a2118
const EBONY = 0x14100e
const MAPLE = 0xc9a86a
const MAHOGANY = 0x6b3f2a
const GOLD = 0xd4af37
const CHROME = 0xd4d8de
const BLACK_HW = 0x2a2a30

export const GUITARS: Guitar[] = [
  {
    id: 'ember',
    name: 'Ember 59',
    brandless: 'Corte simples, tampo flamejado, rosnado grosso',
    unlockAtStars: 0,
    price: 0,
    shape: 'single-cut',
    finish: 'flame',
    burst: { center: 0xf0a24a, middle: 0xd4562a, edge: 0x7a1d18 },
    colors: { body: 0xd4562a, neck: MAHOGANY, fretboard: ROSEWOOD, hardware: CHROME, pickguard: 0xf0ead6 },
    gloss: 0.9,
    aura: 0.5,
  },
  {
    id: 'saltwater',
    name: 'Saltwater',
    brandless: 'Corte duplo, escala clara, alavanca e adesivos de turnê',
    unlockAtStars: 0,
    price: 0,
    shape: 'double-cut',
    colors: { body: 0x1f7f96, neck: MAPLE, fretboard: MAPLE, hardware: CHROME, pickguard: 0xf7f5ef },
    gloss: 0.72,
    aura: 0.45,
  },
  {
    id: 'foreman',
    name: 'Foreman',
    brandless: 'Prancha de trabalho, ponte de chapa',
    unlockAtStars: 2,
    price: 1800,
    shape: 'tele',
    colors: { body: 0xd8a24a, neck: MAPLE, fretboard: MAPLE, hardware: CHROME, pickguard: 0xf5f2e8 },
    gloss: 0.55,
    aura: 0.4,
  },
  {
    id: 'tempest',
    name: 'Tempest',
    brandless: 'Escala curta, escudo largo, feita para garagem',
    unlockAtStars: 4,
    price: 2600,
    shape: 'mustang',
    colors: { body: 0x9e1f3d, neck: MAPLE, fretboard: ROSEWOOD, hardware: CHROME, pickguard: 0xf3e6e2 },
    gloss: 0.78,
    aura: 0.45,
  },
  {
    id: 'nocturne',
    name: 'Nocturne',
    brandless: 'Dois chifres, corpo fino, preta em tudo que dá',
    unlockAtStars: 8,
    price: 4500,
    shape: 'sg',
    colors: { body: 0x111114, neck: 0x1b1b20, fretboard: EBONY, hardware: BLACK_HW, pickguard: 0x0a0a0c },
    gloss: 0.95,
    aura: 0.7,
  },
  {
    id: 'driftwood',
    name: 'Driftwood',
    brandless: 'Contorno deslocado, captadores largos',
    unlockAtStars: 12,
    price: 6500,
    shape: 'offset',
    colors: { body: 0x2f6b4f, neck: MAPLE, fretboard: ROSEWOOD, hardware: CHROME, pickguard: 0xd9cfae },
    gloss: 0.6,
    aura: 0.5,
  },
  {
    id: 'albatross',
    name: 'Albatross',
    brandless: 'Asa varrida, alavanca de mola, branco de palco',
    unlockAtStars: 18,
    price: 9500,
    shape: 'swept-wing',
    colors: { body: 0xf2f0ec, neck: MAHOGANY, fretboard: ROSEWOOD, hardware: CHROME, pickguard: 0xd8c793 },
    gloss: 0.9,
    aura: 0.65,
  },
  {
    id: 'thunderbird',
    name: 'Thunderbird V',
    brandless: 'Duas asas retas, impossível de tocar sentado',
    unlockAtStars: 24,
    price: 12000,
    shape: 'v',
    colors: { body: 0xf7f7f7, neck: MAHOGANY, fretboard: EBONY, hardware: GOLD, pickguard: 0x111111 },
    gloss: 0.92,
    aura: 0.8,
  },
  {
    id: 'cathedral',
    name: 'Cathedral',
    brandless: 'Angular, escudo branco, madeira crua no braço',
    unlockAtStars: 32,
    price: 16000,
    shape: 'explorer',
    colors: { body: 0x0e0e12, neck: 0x8a6b45, fretboard: 0x6b4a2c, hardware: BLACK_HW, pickguard: 0xf4f4f0 },
    gloss: 0.88,
    aura: 0.6,
  },
  {
    id: 'razorwing',
    name: 'Razorwing',
    brandless: 'Chifres afiados, ponte flutuante, feita para correr',
    unlockAtStars: 45,
    price: 22000,
    shape: 'super-strat',
    colors: { body: 0x1a1030, neck: 0x241a12, fretboard: EBONY, hardware: BLACK_HW, pickguard: 0x120c22 },
    gloss: 0.88,
    aura: 0.85,
  },
  {
    id: 'goldtop',
    name: 'Goldtop 57',
    brandless: 'Corte simples, tampo dourado, tudo em ouro',
    unlockAtStars: 60,
    price: 28000,
    shape: 'single-cut',
    colors: { body: 0xc9a227, neck: MAHOGANY, fretboard: ROSEWOOD, hardware: GOLD, pickguard: 0xf0ead6 },
    gloss: 0.98,
    aura: 0.9,
  },
  {
    id: 'supernova',
    name: 'Supernova',
    brandless: 'Corte duplo esticado, acende sozinha no escuro',
    unlockAtStars: 80,
    price: 36000,
    shape: 'super-strat',
    colors: { body: 0x5b21b6, neck: 0x1e1b4b, fretboard: EBONY, hardware: 0xe0e7ff, pickguard: 0x312e81 },
    gloss: 1.0,
    aura: 1.0,
  },
]

export function guitarById(id: string): Guitar {
  return GUITARS.find((g) => g.id === id) ?? GUITARS[0]
}

export const SHAPE_NAMES: Record<BodyShape, string> = {
  'single-cut': 'Corte simples',
  'double-cut': 'Corte duplo',
  sg: 'Chifres duplos',
  tele: 'Prancha',
  offset: 'Contorno deslocado',
  v: 'Formato V',
  explorer: 'Angular',
  'super-strat': 'Corte duplo esticado',
  'swept-wing': 'Asa varrida',
  mustang: 'Escala curta',
}
