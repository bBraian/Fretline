/**
 * Conversão de tick para segundos.
 *
 * Um chart marca posições em ticks, que só viram tempo real depois de
 * atravessar as mudanças de andamento. O mapa guarda, para cada mudança de
 * BPM, o instante em segundos em que ela acontece, para que a conversão de
 * qualquer tick seja uma busca binária mais uma interpolação — e não uma
 * varredura desde o começo da música a cada nota.
 */

export interface TempoEvent {
  tick: number
  /** Microbatidas por minuto: o valor do .chart é BPM * 1000. */
  bpmThousandths: number
}

export interface TimeSignature {
  tick: number
  numerator: number
  denominator: number
}

interface Anchor {
  tick: number
  time: number
  secondsPerTick: number
}

export class TempoMap {
  private anchors: Anchor[] = []

  constructor(
    readonly resolution: number,
    events: TempoEvent[],
  ) {
    const sorted = [...events].sort((a, b) => a.tick - b.tick)
    if (sorted.length === 0 || sorted[0].tick !== 0) {
      // Sem andamento declarado no início, o padrão do formato é 120 BPM.
      sorted.unshift({ tick: 0, bpmThousandths: 120000 })
    }

    let time = 0
    let prevTick = 0
    let prevSpt = this.secondsPerTick(sorted[0].bpmThousandths)

    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i]
      if (i > 0) time += (ev.tick - prevTick) * prevSpt
      const spt = this.secondsPerTick(ev.bpmThousandths)
      this.anchors.push({ tick: ev.tick, time, secondsPerTick: spt })
      prevTick = ev.tick
      prevSpt = spt
    }
  }

  private secondsPerTick(bpmThousandths: number) {
    const bpm = bpmThousandths / 1000
    return 60 / (bpm * this.resolution)
  }

  /** Segundos correspondentes a um tick. */
  timeAt(tick: number): number {
    const a = this.anchorFor(tick)
    return a.time + (tick - a.tick) * a.secondsPerTick
  }

  /** Duração em segundos de um intervalo de ticks começando em `tick`. */
  durationOf(tick: number, lengthInTicks: number): number {
    if (lengthInTicks <= 0) return 0
    return this.timeAt(tick + lengthInTicks) - this.timeAt(tick)
  }

  private anchorFor(tick: number): Anchor {
    let lo = 0
    let hi = this.anchors.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.anchors[mid].tick <= tick) lo = mid
      else hi = mid - 1
    }
    return this.anchors[lo]
  }

  /** BPM vigente num tick, para a UI e para o pulso do palco. */
  bpmAt(tick: number): number {
    const a = this.anchorFor(tick)
    return 60 / (a.secondsPerTick * this.resolution)
  }

  /**
   * Tempos de cada batida até `endTick`, respeitando as trocas de fórmula
   * de compasso. O palco pulsa nesses instantes.
   */
  beatTimes(endTick: number, signatures: TimeSignature[]): number[] {
    const sigs = [...signatures].sort((a, b) => a.tick - b.tick)
    if (sigs.length === 0 || sigs[0].tick !== 0) {
      sigs.unshift({ tick: 0, numerator: 4, denominator: 4 })
    }

    const beats: number[] = []
    let sigIndex = 0
    let tick = 0
    let guard = 0

    while (tick <= endTick && guard++ < 1_000_000) {
      while (sigIndex + 1 < sigs.length && sigs[sigIndex + 1].tick <= tick) sigIndex++
      const sig = sigs[sigIndex]
      // Uma batida vale uma nota do denominador da fórmula de compasso.
      const ticksPerBeat = (this.resolution * 4) / sig.denominator
      beats.push(this.timeAt(tick))
      tick += ticksPerBeat
    }

    return beats
  }
}
