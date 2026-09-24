/**
 * Mapeamento de controles: o padrão do teclado, a migração dos saves antigos
 * e o nome do controle que o aviso de conexão mostra.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_KEYBOARD, gamepadName, migrateKeyboard, type KeyboardBindings } from './bindings'

describe('teclado padrão', () => {
  it('põe os trastes em A S J K L, do verde ao laranja', () => {
    expect(DEFAULT_KEYBOARD.frets).toEqual(['KeyA', 'KeyS', 'KeyJ', 'KeyK', 'KeyL'])
  })
})

describe('migrateKeyboard', () => {
  it('troca o padrão antigo pelo novo, que o jogador nunca escolheu', () => {
    const salvo = { frets: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG'], starPower: 'Space', whammy: 'ShiftLeft' }
    expect(migrateKeyboard(salvo).frets).toEqual(DEFAULT_KEYBOARD.frets)
  })

  it('não mexe no star power nem na alavanca, que podem ter sido remapeados', () => {
    const salvo = { frets: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG'], starPower: 'Enter', whammy: 'KeyQ' }
    const migrado = migrateKeyboard(salvo)
    expect(migrado.starPower).toBe('Enter')
    expect(migrado.whammy).toBe('KeyQ')
  })

  it('preserva um mapeamento feito à mão', () => {
    const salvo = { frets: ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB'], starPower: 'Space', whammy: 'ShiftLeft' }
    expect(migrateKeyboard(salvo)).toBe(salvo)
  })

  it('preserva um mapeamento que só difere do antigo num traste', () => {
    const salvo = { frets: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyH'], starPower: 'Space', whammy: 'ShiftLeft' }
    expect(migrateKeyboard(salvo)).toBe(salvo)
  })

  it('não lança com um save torto, que custaria o perfil inteiro', () => {
    const torto = { starPower: 'Space' } as unknown as KeyboardBindings
    expect(migrateKeyboard(torto)).toBe(torto)
    expect(() => migrateKeyboard(null as unknown as KeyboardBindings)).not.toThrow()
  })
})

describe('gamepadName', () => {
  it('tira o sufixo de fabricante do Chrome', () => {
    expect(gamepadName('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toBe(
      'Xbox Wireless Controller',
    )
    expect(gamepadName('Guitar Hero X-plorer (Vendor: 1430 Product: 4748)')).toBe('Guitar Hero X-plorer')
    expect(gamepadName('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('Xbox 360 Controller')
  })

  it('tira o prefixo de fabricante do Firefox', () => {
    expect(gamepadName('045e-028e-Microsoft X-Box 360 pad')).toBe('Microsoft X-Box 360 pad')
  })

  it('deixa como está um nome que já vem limpo', () => {
    expect(gamepadName('DualSense Wireless Controller')).toBe('DualSense Wireless Controller')
  })

  it('não devolve vazio quando o navegador só informa o fabricante', () => {
    expect(gamepadName('(Vendor: 0079 Product: 0006)')).toBe('Controle')
    expect(gamepadName('')).toBe('Controle')
  })
})
