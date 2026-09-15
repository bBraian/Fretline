/**
 * Guitarras.
 *
 * Mesma ideia do elenco: forma paramétrica em vez de modelo importado. O
 * `shape` decide a silhueta do corpo que `render/guitarModel.ts` extruda.
 */

export type BodyShape = 'single-cut' | 'double-cut' | 'offset' | 'v' | 'explorer'

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
    hardware: number
    pickguard: number
  }
  /** Brilho do verniz, de fosco a espelhado. */
  gloss: number
  /** Intensidade do rastro luminoso no star power. */
  aura: number
}

export const GUITARS: Guitar[] = [
  {
    id: 'ember',
    name: 'Ember 61',
    brandless: 'Corpo maciço, rosnado grosso',
    unlockAtStars: 0,
    price: 0,
    shape: 'single-cut',
    colors: { body: 0x8b1e1e, neck: 0x6b4423, hardware: 0xd9c37a, pickguard: 0x120f0d },
    gloss: 0.75,
    aura: 0.5,
  },
  {
    id: 'saltwater',
    name: 'Saltwater',
    brandless: 'Leve, límpida, teimosa',
    unlockAtStars: 0,
    price: 0,
    shape: 'double-cut',
    colors: { body: 0x2a9d8f, neck: 0xc9a227, hardware: 0xcfd4d8, pickguard: 0xf5f1e6 },
    gloss: 0.6,
    aura: 0.45,
  },
  {
    id: 'nocturne',
    name: 'Nocturne',
    brandless: 'Preta em tudo que dá para pintar',
    unlockAtStars: 5,
    price: 3500,
    shape: 'offset',
    colors: { body: 0x111114, neck: 0x1d1d22, hardware: 0x2e2e36, pickguard: 0x0a0a0c },
    gloss: 0.95,
    aura: 0.7,
  },
  {
    id: 'thunderbird',
    name: 'Thunderbird V',
    brandless: 'Impossível de tocar sentado',
    unlockAtStars: 15,
    price: 8000,
    shape: 'v',
    colors: { body: 0xf7f7f7, neck: 0x3b2a1a, hardware: 0xe8c547, pickguard: 0x111111 },
    gloss: 0.9,
    aura: 0.8,
  },
  {
    id: 'cathedral',
    name: 'Cathedral',
    brandless: 'Madeira que já foi um piano',
    unlockAtStars: 35,
    price: 16000,
    shape: 'explorer',
    colors: { body: 0x4a2c2a, neck: 0x8c6239, hardware: 0xb08d57, pickguard: 0x2b1b1a },
    gloss: 0.55,
    aura: 0.6,
  },
  {
    id: 'supernova',
    name: 'Supernova',
    brandless: 'Acende sozinha no escuro',
    unlockAtStars: 60,
    price: 30000,
    shape: 'double-cut',
    colors: { body: 0x5b21b6, neck: 0x1e1b4b, hardware: 0xe0e7ff, pickguard: 0x312e81 },
    gloss: 1.0,
    aura: 1.0,
  },
]

export function guitarById(id: string): Guitar {
  return GUITARS.find((g) => g.id === id) ?? GUITARS[0]
}
