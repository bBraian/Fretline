/**
 * Elenco.
 *
 * Cada personagem é um conjunto de parâmetros — proporções, cores, roupa,
 * cabelo, acessórios — e o modelo 3D é montado a partir disso em
 * `render/character/characterModel.ts`.
 *
 * Continua sem modelo importado por uma razão concreta: os integrantes são
 * animados por um esqueleto escrito à mão, e um modelo baixado ou gerado
 * viria sem esqueleto — seria uma estátua. Acrescentar alguém ao elenco é
 * acrescentar uma entrada nesta lista.
 */

export type BodyBuild = 'slim' | 'regular' | 'heavy'

export type HairStyle =
  | 'long'
  | 'spiky'
  | 'mohawk'
  | 'bald'
  | 'ponytail'
  | 'afro'
  | 'buzz'
  | 'bob'
  | 'dreads'

export type OutfitTop = 'tee' | 'tank' | 'jacket' | 'vest' | 'shirt'
export type OutfitLegs = 'jeans' | 'leather' | 'cargo' | 'skirt'
export type Footwear = 'boots' | 'sneakers' | 'dress'

export interface Character {
  id: string
  name: string
  subtitle: string
  /** Estrelas acumuladas na carreira para liberar; 0 é inicial. */
  unlockAtStars: number
  price: number
  build: BodyBuild
  /** Multiplicador de altura em cima de 1,75m. */
  height: number
  hair: HairStyle
  /** Barba, de 0 (nada) a 1 (cheia). */
  beard: number
  top: OutfitTop
  legs: OutfitLegs
  shoes: Footwear
  accessories: {
    sunglasses: boolean
    wristband: boolean
    beanie: boolean
    belt: boolean
  }
  colors: {
    skin: number
    hair: number
    top: number
    topTrim: number
    legs: number
    shoes: number
    accent: number
  }
  /** Quanto o personagem se mexe tocando, de 0 a 1. */
  energy: number
}

