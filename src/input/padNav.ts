/**
 * O controle nos menus: direcional, analógico e dois botões viram intenções
 * de navegação.
 *
 * A API de gamepad não emite eventos, só expõe um retrato do estado. Quem
 * lê o retrato a cada quadro precisa decidir sozinho o que é um aperto novo,
 * o que é um botão que continua apertado e quando um direcional segurado
 * repete. Isso mora aqui, sem DOM e sem relógio próprio, porque é
 * exatamente a parte que dá para errar de um jeito que só aparece com o
 * controle na mão — um toque que anda duas linhas, um botão segurado que
 * confirma a tela seguinte também.
 *
 * O mapeamento é o de sempre no gênero, e vale igual para controle comum e
 * guitarra: o botão de baixo do losango confirma (A no Xbox, X no
 * PlayStation, o traste verde na guitarra), o da direita volta (B, bolinha,
 * traste vermelho), e o direcional anda — que na guitarra é a barra de
 * strum, o gesto que o Guitar Hero sempre usou para percorrer menu.
 */

export type Direction = 'up' | 'down' | 'left' | 'right'
export type NavIntent = Direction | 'confirm' | 'back'

export interface PadSnapshot {
  buttons: readonly boolean[]
  axes: readonly number[]
}

/** A, X, traste verde. */
export const PAD_CONFIRM = 0
/** B, bolinha, traste vermelho. */
export const PAD_BACK = 1

const DPAD: Record<Direction, number> = { up: 12, down: 13, left: 14, right: 15 }

/** Analógico esquerdo. */
const STICK_X = 0
const STICK_Y = 1

/**
 * Onde o analógico passa a contar, e onde deixa de contar.
 *
 * Dois números, não um: com um limiar só, o polegar parado bem em cima dele
 * treme para os dois lados da linha e cada tremida vira um passo.
 */
const STICK_ON = 0.55
const STICK_OFF = 0.35

/** Quanto o direcional segura antes de repetir, e de quanto em quanto repete. */
export const REPEAT_FIRST = 420
export const REPEAT_NEXT = 140

export class PadNavigator {
  /** Direção segurada agora, e quando ela repete. */
  private held: Direction | null = null
  private repeatAt = Infinity
  /** A direção que o analógico está dando, para a histerese. */
  private stick: Direction | null = null
  private confirmWas = false
  private backWas = false

  /** Lê um retrato e devolve o que ele pede. */
  read(pad: PadSnapshot, now: number): NavIntent[] {
    const intents: NavIntent[] = []

    const direction = this.direction(pad)
    if (direction === null) {
      this.held = null
      this.repeatAt = Infinity
    } else if (direction !== this.held) {
      // Primeira pressão: anda um e espera mais antes de repetir, senão um
      // toque no direcional atravessa a lista inteira.
      this.held = direction
      this.repeatAt = now + REPEAT_FIRST
      intents.push(direction)
    } else if (now >= this.repeatAt) {
      this.repeatAt = now + REPEAT_NEXT
      intents.push(direction)
    }

    // Botões valem no aperto, não na soltura. O que impede o aperto que
    // abriu uma tela de confirmar a seguinte é justamente só existir borda:
    // um botão que continua apertado não aperta de novo.
    const confirm = pad.buttons[PAD_CONFIRM] ?? false
    const back = pad.buttons[PAD_BACK] ?? false
    if (confirm && !this.confirmWas) intents.push('confirm')
    if (back && !this.backWas) intents.push('back')
    this.confirmWas = confirm
    this.backWas = back

    return intents
  }

  /**
   * Acompanha o controle sem agir.
   *
   * É o que roda enquanto a navegação está suspensa — durante a música, em
   * que A e B são trastes, ou enquanto os ajustes esperam o botão a ser
   * gravado. Sem acompanhar, o botão que ainda estivesse apertado na volta
   * contaria como aperto novo; e uma direção segurada desde antes não
   * repete até ser solta.
   */
  sync(pad: PadSnapshot) {
    this.held = this.direction(pad)
    this.repeatAt = Infinity
    this.confirmWas = pad.buttons[PAD_CONFIRM] ?? false
    this.backWas = pad.buttons[PAD_BACK] ?? false
  }

  /** O direcional manda; sem ele, o analógico. */
  private direction(pad: PadSnapshot): Direction | null {
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      if (pad.buttons[DPAD[dir]]) {
        this.stick = null
        return dir
      }
    }
    this.stick = stickDirection(pad.axes[STICK_X] ?? 0, pad.axes[STICK_Y] ?? 0, this.stick)
    return this.stick
  }
}

/**
 * A direção do analógico, com histerese.
 *
 * Uma direção já dada continua valendo até o eixo dela cair abaixo de
 * `STICK_OFF`; uma nova só nasce acima de `STICK_ON`, no eixo dominante —
 * a diagonal não é direção nenhuma num menu.
 */
export function stickDirection(x: number, y: number, current: Direction | null): Direction | null {
  if (current !== null) {
    const along = current === 'up' ? -y : current === 'down' ? y : current === 'left' ? -x : x
    if (along > STICK_OFF) return current
  }
  if (Math.max(Math.abs(x), Math.abs(y)) < STICK_ON) return null
  if (Math.abs(y) >= Math.abs(x)) return y > 0 ? 'down' : 'up'
  return x > 0 ? 'right' : 'left'
}
