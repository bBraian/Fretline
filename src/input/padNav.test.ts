/**
 * O controle nos menus: um aperto é um passo, segurar repete no ritmo
 * certo, e o que ficou apertado de uma tela não vale na seguinte.
 */

import { describe, expect, it } from 'vitest'
import {
  PAD_BACK,
  PAD_CONFIRM,
  PadNavigator,
  REPEAT_FIRST,
  REPEAT_NEXT,
  stickDirection,
  type PadSnapshot,
} from './padNav'

/** Um retrato com estes botões apertados e o analógico onde for dito. */
function pad(pressed: number[] = [], axes: number[] = [0, 0]): PadSnapshot {
  const buttons = Array.from({ length: 17 }, (_, i) => pressed.includes(i))
  return { buttons, axes }
}

const DOWN = 13
const RIGHT = 15

describe('PadNavigator', () => {
  it('um toque no direcional anda um passo só', () => {
    const nav = new PadNavigator()
    expect(nav.read(pad([DOWN]), 0)).toEqual(['down'])
    expect(nav.read(pad([DOWN]), 16)).toEqual([])
    expect(nav.read(pad([DOWN]), 200)).toEqual([])
    expect(nav.read(pad(), 216)).toEqual([])
  })

  it('segurado, espera antes de repetir e depois repete mais rápido', () => {
    const nav = new PadNavigator()
    nav.read(pad([DOWN]), 0)
    expect(nav.read(pad([DOWN]), REPEAT_FIRST - 1)).toEqual([])
    expect(nav.read(pad([DOWN]), REPEAT_FIRST)).toEqual(['down'])
    expect(nav.read(pad([DOWN]), REPEAT_FIRST + REPEAT_NEXT - 1)).toEqual([])
    expect(nav.read(pad([DOWN]), REPEAT_FIRST + REPEAT_NEXT)).toEqual(['down'])
  })

  it('trocar de direção é um aperto novo, sem herdar a espera', () => {
    const nav = new PadNavigator()
    nav.read(pad([DOWN]), 0)
    expect(nav.read(pad([RIGHT]), 50)).toEqual(['right'])
  })

  it('confirmar e voltar valem no aperto, uma vez', () => {
    const nav = new PadNavigator()
    expect(nav.read(pad([PAD_CONFIRM]), 0)).toEqual(['confirm'])
    expect(nav.read(pad([PAD_CONFIRM]), 16)).toEqual([])
    expect(nav.read(pad(), 32)).toEqual([])
    expect(nav.read(pad([PAD_BACK]), 48)).toEqual(['back'])
  })

  it('o analógico anda como o direcional', () => {
    const nav = new PadNavigator()
    expect(nav.read(pad([], [0, 0.9]), 0)).toEqual(['down'])
    expect(nav.read(pad([], [0, 0.9]), 16)).toEqual([])
    expect(nav.read(pad([], [-0.9, 0]), 32)).toEqual(['left'])
  })

  it('depois de acompanhar em silêncio, o que já estava apertado não conta', () => {
    const nav = new PadNavigator()
    // A tela de jogo segurou a navegação com o A apertado como traste.
    nav.sync(pad([PAD_CONFIRM, DOWN]))
    expect(nav.read(pad([PAD_CONFIRM, DOWN]), 0)).toEqual([])
    // Nem repete: a direção segurada desde antes precisa ser solta.
    expect(nav.read(pad([PAD_CONFIRM, DOWN]), REPEAT_FIRST * 3)).toEqual([])
    expect(nav.read(pad(), REPEAT_FIRST * 3 + 16)).toEqual([])
    expect(nav.read(pad([PAD_CONFIRM]), REPEAT_FIRST * 3 + 32)).toEqual(['confirm'])
  })
})

describe('stickDirection', () => {
  it('ignora o analógico perto do centro', () => {
    expect(stickDirection(0.2, -0.3, null)).toBeNull()
  })

  it('escolhe o eixo dominante; diagonal não é direção', () => {
    expect(stickDirection(0.6, 0.9, null)).toBe('down')
    expect(stickDirection(-0.9, 0.6, null)).toBe('left')
  })

  it('segura a direção dada até o eixo cair bem abaixo do limiar', () => {
    // Entre os dois limiares: não nasce direção nova, mas a dada continua.
    expect(stickDirection(0, 0.45, null)).toBeNull()
    expect(stickDirection(0, 0.45, 'down')).toBe('down')
    expect(stickDirection(0, 0.3, 'down')).toBeNull()
  })
})