export const CHARACTERS: Character[] = [
  {
    id: 'vega',
    name: 'Vega Cruz',
    subtitle: 'A caçula do bairro',
    unlockAtStars: 0,
    price: 0,
    build: 'slim',
    height: 0.97,
    hair: 'ponytail',
    beard: 0,
    top: 'tank',
    legs: 'jeans',
    shoes: 'sneakers',
    accessories: { sunglasses: false, wristband: true, beanie: false, belt: true },
    colors: {
      skin: 0xc68642,
      hair: 0x2b1d17,
      top: 0xd91e5a,
      topTrim: 0xffd166,
      legs: 0x243049,
      shoes: 0xf2f2f2,
      accent: 0xffd166,
    },
    energy: 0.85,
  },
  {
    id: 'grim',
    name: 'Grim Halvard',
    subtitle: 'Veterano de mil galpões',
    unlockAtStars: 0,
    price: 0,
    build: 'heavy',
    height: 1.08,
    hair: 'long',
    beard: 0.9,
    top: 'vest',
    legs: 'leather',
    shoes: 'boots',
    accessories: { sunglasses: false, wristband: true, beanie: false, belt: true },
    colors: {
      skin: 0xe0ac69,
      hair: 0x14141a,
      top: 0x1a1a1f,
      topTrim: 0x55505a,
      legs: 0x1c1c22,
      shoes: 0x14110e,
      accent: 0x9b5de5,
    },
    energy: 0.5,
  },
  {
    id: 'kiko',
    name: 'Kiko Mendes',
    subtitle: 'Palheta de titânio',
    unlockAtStars: 4,
    price: 2500,
    build: 'regular',
    height: 0.99,
    hair: 'spiky',
    beard: 0.2,
    top: 'tee',
    legs: 'cargo',
    shoes: 'sneakers',
    accessories: { sunglasses: true, wristband: false, beanie: false, belt: false },
    colors: {
      skin: 0x8d5524,
      hair: 0x1a1a1a,
      top: 0x06d6a0,
      topTrim: 0xffffff,
      legs: 0x2f3438,
      shoes: 0xe63946,
      accent: 0xffffff,
    },
    energy: 0.95,
  },
  {
    id: 'nadia',
    name: 'Nádia Vox',
    subtitle: 'Fez o amplificador pedir arrego',
    unlockAtStars: 12,
    price: 7000,
    build: 'slim',
    height: 1.02,
    hair: 'mohawk',
    beard: 0,
    top: 'jacket',
    legs: 'leather',
    shoes: 'boots',
    accessories: { sunglasses: true, wristband: true, beanie: false, belt: true },
    colors: {
      skin: 0xf1c27d,
      hair: 0xff3366,
      top: 0x15171d,
      topTrim: 0xff3366,
      legs: 0x24141d,
      shoes: 0x0f0f12,
      accent: 0xff3366,
    },
    energy: 1.0,
  },
  {
    id: 'otto',
    name: 'Otto Ferraz',
    subtitle: 'Toca de terno, sempre',
    unlockAtStars: 24,
    price: 13000,
    build: 'regular',
    height: 1.05,
    hair: 'bald',
    beard: 0.35,
    top: 'shirt',
    legs: 'jeans',
    shoes: 'dress',
    accessories: { sunglasses: true, wristband: false, beanie: false, belt: true },
    colors: {
      skin: 0xe0ac69,
      hair: 0x2b2b2b,
      top: 0xf2f2f2,
      topTrim: 0x1c1c22,
      legs: 0x1c1c22,
      shoes: 0x14110e,
      accent: 0xc0a062,
    },
    energy: 0.35,
  },
  {
    id: 'lupe',
    name: 'Lupe Andrade',
    subtitle: 'Solo de trinta e dois compassos',
    unlockAtStars: 38,
    price: 20000,
    build: 'regular',
    height: 1.0,
    hair: 'afro',
    beard: 0.3,
    top: 'shirt',
    legs: 'jeans',
    shoes: 'boots',
    accessories: { sunglasses: false, wristband: true, beanie: false, belt: true },
    colors: {
      skin: 0x7a4a21,
      hair: 0x241a12,
      top: 0xf4a261,
      topTrim: 0x2a2118,
      legs: 0x3a4a63,
      shoes: 0x4a2f1c,
      accent: 0x2ec4b6,
    },
    energy: 0.85,
  },
  {
    id: 'stig',
    name: 'Stig Halloran',
    subtitle: 'Nunca tirou o gorro no palco',
    unlockAtStars: 55,
    price: 27000,
    build: 'slim',
    height: 1.03,
    hair: 'buzz',
    beard: 0.55,
    top: 'jacket',
    legs: 'cargo',
    shoes: 'boots',
    accessories: { sunglasses: false, wristband: false, beanie: true, belt: false },
    colors: {
      skin: 0xf1c27d,
      hair: 0x6b4a2a,
      top: 0x2f4858,
      topTrim: 0x86bbd8,
      legs: 0x33425b,
      shoes: 0x241c18,
      accent: 0x86bbd8,
    },
    energy: 0.65,
  },
  {
    id: 'rhea',
    name: 'Rhea Kastro',
    subtitle: 'Aprendeu tocando em cima de disco riscado',
    unlockAtStars: 75,
    price: 36000,
    build: 'heavy',
    height: 1.0,
    hair: 'dreads',
    beard: 0,
    top: 'tee',
    legs: 'skirt',
    shoes: 'boots',
    accessories: { sunglasses: true, wristband: true, beanie: false, belt: true },
    colors: {
      skin: 0x5c3317,
      hair: 0x1b1310,
      top: 0x6a0572,
      topTrim: 0xf9c80e,
      legs: 0x1a1a22,
      shoes: 0x120f12,
      accent: 0xf9c80e,
    },
    energy: 0.9,
  },
]

export function characterById(id: string): Character {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]
}

export const BUILD_NAMES: Record<BodyBuild, string> = {
  slim: 'Magro',
  regular: 'Médio',
  heavy: 'Encorpado',
}
