/** Mapeamento de controles, editável na tela de configuração. */

export interface KeyboardBindings {
  /** Códigos de tecla dos cinco trastes, do verde ao laranja. */
  frets: string[]
  strumUp: string
  strumDown: string
  starPower: string
  whammy: string
}

export interface GamepadBindings {
  /** Índices de botão dos cinco trastes. */
  frets: number[]
  strumUp: number
  strumDown: number
  starPower: number
  /** Eixo usado como alavanca; -1 desliga. */
  whammyAxis: number
}

export const DEFAULT_KEYBOARD: KeyboardBindings = {
  frets: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG'],
  strumUp: 'ArrowUp',
  strumDown: 'ArrowDown',
  starPower: 'Space',
  whammy: 'ShiftLeft',
}

/**
 * Padrão para controle comum: trastes nos gatilhos e bumpers, palhetada no
 * direcional. Não é o layout de uma guitarra de verdade, mas é o arranjo que
 * deixa cinco dedos acessíveis ao mesmo tempo num controle de dois analógicos.
 */
export const DEFAULT_GAMEPAD: GamepadBindings = {
  frets: [0, 1, 2, 3, 5],
  strumUp: 12,
  strumDown: 13,
  starPower: 9,
  whammyAxis: 2,
}

/** Nomes legíveis para a tela de configuração. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Arrow')) return { Up: '↑', Down: '↓', Left: '←', Right: '→' }[code.slice(5)] ?? code
  return { Space: 'Espaço', ShiftLeft: 'Shift', ShiftRight: 'Shift D', Enter: 'Enter' }[code] ?? code
}
