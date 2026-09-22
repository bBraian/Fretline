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
import { groupStems } from './stems'

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
  /** Saída dos efeitos, em paralelo à música; ver `playMissNoise`. */
  private sfx: GainNode
  private missNoise: AudioBuffer | null = null
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
    // Os efeitos têm saída própria, em paralelo à música. Se passassem pelo
    // mesmo controle, o ruído do erro seria abafado pelo próprio abafamento
    // que ele acompanha — justo o retorno que precisa ser ouvido.
    this.sfx = this.ctx.createGain()
    this.sfx.connect(this.ctx.destination)
    this.leadIn = options.leadIn ?? 3
    this.chartOffset = options.chartOffset ?? 0
  }

  /**
   * O ruído de corda abafada de uma nota errada.
   *
   * Cortar a guitarra diz que alguma coisa sumiu, mas não diz que foi culpa
   * do jogador — num trecho em que a guitarra já estava calada, o erro passa
   * despercebido. O original resolve isso com um som próprio, curto e feio,
   * e é ele que fecha o laço: apertei errado, ouvi errado.
   *
   * É ruído filtrado, não um oscilador: uma corda abafada não tem altura
   * definida, e qualquer nota aqui soaria como parte da música.
   */
  playMissNoise() {
    const ctx = this.ctx
    if (ctx.state !== 'running') return

    const now = ctx.currentTime
    const source = ctx.createBufferSource()
    source.buffer = this.missBuffer()

    // Passa-banda baixo e estreito: o "tump" de palma na corda, sem o
    // chiado agudo que um ruído branco cru traz.
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 220
    filter.Q.value = 1.4

    const envelope = ctx.createGain()
    envelope.gain.setValueAtTime(0.0001, now)
    envelope.gain.exponentialRampToValueAtTime(0.5, now + 0.004)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.13)

    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(this.sfx)
    source.start(now)
    source.stop(now + 0.16)
  }

  /** O ruído é gerado uma vez e reaproveitado; são só 200ms de amostras. */
  private missBuffer(): AudioBuffer {
    if (this.missNoise) return this.missNoise
    const length = Math.floor(this.ctx.sampleRate * 0.2)
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    this.missNoise = buffer
    return buffer
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
   * Carrega as faixas e as reduz aos dois grupos que a partida distingue.
   *
   * O que sobrevive da separação é só o que o jogo usa: o grupo da guitarra,
   * que abafa quando o jogador erra — o efeito do original, e o retorno mais
   * direto que existe sobre um erro — e o resto da banda, que não para.
   * Manter as sete faixas de um pacote de Rock Band separadas custaria
   * memória e pressão na thread de áudio sem que nada soubesse usá-las; ver
   * `stems.ts`.
   */
  async load(tracks: Array<{ url: string; role: StemRole }>) {
    this.disconnectStems()

    const decoded = await Promise.all(
      tracks.map(async ({ url, role }) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Falha ao carregar ${url}: ${response.status}`)
        const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer())
        return { role, buffer }
      }),
    )

    // Os sete arquivos de um pacote de Rock Band viram as duas faixas que o
    // jogo de fato distingue — ver `stems.ts`. O PCM sobrando é liberado
    // junto com os buffers de origem.
    const { ducked, rest } = groupStems(decoded)
    this.stems = []
    if (ducked.length > 0) {
      this.stems.push(this.makeStem('guitar', this.mixdown(ducked.map((s) => s.buffer))))
    }
    if (rest.length > 0) {
      this.stems.push(this.makeStem('backing', this.mixdown(rest.map((s) => s.buffer))))
    }
  }

  private makeStem(role: StemRole, buffer: AudioBuffer): Stem {
    const gain = this.ctx.createGain()
    gain.connect(this.gain)
    return { role, buffer, gain }
  }

  /**
   * Soma várias faixas numa só.
   *
   * Sem atenuação: são as mesmas faixas que já eram somadas na saída, e
   * dividir por quantidade deixaria a música mais baixa do que o charter
   * mixou. Uma faixa sozinha passa direto, sem cópia.
   */
  private mixdown(buffers: AudioBuffer[]): AudioBuffer {
    if (buffers.length === 1) return buffers[0]

    const channels = buffers.reduce((n, b) => Math.max(n, b.numberOfChannels), 1)
    const length = buffers.reduce((n, b) => Math.max(n, b.length), 0)
    const out = this.ctx.createBuffer(channels, length, this.ctx.sampleRate)

    for (let channel = 0; channel < channels; channel++) {
      const destination = out.getChannelData(channel)
      for (const buffer of buffers) {
        // Uma faixa mono entra nos dois lados; senão ela sairia só num.
        const source = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1))
        for (let i = 0; i < source.length; i++) destination[i] += source[i]
      }
    }

    return out
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
    // O efeito acompanha o volume geral, um pouco abaixo: ele existe para
    // avisar, não para assustar.
    this.sfx.gain.value = value * 0.6
  }

  /**
   * Baixa o som até o silêncio, em vez de cortá-lo.
   *
   * O fim de uma música cortado no meio do último acorde soa como falha
   * técnica. A sequência de encerramento acontece sobre este fecho.
   */
  fadeOut(seconds = 1.6) {
    const now = this.ctx.currentTime
    for (const node of [this.gain, this.sfx]) {
      const atual = node.gain.value
      node.gain.cancelScheduledValues(now)
      node.gain.setValueAtTime(atual, now)
      node.gain.linearRampToValueAtTime(0.0001, now + seconds)
    }
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
