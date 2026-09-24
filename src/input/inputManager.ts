/**
 * Traduz teclado e controle em eventos do engine.
 *
 * O ponto delicado é o carimbo de tempo. Um evento de teclado traz
 * `timeStamp`, o instante em que o navegador recebeu a tecla, que pode ser
 * bem anterior ao momento em que o JavaScript consegue tratá-lo. Julgar pelo
 * instante do tratamento transforma qualquer engasgo do loop em atraso de
 * input; julgar pelo `timeStamp` não.
 */

import type { Clock } from '../engine/clock'
import type { InputEvent } from '../engine/gameplay/session'
import { FRET_COUNT } from '../engine/types'
import {
  DEFAULT_GAMEPAD,
  DEFAULT_KEYBOARD,
  whammyFromAxis,
  type GamepadBindings,
  type KeyboardBindings,
} from './bindings'

export type InputSink = (event: InputEvent) => void

/**
 * Idade máxima aceita para `Gamepad.timestamp`.
 *
 * Nem todo navegador preenche esse campo na mesma origem de
 * `performance.now()`; um valor fora desta janela denuncia outra origem, e
 * nesse caso vale a hora do quadro.
 */
const MAX_PAD_STAMP_AGE_MS = 250

export class InputManager {
  private keyboard: KeyboardBindings = DEFAULT_KEYBOARD
  private gamepad: GamepadBindings = DEFAULT_GAMEPAD
  private mask = 0
  private whammy = 0
  /** Onde o eixo da alavanca descansa; ver `whammyFromAxis`. */
  private whammyRest: number | null = null
  /** Instante do último strum, para o retorno visual. */
  private strummedAt = -1
  private previousButtons: boolean[] = []
  private attached = false

  constructor(
    private clock: Clock,
    private sink: InputSink,
  ) {}

  setBindings(keyboard: KeyboardBindings, gamepad: GamepadBindings) {
    this.keyboard = keyboard
    this.gamepad = gamepad
    this.whammyRest = null
  }

  setClock(clock: Clock) {
    this.clock = clock
  }

  attach() {
    if (this.attached) return
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    this.attached = true
  }

  detach() {
    if (!this.attached) return
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.attached = false
    this.reset()
  }

  reset() {
    // A sessão também precisa saber que a alavanca voltou. Sem isto, pausar
    // com ela puxada a deixava puxada do lado de lá para sempre: a soltura
    // que vinha depois já não mudava nada do lado de cá, e não era enviada.
    if (this.whammy !== 0) this.sink({ kind: 'whammy', value: 0, time: this.clock.now() })
    this.mask = 0
    this.whammy = 0
    this.previousButtons = []
  }

  /**
   * Toma o controle como está agora, sem mandar nada à sessão.
   *
   * Na volta da pausa, o botão que ainda estiver apertado não pode chegar
   * como nota: o A que clicou "Continuar" é um traste no padrão.
   */
  syncGamepad() {
    const pads = navigator.getGamepads?.() ?? []
    const pad = pads.find((p): p is Gamepad => p !== null && p.connected)
    this.previousButtons = pad ? pad.buttons.map((b) => b.pressed) : []
  }

  /** Estado atual dos trastes, para o render acender os botões. */
  get fretMask() {
    return this.mask
  }

  get whammyValue() {
    return this.whammy
  }

  /** Há quanto tempo a barra de strum foi usada, em segundos. */
  strumAge(now: number) {
    return this.strummedAt < 0 ? Infinity : now - this.strummedAt
  }

  /**
   * Converte o instante de um evento do DOM para a posição na música.
   * `timeStamp` e `performance.now()` compartilham a mesma origem.
   */
  private songTimeOf(domTimeStamp: number) {
    const ageInSeconds = Math.max(0, (performance.now() - domTimeStamp) / 1000)
    return this.clock.now() - ageInSeconds
  }

