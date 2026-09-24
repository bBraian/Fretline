/**
 * Guitarras.
 *
 * Cada entrada escolhe uma família de silhueta e um esquema de cores; o
 * modelo 3D é montado a partir disso em `render/guitar/guitarModel.ts`. As
 * famílias são os arquétipos que qualquer um reconhece de longe — corte
 * simples, corte duplo, offset, V — descritos pela forma, não por marca.
 */

import type { BodyShape } from '../render/guitar/shapes'
import type { Localized } from '../i18n'

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
  /** Nome próprio: igual em todo idioma. */
  name: string
  /** O instrumento descrito pela forma e pelas cores, sem marca. */
  brandless: Localized
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
  /**
   * Arquivo glTF/GLB, quando a guitarra vem de fora.
   *
   * Com este campo, o modelo é carregado do arquivo; sem ele, é construído
   * em código a partir de `shape` e `colors`. Os dois caminhos convivem, e
   * nenhuma guitarra existente precisou mudar.
   */
  model?: string
  /** Correções de orientação, quando a normalização automática erra. */
  modelAdjust?: GlbAdjust
}

/**
 * Ajustes de um modelo importado.
 *
 * Mora aqui, junto dos dados que o usam, e não no carregador: assim o
 * carregador continua importando de `content/`, e não o contrário — a
 * direção que o resto do projeto segue.
 */
export interface GlbAdjust {
  /**
   * Giro aplicado **antes** de qualquer medição, em radianos por eixo.
   *
   * Existe para o caso que a detecção de eixo não resolve: quando a caixa
   * do modelo é quase quadrada, "o eixo mais longo é o do braço" não decide
   * nada, e a guitarra sai deitada. Aqui se diz como ela estava.
   */
  preRotate?: [number, number, number]
  /** Vira a guitarra de ponta-cabeça, quando o braço sai para o lado errado. */
  flip?: boolean
  /** Giro em torno do eixo do braço, em radianos: põe o tampo de frente. */
  roll?: number
  /** Multiplica o comprimento final, se 2,5 não ficar bem para este modelo. */
  scale?: number
}

const ROSEWOOD = 0x3a2118
const EBONY = 0x14100e
const MAHOGANY = 0x6b3f2a
const GOLD = 0xd4af37
const CHROME = 0xd4d8de
const BLACK_HW = 0x2a2a30

/**
 * Baixo do palco, e molde do lugar-guardado.
 *
 * Não entra na loja: é o instrumento do baixista, que o jogador não escolhe.
 * Também é o que `buildGuitar` monta enquanto um arquivo `.glb` carrega —
 * uma guitarra construída em código aparece na hora, e a importada a
 * substitui quando chega.
 *
 * O catálogo da loja deixou de ter guitarras construídas em código: todas as
 * que o jogador escolhe vêm de arquivo. O montador procedural continua aqui
 * por causa destes dois usos, e porque é o que torna a espera invisível.
 */
export const BASS_PROP: Guitar = {
  id: 'bass-prop',
  name: 'Baixo',
  brandless: { pt: 'Quatro cordas, escala longa', en: 'Four strings, long scale' },
  unlockAtStars: 0,
  price: 0,
  shape: 'sg',
  colors: {
    body: 0x1a1a1f,
    neck: MAHOGANY,
    fretboard: EBONY,
    hardware: CHROME,
    pickguard: BLACK_HW,
  },
  gloss: 0.85,
  aura: 0.6,
}

/** Catálogo da loja. Preenchido pelos importados, logo abaixo. */
export const GUITARS: Guitar[] = []

/**
 * Guitarras importadas.
 *
 * Ficam depois das construídas em código, e não no lugar delas: ter as duas
 * lado a lado na loja é o que deixa comparar o resultado da importação com
 * o que o projeto já fazia.
 *
 * `shape` e `colors` continuam preenchidos porque o resto do jogo lê esses
 * campos — a bolinha de cor na lista de seleção sai de `colors.body`. Eles
 * não afetam a geometria quando há `model`.
 */
