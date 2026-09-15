/**
 * Elenco.
 *
 * Cada personagem é um conjunto de parâmetros, não um modelo importado. O
 * construtor em `render/character.ts` monta o corpo a partir daqui, então
 * acrescentar alguém ao elenco é acrescentar uma entrada nesta lista — sem
 * pipeline de arte, sem asset para licenciar.
 */

export type BodyBuild = 'slim' | 'regular' | 'heavy'
export type HairStyle = 'long' | 'spiky' | 'mohawk' | 'bald' | 'ponytail' | 'afro'

export interface Character {
  id: string
  name: string
  subtitle: string
  /** Estrelas acumuladas na carreira para liberar; 0 é inicial. */
  unlockAtStars: number
  price: number
  build: BodyBuild
  height: number
  hair: HairStyle
  colors: {
    skin: number
    hair: number
    shirt: number
    pants: number
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
    height: 1.0,
    hair: 'ponytail',
    colors: { skin: 0xc68642, hair: 0x2b1d17, shirt: 0xd91e5a, pants: 0x1b1f2a, accent: 0xffd166 },
    energy: 0.8,
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
    colors: { skin: 0xe0ac69, hair: 0x101014, shirt: 0x1a1a1f, pants: 0x25252e, accent: 0x9b5de5 },
    energy: 0.5,
  },
  {
    id: 'kiko',
    name: 'Kiko Mendes',
    subtitle: 'Palheta de titânio',
    unlockAtStars: 8,
    price: 4000,
    build: 'regular',
    height: 0.98,
    hair: 'spiky',
    colors: { skin: 0x8d5524, hair: 0x1a1a1a, shirt: 0x06d6a0, pants: 0x14161c, accent: 0xffffff },
    energy: 0.95,
  },
  {
    id: 'nadia',
    name: 'Nádia Vox',
    subtitle: 'Fez o amplificador pedir arrego',
    unlockAtStars: 20,
    price: 9000,
    build: 'slim',
    height: 1.02,
    hair: 'mohawk',
    colors: { skin: 0xf1c27d, hair: 0xff3366, shirt: 0x111318, pants: 0x3a1d2e, accent: 0xff3366 },
    energy: 1.0,
  },
  {
    id: 'otto',
    name: 'Otto Ferraz',
    subtitle: 'Toca de terno, sempre',
    unlockAtStars: 40,
    price: 18000,
    build: 'regular',
    height: 1.04,
    hair: 'bald',
    colors: { skin: 0xe0ac69, hair: 0x000000, shirt: 0xf2f2f2, pants: 0x1c1c22, accent: 0xc0a062 },
    energy: 0.35,
  },
  {
    id: 'lupe',
    name: 'Lupe Andrade',
    subtitle: 'Solo de trinta e dois compassos',
    unlockAtStars: 70,
    price: 32000,
    build: 'regular',
    height: 1.0,
    hair: 'afro',
    colors: { skin: 0x7a4a21, hair: 0x241a12, shirt: 0xf4a261, pants: 0x2a2118, accent: 0x2ec4b6 },
    energy: 0.85,
  },
]

export function characterById(id: string): Character {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]
}
