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
  /** Liso e comprido, repartido no meio, caindo sobre o rosto. */
  | 'curtain'
  /** Cachos volumosos que descem até o ombro. */
  | 'curls'

export type OutfitTop = 'tee' | 'tank' | 'jacket' | 'vest' | 'shirt' | 'bra'
export type OutfitLegs = 'jeans' | 'leather' | 'cargo' | 'skirt'
export type Footwear = 'boots' | 'sneakers' | 'dress'

export interface Character {
  id: string
  name: string
  subtitle: string
  /** Estrelas acumuladas na carreira para liberar; 0 é inicial. */
  unlockAtStars: number
  price: number
  /**
   * Fora da loja, mas dentro do elenco.
   *
   * As marionetes construídas em código saíram da vitrine quando entraram
   * modelos importados para todos os lugares — mas elas **não** foram
   * apagadas, porque o resto do jogo depende delas: são o molde de onde os
   * importados copiam cor e energia, são a reserva de `characterById`
   * quando um perfil salvo aponta para alguém que não existe mais, e são os
   * três integrantes que enchem o palco atrás do jogador.
   */
  hidden?: boolean
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
    /** Cartola, com fita e fivelas. */
    topHat?: boolean
    /** Gargantilha com pingente. */
    choker?: boolean
    /** Faixa no braço, acima do cotovelo. */
    armband?: boolean
    /** Meia-luva comprida, cobrindo o antebraço. */
    armWarmer?: boolean
    /** Fileira de tachas no cinto. */
    studs?: boolean
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
  /**
   * Arquivo glTF/GLB, quando o integrante vem de fora.
   *
   * Com este campo, o modelo é carregado do arquivo; sem ele, é montado em
   * código a partir dos parâmetros acima.
   */
  model?: string
  /**
   * Falso quando o arquivo veio sem esqueleto.
   *
   * Sem ossos não há o que a cinemática inversa mova: o integrante aparece,
   * mas fica parado. É o caso que o README sempre descreveu — modelo
   * importado sem rig é uma estátua.
   */
  animated?: boolean
  /** Correções de pose, quando a normalização automática não basta. */
  modelAdjust?: { turn?: number; scale?: number }
}

export const CHARACTERS: Character[] = [
  {
    id: 'rane',
    hidden: true,
    name: 'Rane Kowalczyk',
    subtitle: 'Franzino, e ninguém aguenta o ritmo dele',
    unlockAtStars: 0,
    price: 0,
    build: 'slim',
    height: 1.03,
    hair: 'curtain',
    beard: 0,
    top: 'tank',
    legs: 'jeans',
    shoes: 'sneakers',
    accessories: {
      sunglasses: false,
      wristband: false,
      beanie: false,
      belt: true,
      studs: true,
      armWarmer: true,
    },
    colors: {
      skin: 0xe8c9a8,
      hair: 0xa8541f,
      top: 0x1d1d20,
      topTrim: 0x3a3a40,
      legs: 0x4a5160,
      shoes: 0x141418,
      accent: 0x8a8f9a,
    },
    energy: 0.9,
  },
  {
    id: 'valdo',
    hidden: true,
    name: 'Valdo Serra',
    subtitle: 'Cartola, cachos e um solo que não acaba',
    unlockAtStars: 0,
    price: 0,
    build: 'slim',
    height: 1.05,
    hair: 'curls',
    beard: 0,
    top: 'jacket',
    legs: 'jeans',
    shoes: 'sneakers',
    accessories: {
      sunglasses: false,
      wristband: false,
      beanie: false,
      belt: true,
      topHat: true,
    },
    colors: {
      skin: 0xc68642,
      hair: 0x14100e,
      top: 0x23242a,
      topTrim: 0x3c3e46,
      legs: 0x2a2730,
      shoes: 0x6a6a70,
      accent: 0xb9a24a,
    },
    energy: 0.7,
  },
  {
    id: 'skarlet',
    hidden: true,
    name: 'Skarlet Vey',
    subtitle: 'Toca descalça quando o palco deixa',
    unlockAtStars: 3,
    price: 2000,
    build: 'slim',
    height: 0.99,
    hair: 'curtain',
    beard: 0,
    top: 'bra',
    legs: 'jeans',
    shoes: 'boots',
    accessories: {
      sunglasses: false,
      wristband: true,
      beanie: false,
      belt: true,
      studs: true,
      choker: true,
      armband: true,
    },
    colors: {
      skin: 0xf0d5b8,
      // Loiro acinzentado, não platinado: contra pele clara, um loiro muito
      // claro desaparece e o personagem parece careca.
      hair: 0xb09a72,
      top: 0x2a2d33,
      topTrim: 0x3a3e46,
      legs: 0x2e3138,
      shoes: 0x14141a,
      accent: 0x8f95a2,
    },
    energy: 0.95,
  },
]