  /**
   * Instante de leitura do controle.
   *
   * A API de gamepad não emite eventos: o estado só pode ser lido uma vez
   * por quadro. Carimbar essa leitura com a hora do quadro joga até 16ms de
   * atraso em cima de quem usa controle, enquanto o teclado — que traz
   * `timeStamp` — é julgado no instante certo. Num jogo de ritmo isso é uma
   * desvantagem embutida no periférico.
   *
   * `Gamepad.timestamp` é o instante em que o navegador amostrou o
   * dispositivo, e recupera boa parte desses 16ms. Nem todo navegador o
   * preenche na mesma origem de `performance.now()`, então ele só é aceito
   * quando cai numa janela plausível do passado recente; fora disso vale a
   * hora do quadro, que é o comportamento antigo.
   */
  private padTime(pad: Gamepad): number {
    const stamp = pad.timestamp
    const ageMs = performance.now() - stamp
    const plausible = Number.isFinite(stamp) && ageMs >= 0 && ageMs <= MAX_PAD_STAMP_AGE_MS
    return plausible ? this.songTimeOf(stamp) : this.clock.now()
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return
    const time = this.songTimeOf(event.timeStamp)
    const fret = this.keyboard.frets.indexOf(event.code)

    if (fret >= 0) {
      event.preventDefault()
      this.setFret(fret, true, time)
      return
    }
    if (event.code === this.keyboard.starPower) {
      event.preventDefault()
      this.sink({ kind: 'starPower', time })
      return
    }
    if (event.code === this.keyboard.whammy) {
      event.preventDefault()
      this.setWhammy(1, time)
    }
  }

  private onKeyUp = (event: KeyboardEvent) => {
    const time = this.songTimeOf(event.timeStamp)
    const fret = this.keyboard.frets.indexOf(event.code)

    if (fret >= 0) {
      this.setFret(fret, false, time)
      return
    }
    if (event.code === this.keyboard.whammy) this.setWhammy(0, time)
  }

  private onBlur = () => {
    // Perder o foco com trastes pressionados deixaria a máscara travada.
    if (this.mask !== 0) {
      this.mask = 0
      this.sink({ kind: 'frets', mask: 0, time: this.clock.now() })
    }
  }

  private setFret(index: number, down: boolean, time: number) {
    const next = down ? this.mask | (1 << index) : this.mask & ~(1 << index)
    if (next === this.mask) return
    this.mask = next
    this.sink({ kind: 'frets', mask: next, time })
  }

  private setWhammy(value: number, time: number) {
    if (Math.abs(value - this.whammy) < 0.02) return
    this.whammy = value
    this.sink({ kind: 'whammy', value, time })
  }

  /**
   * Lê o controle. Precisa ser chamado uma vez por frame: a API de gamepad
   * não emite eventos, só expõe um retrato do estado atual.
   */
  pollGamepad() {
    const pads = navigator.getGamepads?.() ?? []
    const pad = pads.find((p): p is Gamepad => p !== null && p.connected)
    if (!pad) return

    const time = this.padTime(pad)
    const pressed = pad.buttons.map((b) => b.pressed)

    let mask = this.mask
    for (let i = 0; i < FRET_COUNT; i++) {
      const button = this.gamepad.frets[i]
      if (button === undefined) continue
      const isDown = pressed[button] ?? false
      const wasDown = this.previousButtons[button] ?? false
      if (isDown !== wasDown) {
        mask = isDown ? mask | (1 << i) : mask & ~(1 << i)
      }
    }
    if (mask !== this.mask) {
      this.mask = mask
      this.sink({ kind: 'frets', mask, time })
    }

    const sp = this.gamepad.starPower
    if ((pressed[sp] ?? false) && !(this.previousButtons[sp] ?? false)) {
      this.sink({ kind: 'starPower', time })
    }

    // A barra de strum toca nota. O jogo não exige palhetada e continua sem
    // exigir, mas ela estava ligada ao star power — quem tinha um controle
    // de guitarra e palhetava a música normalmente disparava o star power a
    // cada nota. Agora é um segundo gatilho para a nota que já está debaixo
    // dos dedos, que é o que o instrumento promete.
    for (const strum of [this.gamepad.strumUp, this.gamepad.strumDown]) {
      if (strum < 0) continue
      if ((pressed[strum] ?? false) && !(this.previousButtons[strum] ?? false)) {
        this.strummedAt = time
        this.sink({ kind: 'strum', time })
      }
    }

    if (this.gamepad.whammyAxis >= 0) {
      const raw = pad.axes[this.gamepad.whammyAxis] ?? 0
      // O repouso é a primeira leitura de verdade. Zero exato é o que o
      // navegador informa antes de o controle mandar o primeiro relatório,
      // e tomá-lo por repouso confundiria a alavanca de guitarra com um
      // analógico.
      if (this.whammyRest === null && raw !== 0) this.whammyRest = raw
      this.setWhammy(whammyFromAxis(raw, this.whammyRest ?? 0), time)
    }

    this.previousButtons = pressed
  }
}
