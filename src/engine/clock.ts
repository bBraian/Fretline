/**
 * O relógio do jogo.
 *
 * A implementação real deriva de `AudioContext.currentTime`, porque a placa
 * de som é o único componente que avança em tempo real de verdade. O engine
 * só conhece esta interface, o que permite testar o julgamento com um
 * relógio controlado à mão.
 */
export interface Clock {
  /** Posição atual na música, em segundos. Pode ser negativa na contagem. */
  now(): number
  isRunning(): boolean
}

/** Relógio de teste: avança só quando mandam. */
export class ManualClock implements Clock {
  private t: number
  private running = true

  constructor(start = 0) {
    this.t = start
  }

  now() {
    return this.t
  }

  isRunning() {
    return this.running
  }

  set(t: number) {
    this.t = t
  }

  advance(dt: number) {
    this.t += dt
  }

  stop() {
    this.running = false
  }
}
