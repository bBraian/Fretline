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

export interface Guitar {
  id: string
  name: string
  brandless: string
  unlockAtStars: number
  price: number
  shape: BodyShape
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
    brandless: 'Corte simples, tampo abaulado, rosnado grosso',
    unlockAtStars: 0,
    price: 0,
    shape: 'single-cut',
    colors: { body: 0x8c1c1c, neck: MAHOGANY, fretboard: ROSEWOOD, hardware: GOLD, pickguard: 0x12100e },
    gloss: 0.85,
    aura: 0.5,
  },
  {
    id: 'saltwater',
    name: 'Saltwater',
    brandless: 'Corte duplo, três captadores, alavanca',
    unlockAtStars: 0,
    price: 0,
    shape: 'double-cut',
    colors: { body: 0x2a7fa8, neck: MAPLE, fretboard: MAPLE, hardware: CHROME, pickguard: 0xf2ece0 },
    gloss: 0.7,
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
    id: 'nocturne',
    name: 'Nocturne',
    brandless: 'Dois chifres, corpo fino, preta em tudo que dá',
    unlockAtStars: 5,
    price: 3500,
    shape: 'sg',
    colors: { body: 0x111114, neck: 0x1b1b20, fretboard: EBONY, hardware: BLACK_HW, pickguard: 0x0a0a0c },
    gloss: 0.95,
    aura: 0.7,
  },
  {
    id: 'driftwood',
    name: 'Driftwood',
    brandless: 'Contorno deslocado, captadores largos',
    unlockAtStars: 10,
    price: 6000,
    shape: 'offset',
    colors: { body: 0x2f6b4f, neck: MAPLE, fretboard: ROSEWOOD, hardware: CHROME, pickguard: 0xd9cfae },
    gloss: 0.6,
    aura: 0.5,
  },
  {
    id: 'thunderbird',
    name: 'Thunderbird V',
    brandless: 'Duas asas retas, impossível de tocar sentado',
    unlockAtStars: 15,
    price: 8000,
    shape: 'v',
    colors: { body: 0xf7f7f7, neck: MAHOGANY, fretboard: EBONY, hardware: GOLD, pickguard: 0x111111 },
    gloss: 0.92,
    aura: 0.8,
  },
  {
    id: 'cathedral',
    name: 'Cathedral',
    brandless: 'Angular, madeira que já foi um piano',
    unlockAtStars: 25,
    price: 12000,
    shape: 'explorer',
    colors: { body: 0x4a2c2a, neck: MAHOGANY, fretboard: ROSEWOOD, hardware: 0xb08d57, pickguard: 0x2b1b1a },
    gloss: 0.55,
    aura: 0.6,
  },
  {
    id: 'razorwing',
    name: 'Razorwing',
    brandless: 'Chifres afiados, ponte flutuante, feita para correr',
    unlockAtStars: 35,
    price: 18000,
    shape: 'super-strat',
    colors: { body: 0x1a1030, neck: 0x241a12, fretboard: EBONY, hardware: BLACK_HW, pickguard: 0x120c22 },
    gloss: 0.88,
    aura: 0.85,
  },
  {
    id: 'goldtop',
    name: 'Goldtop 57',
    brandless: 'Corte simples, tampo dourado, tudo em ouro',
    unlockAtStars: 50,
    price: 26000,
    shape: 'single-cut',
    colors: { body: 0xc9a227, neck: MAHOGANY, fretboard: ROSEWOOD, hardware: GOLD, pickguard: 0xf0ead6 },
    gloss: 0.98,
    aura: 0.9,
  },
  {
    id: 'supernova',
    name: 'Supernova',
    brandless: 'Corte duplo, acende sozinha no escuro',
    unlockAtStars: 70,
    price: 34000,
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
}