/**
 * Integrantes importados de arquivo.
 *
 * Os campos de aparência (`build`, `hair`, `top`, `colors`) continuam
 * preenchidos porque o resto do jogo os lê — a bolinha de cor da lista sai
 * de `colors.top`, e o texto da loja usa `build`. Eles não afetam o que
 * aparece na tela quando há `model`.
 *
 * `animated: false` marca quem veio sem esqueleto. Esses carregam e
 * aparecem, mas ficam parados: sem ossos, não há o que a cinemática inversa
 * mova, e o README sempre avisou que um modelo sem rig é uma estátua.
 */
const IMPORTED: Character[] = ([
  // Em ordem de conquista, do primeiro ao mais raro — a mesma ordem em que
  // a loja os mostra, porque a lista é lida de cima para baixo e uma ordem
  // que não é a da progressão faz o preço parecer aleatório.
  //
  // arquivo, nome, descrição, estrelas, preço, tem esqueleto, giro
  ['douxie_tales_of_arcadia', 'Douglas', 'Jaqueta, franja e um alaúde antigo', 0, 0, true, undefined],
  // Sem esqueleto no arquivo — ver `animated` acima. Fica barato de propósito:
  // um integrante que não toca não serve de recompensa de fim de carreira.
  ['steven_rogers_captain_america', 'Estevão Rodrigues', 'Escudo nas costas, pose de estátua', 4, 2500, false, undefined],
  ['fortnite_darth_vader_advanced_rig', 'Dartes Vale', 'Capa preta e um riff que respira', 6, 3500, true, undefined],
  ['dead_pool', 'Vermelhão', 'Fala demais entre uma música e outra', 10, 5000, true, undefined],
  ['kratos', 'Kairos', 'Barba de cinzas, olhar de quem já viu pior', 14, 7000, true, undefined],
  ['lara_croft_-_shorts_style', 'Lara Cruz', 'Aprendeu os acordes numa tumba', 18, 8500, true, undefined],
  ['spiderman_brand_new_day_from_fortnite', 'Teixeira', 'Sobe na caixa de som todo show', 26, 12500, true, undefined],
  ['soldier_boy', 'Soldado Bené', 'Toca marcha e chama de rock', 30, 14500, true, undefined],
  ['goku', 'Gokê Ramos', 'Cabelo em pé desde o primeiro acorde', 34, 17000, true, undefined],
] as const).map(([file, name, subtitle, unlockAtStars, price, animated, turn]) => ({
  id: `glb-${file}`,
  name: name as string,
  subtitle: subtitle as string,
  unlockAtStars,
  price,
  build: 'regular' as BodyBuild,
  height: 1,
  hair: 'buzz' as HairStyle,
  beard: 0,
  top: 'tee' as OutfitTop,
  legs: 'jeans' as OutfitLegs,
  shoes: 'boots' as Footwear,
  accessories: { sunglasses: false, wristband: false, beanie: false, belt: false },
  colors: CHARACTERS[0].colors,
  energy: CHARACTERS[0].energy,
  model: `/models/characters/${file}.glb`,
  animated,
  modelAdjust: turn ? { turn } : undefined,
}))

CHARACTERS.push(...IMPORTED)

/**
 * O que a loja mostra: todo mundo menos as marionetes de reserva.
 *
 * O primeiro da lista é com quem o jogo começa — sai de graça e já
 * equipado, ver `DEFAULT_PROFILE` em `ui/store.ts`.
 */
export const SHOP_CHARACTERS: Character[] = CHARACTERS.filter((c) => !c.hidden)

export function characterById(id: string): Character {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]
}

export const BUILD_NAMES: Record<BodyBuild, string> = {
  slim: 'Magro',
  regular: 'Médio',
  heavy: 'Encorpado',
}
