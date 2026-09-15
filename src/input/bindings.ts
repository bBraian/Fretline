/** Mapeamento de controles, editável na tela de configuração. */

export interface KeyboardBindings {
  /** Códigos de tecla dos cinco trastes, do verde ao laranja. */
  frets: string[]
  starPower: string
  whammy: string
}

export interface GamepadBindings {
  /** Índices de botão dos cinco trastes. */
  frets: number[]
  starPower: number
  /** Eixo usado como alavanca; -1 desliga. */
  whammyAxis: number
}

export const DEFAULT_KEYBOARD: KeyboardBindings = {
  frets: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG'],
  starPower: 'Space',
  whammy: 'ShiftLeft',
}

/**
 * Padrão para controle comum: os quatro botões de ação mais o bumper
 * direito. É o arranjo que deixa cinco trastes alcançáveis sem tirar o
 * polegar do lugar — e, como não há palhetada, o direcional fica livre.
 */
export const DEFAULT_GAMEPAD: GamepadBindings = {
  frets: [2, 3, 1, 0, 5],
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
