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
   * Com palhetada exigida — na guitarra, ver `input/guitar.ts` — é a barra
   * que toca a nota. Sem ela, a barra toca a nota que já está debaixo dos
   * dedos: um segundo gatilho, nunca uma exigência. `-1` desliga.
   */
  strumUp: number
  strumDown: number
}

/**
 * Verde e vermelho na mão esquerda, amarelo, azul e laranja na direita.
 *
 * Com as duas mãos no teclado, os dedos já estão em cima da fileira do
 * meio, e o espaço fica sob os polegares para o star power.
 */
export const DEFAULT_KEYBOARD: KeyboardBindings = {
  frets: ['KeyA', 'KeyS', 'KeyJ', 'KeyK', 'KeyL'],
  starPower: 'Space',
  whammy: 'ShiftLeft',
}

/** O padrão dos trastes até o A S J K L. Ver `migrateKeyboard`. */
const PREVIOUS_DEFAULT_FRETS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG']

/**
 * Leva um save do padrão antigo dos trastes para o novo.
 *
 * Todo save grava os ajustes inteiros, e não só o que o jogador mudou:
 * quem nunca abriu a tela de controles carrega o padrão antigo como se
 * fosse escolha sua, e nunca veria o novo. Só troca os trastes idênticos
 * ao padrão antigo — um mapeamento feito à mão fica como está, e star
 * power e alavanca nem entram na conta.
 *
 * Não pode lançar: roda dentro do `load()` da store, cujo `catch` recomeça
 * o perfil do zero. Um save torto aqui custaria o progresso inteiro.
 */
export function migrateKeyboard(saved: KeyboardBindings): KeyboardBindings {
  const frets: unknown = saved?.frets
  const antigo =
    Array.isArray(frets) &&
    frets.length === PREVIOUS_DEFAULT_FRETS.length &&
    frets.every((code, i) => code === PREVIOUS_DEFAULT_FRETS[i])
  return antigo ? { ...saved, frets: [...DEFAULT_KEYBOARD.frets] } : saved
}

/**
 * Padrão para controle comum: os quatro botões de ação mais o bumper
 * direito. É o arranjo que deixa cinco trastes alcançáveis sem tirar o
 * polegar do lugar — e, como o controle comum não palheteia, o direcional
 * fica livre. Na guitarra de Xbox a barra de strum *é* o direcional, e é
 * por isso que ele está nos dois strums.
 */
export const DEFAULT_GAMEPAD: GamepadBindings = {
  frets: [2, 3, 1, 0, 5],
  starPower: 9,
  whammyAxis: 2,
  // No layout padrão do XInput o direcional é 12 (cima) e 13 (baixo).
  strumUp: 12,
  strumDown: 13,
}

/** Menu/Start e Voltar/Select, no layout padrão. */
const START = 9
const SELECT = 8

/**
 * O botão que pausa a música no controle, ou `-1` se não sobrar nenhum.
 *
 * Start é o de sempre, mas o padrão daqui já o gasta com o star power — e
 * uma pausa no mesmo botão do star power seria as duas coisas ao mesmo
 * tempo. Então vale o primeiro dos dois botões de sistema que nenhum
 * comando do jogador usa: Start, e senão Select.
 */
export function pausePadButton(bindings: GamepadBindings): number {
  const usados = new Set([...bindings.frets, bindings.starPower, bindings.strumUp, bindings.strumDown])
  if (!usados.has(START)) return START
  if (!usados.has(SELECT)) return SELECT
  return -1
}

/**
 * A alavanca, de 0 a 1, a partir da leitura de um eixo do controle.
 *
 * Há dois tipos de eixo. O analógico de um controle comum descansa no meio
 * e vai para os dois lados. A alavanca de um controle de guitarra descansa
 * num **extremo** — em -1 ou em 1 — e percorre o eixo inteiro até o outro.
 * Lida como analógico, ela marcava alavanca puxada o tempo todo, e puxá-la
 * de verdade não mudava nada: era exatamente "a alavanca não faz efeito".
 *
 * `rest` é o valor em que o eixo foi encontrado parado; um repouso longe do
 * meio denuncia o segundo tipo.
 */
export function whammyFromAxis(raw: number, rest: number): number {
  const fromExtreme = Math.abs(rest) > 0.5
  const value = fromExtreme ? Math.abs(raw - rest) / 2 : Math.abs(raw)
  // Zona morta: nada descansa exatamente no lugar.
  return value < 0.15 ? 0 : Math.min(1, value)
}

/**
 * As palavras dos rótulos abaixo, que mudam com o idioma.
 *
 * Vêm do dicionário (`input`, em `i18n/`); aqui fica só o que é igual em
 * toda língua — as letras dos botões, as setas, o "D-pad".
 */
export interface InputWords {
  keys: Record<string, string>
  /** O botão 8, que o XInput chama de Back. */
  back: string
  /** O botão 16, o do logotipo. */
  guide: string
  button: (index: number) => string
  axisOff: string
  /** Os dois analógicos, eixo a eixo, na ordem do layout padrão. */
  axes: string[]
  axis: (index: number) => string
}

/** Nome legível de um botão de controle, no layout padrão do XInput. */
export function gamepadButtonLabel(index: number, words: InputWords): string {
  if (index < 0) return '—'
  const nomes: Record<number, string> = {
    0: 'A', 1: 'B', 2: 'X', 3: 'Y',
    4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
    8: words.back, 9: 'Menu', 10: 'L3', 11: 'R3',
    12: 'D-pad ↑', 13: 'D-pad ↓', 14: 'D-pad ←', 15: 'D-pad →',
    16: words.guide,
  }
  return nomes[index] ?? words.button(index)
}

/**
 * Nome legível de um controle, a partir de `Gamepad.id`.
 *
 * Cada navegador embrulha o nome de um jeito: o Chrome acrescenta
 * fabricante e produto entre parênteses, o Firefox os antepõe em
 * hexadecimal. Nenhum dos dois diz nada a quem acabou de ligar o controle.
 *
 * Quando não sobra nome nenhum, vale `unnamed` — a palavra genérica, no
 * idioma da tela.
 */
export function gamepadName(id: string, unnamed: string): string {
  const nome = id
    .replace(/\s*\([^)]*(?:STANDARD GAMEPAD|Vendor:)[^)]*\)\s*$/i, '')
    .replace(/^[0-9a-f]{1,4}-[0-9a-f]{1,4}-/i, '')
    .trim()
  return nome || unnamed
}

/** Nome legível de um eixo. */
export function gamepadAxisLabel(index: number, words: InputWords): string {
  if (index < 0) return words.axisOff
  return words.axes[index] ?? words.axis(index)
}

/** Nomes legíveis para a tela de configuração. */
export function keyLabel(code: string, words: InputWords): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Arrow')) return { Up: '↑', Down: '↓', Left: '←', Right: '→' }[code.slice(5)] ?? code
  return words.keys[code] ?? code
}
