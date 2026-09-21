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
  brandless: 'Quatro cordas, escala longa',
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
  // arquivo, nome, descrição, silhueta, cor da bolinha, estrelas, preço, ajuste
  ['electric_guitar', 'Stratos', 'Corte duplo clássico, três captadores', 'super-strat', 0xd8d3c8, 0, 0, undefined],
  ['white_electric_guitar', 'Alvorada', 'Branca inteira, escudo claro', 'offset', 0xe8e6e1, 5, 3000, undefined],
  ['electric_guitar-1', 'Vanguarda', 'Tampo trabalhado, ferragem escura', 'double-cut', 0x8c3b2a, 12, 6500, undefined],
  ['guitar', 'Oficina', 'Madeira à mostra, ferragem cromada', 'single-cut', 0x7a4a24, 20, 9500, { flip: false }],
  ['electric_guitar_explorer', 'Angular XR', 'Corpo angular, atitude de arena', 'explorer', 0x2f2f33, 30, 14000, { roll: HALF_TURN }],
  ['electric_guitar_lowpoly_model', 'Prisma', 'Poucas faces, silhueta limpa', 'tele', 0xc2a15a, 42, 18000, { flip: false }],
  ['flying-v_electric_guitar', 'Flecha', 'O V de sempre, sem meio-termo', 'v', 0x9b1c1c, 55, 24000, { flip: false, roll: HALF_TURN }],
  ['electric_guitar_dragons_v1.2', 'Dragão', 'Entalhe de dragão no corpo inteiro', 'single-cut', 0x6b2f1e, 70, 32000, undefined],
] as const).map(([file, name, brandless, shape, body, unlockAtStars, price, modelAdjust]) => ({
  id: `glb-${file}`,
  name: name as string,
  brandless: brandless as string,
  unlockAtStars,
  price,
  shape: shape as BodyShape,
  colors: {
    body: body as number,
    neck: MAHOGANY,
    fretboard: ROSEWOOD,
    hardware: CHROME,
    pickguard: BLACK_HW,
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
