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
  /**
   * Strum para cima e para baixo.
   *
   * O jogo resolve a nota no traste e não precisa de palhetada, mas quem
   * tem controle de guitarra espera que a barra faça alguma coisa — aqui
   * ela vale como um segundo star power, que é o gesto mais próximo.
   * `-1` desliga.
   */
  strumUp: number
  strumDown: number
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
  // No layout padrão do XInput o direcional é 12 (cima) e 13 (baixo).
  strumUp: 12,
  strumDown: 13,
}

/** Nome legível de um botão de controle, no layout padrão do XInput. */
export function gamepadButtonLabel(index: number): string {
  if (index < 0) return '—'
  const nomes: Record<number, string> = {
    0: 'A', 1: 'B', 2: 'X', 3: 'Y',
    4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
    8: 'Voltar', 9: 'Menu', 10: 'L3', 11: 'R3',
    12: 'D-pad ↑', 13: 'D-pad ↓', 14: 'D-pad ←', 15: 'D-pad →',
    16: 'Guia',
  }
  return nomes[index] ?? `Botão ${index}`
}

/** Nome legível de um eixo. */
export function gamepadAxisLabel(index: number): string {
  if (index < 0) return 'desligado'
  const nomes: Record<number, string> = {
    0: 'Analógico esq. ↔', 1: 'Analógico esq. ↕',
    2: 'Analógico dir. ↔', 3: 'Analógico dir. ↕',
  }
  return nomes[index] ?? `Eixo ${index}`
}

/** Nomes legíveis para a tela de configuração. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Arrow')) return { Up: '↑', Down: '↓', Left: '←', Right: '→' }[code.slice(5)] ?? code
  return { Space: 'Espaço', ShiftLeft: 'Shift', ShiftRight: 'Shift D', Enter: 'Enter' }[code] ?? code
}
