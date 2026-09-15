/**
 * Reprodução da música e o relógio que o jogo inteiro usa.
 *
 * `AudioContext.currentTime` é a única fonte de tempo confiável disponível:
 * avança com o relógio da placa de som, que é o mesmo que produz o som que o
 * jogador ouve. Derivar a posição da música de `performance.now()` ou do
 * delta do loop de render produz deriva acumulada — o defeito clássico de
 * clones de jogo de ritmo, onde a primeira metade da música sincroniza e a
 * segunda não.
 */

import type { Clock } from '../engine/clock'

export interface SongPlayerOptions {
  /** Segundos de aproximação antes do áudio começar, para as notas entrarem. */
  leadIn?: number
  /** Deslocamento do áudio declarado pelo chart. */
  chartOffset?: number
}

export class SongPlayer implements Clock {
  private ctx: AudioContext
  private gain: GainNode
  private buffers: AudioBuffer[] = []
  private sources: AudioBufferSourceNode[] = []

  /** Instante do `AudioContext` correspondente a songTime = 0. */
  private origin = 0
  private running = false
  private pausedAt: number | null = null
  private leadIn: number
  private chartOffset: number

  constructor(options: SongPlayerOptions = {}) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    this.gain = this.ctx.createGain()
    this.gain.connect(this.ctx.destination)
    this.leadIn = options.leadIn ?? 3
    this.chartOffset = options.chartOffset ?? 0
  }

  get context() {
    return this.ctx
  }

  /**
   * Latência de saída medida pelo navegador: o som que sai agora foi
   * agendado este tanto de tempo atrás. Entra no relógio para que o
   * julgamento fique alinhado com o que o jogador de fato ouve.
   */
  get outputLatency() {
    return this.ctx.outputLatency || this.ctx.baseLatency || 0
  }

  async load(urls: string[]) {
    this.buffers = await Promise.all(
      urls.map(async (url) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Falha ao carregar ${url}: ${response.status}`)
        return this.ctx.decodeAudioData(await response.arrayBuffer())
      }),
    )
  }

  /** Duração da faixa mais longa, para saber quando a música acaba. */
  get duration() {
    return this.buffers.reduce((max, b) => Math.max(max, b.duration), 0)
  }

  async start(fromSongTime = -Infinity) {
    if (this.ctx.state === 'suspended') await this.ctx.resume()

    const begin = fromSongTime === -Infinity ? -this.leadIn : fromSongTime
    const startAt = this.ctx.currentTime + 0.12 // folga para o agendamento
    this.origin = startAt - begin
    this.stopSources()

    for (const buffer of this.buffers) {
      const source = this.ctx.createBufferSource()
      source.buffer = buffer
      source.connect(this.gain)

      // O áudio toca quando songTime alcança o offset declarado no chart.
      const audioStartsAtSongTime = this.chartOffset
      const when = this.origin + audioStartsAtSongTime
      if (when >= startAt) {
        source.start(when)
      } else {
        // Já passamos do início do áudio: entra no meio da faixa.
        const into = startAt - when
        if (into < buffer.duration) source.start(startAt, into)
      }
      this.sources.push(source)
    }

    this.running = true
    this.pausedAt = null
  }

  pause() {
    if (!this.running) return
    this.pausedAt = this.now()
    this.stopSources()
    this.running = false
  }

  async resume() {
    if (this.running || this.pausedAt === null) return
    await this.start(this.pausedAt)
  }

  stop() {
    this.stopSources()
    this.running = false
    this.pausedAt = null
  }

  setVolume(value: number) {
    this.gain.gain.value = value
  }

  /**
   * Abafa a guitarra quando o jogador erra, como no original. Com uma faixa
   * só não há o que abafar, então o volume geral cai um pouco.
   */
  setMissedFeedback(missed: boolean) {
    const target = missed ? 0.35 : 1
    this.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02)
  }

  now(): number {
    if (this.pausedAt !== null) return this.pausedAt
    return this.ctx.currentTime - this.origin - this.outputLatency
  }

  isRunning() {
    return this.running
  }

  private stopSources() {
    for (const source of this.sources) {
      try {
        source.stop()
      } catch {
        // Já parou; nada a fazer.
      }
      source.disconnect()
    }
    this.sources = []
  }

  async dispose() {
    this.stop()
    await this.ctx.close()
  }
}