const HALF_TURN = Math.PI

/**
 * A normalização automática acerta a orientação em cerca de dois terços dos
 * arquivos. Os ajustes abaixo cobrem o resto, e saíram de olhar cada uma
 * carregada na prévia — `flip` quando saiu de ponta-cabeça, `roll` quando
 * saiu de costas. É uma linha por modelo, e é mais barato que perseguir uma
 * heurística que acerte sempre.
 */
const IMPORTED: Guitar[] = ([
  // Em ordem de conquista, da mais simples à mais desejada.
  //
  // `colors.body` é a cor que a lista mostra na bolinha e a que a pista
  // empresta; `colors.hardware` e `pickguard` completam a leitura de cada
  // uma. A geometria vem do arquivo — estes campos descrevem o instrumento
  // para o resto do jogo, não o desenham.
  //
  // arquivo, nome, descrição, silhueta, corpo, ferragem, escudo, estrelas, preço, ajuste
  ['electric_guitar', 'Stratos', {
    pt: 'Corte duplo, sunburst marrom com o miolo claro',
    en: 'Double cut, brown sunburst with a light center',
  }, 'super-strat', 0x8a4a22, CHROME, 0xf2e6cf, 0, 0, undefined],
  ['electric_guitar_dragons_v1.2', 'Dragão', {
    pt: 'Corte duplo preto, miolo branco e entalhe no corpo',
    en: 'Black double cut, white center and a carved body',
  }, 'super-strat', 0x15161a, CHROME, 0xf4f4f2, 8, 4000, undefined],
  ['guitar', 'Oficina', {
    pt: 'Chifres duplos em marrom, escudo claro',
    en: 'Brown twin horns, light pickguard',
  }, 'sg', 0x7a3f1d, CHROME, 0xf0e8da, 16, 8000, { flip: false }],
  ['flying-v_electric_guitar', 'Flecha', {
    pt: 'O V preto com filete branco',
    en: 'The black V with white binding',
  }, 'v', 0x121214, CHROME, 0xf5f5f5, 26, 13000, { flip: false, roll: HALF_TURN }],
  ['electric_guitar_explorer', 'Angular XR', {
    pt: 'Corpo angular preto, escudo branco',
    en: 'Black angular body, white pickguard',
  }, 'explorer', 0x141417, CHROME, 0xfafafa, 36, 18000, { roll: HALF_TURN }],
  ['white_electric_guitar', 'Alvorada', {
    pt: 'Branca inteira, da ponta ao headstock',
    en: 'White all over, from the tip to the headstock',
  }, 'offset', 0xf0efec, CHROME, 0xe8e6e1, 48, 24000, undefined],
  ['electric_guitar-1', 'Vanguarda', {
    pt: 'Corte simples preto com ferragem dourada',
    en: 'Black single cut with gold hardware',
  }, 'single-cut', 0x101013, GOLD, 0xc9a227, 60, 32000, undefined],
  ['electric_guitar_lowpoly_model', 'Prisma', {
    pt: 'Feita sob medida: preta com nervuras vermelhas',
    en: 'Made to order: black with red ribs',
  }, 'super-strat', 0x141416, BLACK_HW, 0xb2231f, 75, 42000, { flip: false }],
] as const).map(([file, name, brandless, shape, body, hardware, pickguard, unlockAtStars, price, modelAdjust]) => ({
  id: `glb-${file}`,
  name: name as string,
  brandless: brandless as Localized,
  unlockAtStars,
  price,
  shape: shape as BodyShape,
  colors: {
    body: body as number,
    neck: MAHOGANY,
    fretboard: ROSEWOOD,
    hardware,
    pickguard,
  },
  gloss: 0.9,
  aura: 0.9,
  model: `/models/guitars/${file}.glb`,
  modelAdjust,
}))

GUITARS.push(...IMPORTED)

export function guitarById(id: string): Guitar {
  return GUITARS.find((g) => g.id === id) ?? GUITARS[0]
}
