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

/** Papel de cada faixa de áudio dentro da música. */
export type StemRole = 'guitar' | 'rhythm' | 'bass' | 'drums' | 'vocals' | 'backing'

interface Stem {
  role: StemRole
  buffer: AudioBuffer
  gain: GainNode
}

export class SongPlayer implements Clock {
  private ctx: AudioContext
  private gain: GainNode
  private stems: Stem[] = []
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

  /**
   * Carrega as faixas. Cada uma ganha o próprio controle de volume, o que é
   * o que permite abafar só a guitarra quando o jogador erra — o efeito do
   * original, e o retorno mais direto que o jogo dá sobre um erro.
   */
  async load(tracks: Array<{ url: string; role: StemRole }>) {
    this.disconnectStems()

    this.stems = await Promise.all(
      tracks.map(async ({ url, role }) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Falha ao carregar ${url}: ${response.status}`)
        const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer())

        const gain = this.ctx.createGain()
        gain.connect(this.gain)
        return { role, buffer, gain }
      }),
    )
  }

  /**
   * Usa faixas já decodificadas. É por aqui que entra a música sintetizada
   * da demonstração, que nunca passa por um arquivo.
   */
  useBuffers(buffers: AudioBuffer[]) {
    this.disconnectStems()
    this.stems = buffers.map((buffer) => {
      const gain = this.ctx.createGain()
      gain.connect(this.gain)
      return { role: 'backing' as StemRole, buffer, gain }
    })
  }

  private disconnectStems() {
    for (const stem of this.stems) stem.gain.disconnect()
    this.stems = []
  }

  /** Há uma faixa de guitarra separada para abafar? */
  get hasGuitarStem() {
    return this.stems.some((stem) => stem.role === 'guitar')
  }

  /** Duração da faixa mais longa, para saber quando a música acaba. */
  get duration() {
    return this.stems.reduce((max, stem) => Math.max(max, stem.buffer.duration), 0)
  }

  async start(fromSongTime = -Infinity) {
    if (this.ctx.state === 'suspended') await this.ctx.resume()

    const begin = fromSongTime === -Infinity ? -this.leadIn : fromSongTime
    const startAt = this.ctx.currentTime + 0.12 // folga para o agendamento
    this.origin = startAt - begin
    this.stopSources()

    for (const stem of this.stems) {
      const buffer = stem.buffer
      const source = this.ctx.createBufferSource()
      source.buffer = buffer
      source.connect(stem.gain)

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
   * Baixa o som até o silêncio, em vez de cortá-lo.
   *
   * O fim de uma música cortado no meio do último acorde soa como falha
   * técnica. A sequência de encerramento acontece sobre este fecho.
   */
  fadeOut(seconds = 1.6) {
    const now = this.ctx.currentTime
    const atual = this.gain.gain.value
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setValueAtTime(atual, now)
    this.gain.gain.linearRampToValueAtTime(0.0001, now + seconds)
  }

  /**
   * Abafa a guitarra quando o jogador erra, como no original.
   *
   * Com faixas separadas, só a guitarra cai — o resto da banda continua
   * tocando, e o buraco no meio da música é exatamente o retorno que o
   * jogador precisa. Com uma faixa só não há o que separar, então o volume
   * geral abaixa um pouco, que é o possível.
   */
  setMissedFeedback(missed: boolean) {
    const now = this.ctx.currentTime
    if (this.hasGuitarStem) {
      for (const stem of this.stems) {
        if (stem.role !== 'guitar' && stem.role !== 'rhythm') continue
        stem.gain.gain.setTargetAtTime(missed ? 0 : 1, now, 0.015)
      }
      return
    }
    this.gain.gain.setTargetAtTime(missed ? 0.45 : 1, now, 0.02)
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
