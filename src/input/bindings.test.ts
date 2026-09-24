/**
 * Mapeamento de controles: o padrão do teclado, a migração dos saves antigos
 * e o nome do controle que o aviso de conexão mostra.
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GAMEPAD,
  DEFAULT_KEYBOARD,
  gamepadName,
  migrateKeyboard,
  pausePadButton,
  whammyFromAxis,
  type KeyboardBindings,
} from './bindings'

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
    expect(gamepadName('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', 'Controle')).toBe(
      'Xbox Wireless Controller',
    )
    expect(gamepadName('Guitar Hero X-plorer (Vendor: 1430 Product: 4748)', 'Controle')).toBe('Guitar Hero X-plorer')
    expect(gamepadName('Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'Controle')).toBe('Xbox 360 Controller')
  })

  it('tira o prefixo de fabricante do Firefox', () => {
    expect(gamepadName('045e-028e-Microsoft X-Box 360 pad', 'Controle')).toBe('Microsoft X-Box 360 pad')
  })

  it('deixa como está um nome que já vem limpo', () => {
    expect(gamepadName('DualSense Wireless Controller', 'Controle')).toBe('DualSense Wireless Controller')
  })

  it('não devolve vazio quando o navegador só informa o fabricante', () => {
    expect(gamepadName('(Vendor: 0079 Product: 0006)', 'Controle')).toBe('Controle')
    expect(gamepadName('', 'Controle')).toBe('Controle')
  })
})

describe('whammyFromAxis', () => {
  it('num analógico, que descansa no meio, lê a distância do meio', () => {
    expect(whammyFromAxis(0.02, 0.01)).toBe(0)
    expect(whammyFromAxis(0.8, 0.01)).toBeCloseTo(0.8)
    expect(whammyFromAxis(-0.8, 0.01)).toBeCloseTo(0.8)
  })

  it('na alavanca de guitarra, que descansa num extremo, parada é zero', () => {
    // Lida como analógico, esta leitura dava alavanca inteira puxada.
    expect(whammyFromAxis(-1, -1)).toBe(0)
    expect(whammyFromAxis(1, 1)).toBe(0)
  })

  it('na alavanca de guitarra, o curso vai de um extremo ao outro', () => {
    expect(whammyFromAxis(0, -1)).toBeCloseTo(0.5)
    expect(whammyFromAxis(1, -1)).toBe(1)
    expect(whammyFromAxis(-1, 1)).toBe(1)
  })

  it('ignora o tremor em volta do repouso', () => {
    expect(whammyFromAxis(-0.9, -1)).toBe(0)
  })
})

describe('pausePadButton', () => {
  it('no padrão, com o Start no star power, pausa no Select', () => {
    expect(DEFAULT_GAMEPAD.starPower).toBe(9)
    expect(pausePadButton(DEFAULT_GAMEPAD)).toBe(8)
  })

  it('com o Start livre, pausa no Start', () => {
    expect(pausePadButton({ ...DEFAULT_GAMEPAD, starPower: 4 })).toBe(9)
  })

  it('não pausa num botão que toca: sem os dois livres, não há pausa no controle', () => {
    expect(pausePadButton({ ...DEFAULT_GAMEPAD, strumUp: 8 })).toBe(-1)
  })
})
