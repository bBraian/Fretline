/**
 * O banco de efeitos gravados.
 *
 * Até aqui o projeto não embarcava nenhum arquivo de áudio: a faixa de
 * demonstração e os bipes de menu eram sintetizados, e isso valia por dois
 * motivos — nada para baixar e nada para licenciar. Os efeitos do jogo
 * quebram essa regra de propósito. Uma plateia gritando e um "you rock" não
 * se fazem com três osciladores, e tentar produz caricatura.
 *
 * O que continua valendo: quem toca é a mesa (`mixer.ts`), por um bus só,
 * abaixo do volume geral. Este arquivo não sabe o que é volume — ele carrega
 * amostras e as agenda no relógio do áudio.
 *
 * ## Duas etapas de carregamento
 *
 * Baixar não precisa de gesto do jogador; decodificar precisa de um
 * `AudioContext`, que só nasce no primeiro clique. Separar as duas coisas é
 * o que faz o primeiro efeito sair no tempo: os bytes já estão na memória
 * quando o contexto aparece, e o que sobra é a decodificação, de
 * milissegundos.
 */

/** Nome lógico → arquivo em `public/sfx/`. */
const FILES = {
  cash: 'cash.wav',
  crowdFail: 'crowd_fail_songR.wav',
  highwayRise: 'highway_riseR.wav',
  crowdSwell: 'medium_crowd_swell_01R.wav',
  notesRipple: 'notes_ripple_up_01.wav',
  scroll: 'scroll.wav',
  crowdCheer: 'sp_cheer1R.wav',
  ui01: 'ui_sound_01R.wav',
  ui05: 'ui_sound_05R.wav',
  ui06: 'ui_sound_06R.wav',
  ui09: 'ui_sound_09R.wav',
  youRock: 'you_rockR.wav',
} as const

export type SampleName = keyof typeof FILES

export const SAMPLE_NAMES = Object.keys(FILES) as SampleName[]

/** Um trecho de uma sequência encadeada. Ver `playSequence`. */
export interface Cue {
  name: SampleName
  /**
   * Instante, contado do início da sequência, em que este trecho começa a
   * baixar até o silêncio. Serve para a plateia não enterrar o começo da
   * música: o grito dura quase dez segundos e a aproximação, três.
   */
  fadeFrom?: number
  /** Quanto dura esse fecho. */
  fadeFor?: number
}

/**
 * Sorteio sem repetição fácil.
 *
 * Um saco embaralhado, não um dado: os itens saem numa ordem aleatória até
 * o saco esvaziar, e só então ele é remontado. Isso garante que cada som
 * apareça na mesma proporção e, principalmente, que nenhum saia duas vezes
 * seguidas — o dado repete o mesmo som duas e três vezes com facilidade, e
 * o erro de nota acontece em rajada, onde a repetição fica óbvia.
 *
 * A emenda entre duas voltas é o ponto fraco do saco: a volta pode terminar
 * em X e a seguinte começar em X. Por isso o novo embaralhamento nunca
 * começa pelo último item entregue.
 */
export class ShuffleBag<T> {
  private queue: T[] = []
  private last: T | undefined

  constructor(
    private readonly items: readonly T[],
    private readonly random: () => number = Math.random,
  ) {}

  next(): T {
    if (this.queue.length === 0) this.refill()
    const item = this.queue.pop() as T
    this.last = item
    return item
  }

  private refill() {
    const shuffled = [...this.items]
    // Fisher-Yates.
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    // O saco é consumido pelo fim, então quem sai primeiro é o último da
    // lista. Se for o mesmo que acabou de tocar, troca com o vizinho.
    if (shuffled.length > 1 && shuffled[shuffled.length - 1] === this.last) {
      const ultimo = shuffled.length - 1
      ;[shuffled[ultimo], shuffled[ultimo - 1]] = [shuffled[ultimo - 1], shuffled[ultimo]]
    }
    this.queue = shuffled
  }
}

/** Um efeito dentro de um `VoiceGroup`. */
interface Voice {
  buffer: AudioBuffer
  out: AudioNode
  /** Instante, no relógio do grupo, em que o começo do buffer toca. */
  origin: number
  /** Fecho até o silêncio, contado do começo do buffer. */
  fade?: { from: number; length: number }
  /** A fonte tocando agora; `null` enquanto pausado. */
  source: AudioBufferSourceNode | null
  gain: GainNode | null
}

/**
 * Efeitos que obedecem à pausa.
 *
 * Um `AudioBufferSourceNode` não pausa: ele só começa e para. Suspender o
 * contexto inteiro pausaria, mas o contexto é o da mesa, que também toca a
 * interface — e qualquer som de menu o acordaria, soltando a plateia no
 * meio da tela de pausa.
 *
 * Então o grupo tem um relógio próprio, o do contexto menos o tempo parado.
 * Cada efeito guarda em que instante desse relógio começou; pausar para as
 * fontes, e retomar recria cada uma no ponto em que estava — inclusive o que
 * ainda estava agendado para o futuro, como o fim de uma sequência, e o
 * fecho de volume que estivesse no meio do caminho.
 */
export class VoiceGroup {
  private voices = new Set<Voice>()
  /** Tempo parado acumulado. */
  private offset = 0
  private pausedAt: number | null = null

  get paused() {
    return this.pausedAt !== null
  }

  /** O relógio do grupo: o do contexto, sem contar as pausas. */
  private now(ctx: BaseAudioContext) {
    return (this.pausedAt ?? ctx.currentTime) - this.offset
  }

  /**
   * Toca `buffer` daqui a `delay` segundos do relógio do grupo.
   *
   * Pedido durante a pausa, o efeito fica esperando o `resume` na posição
   * em que nasceu, em vez de soar por cima dela.
   */
  play(
    ctx: BaseAudioContext,
    out: AudioNode,
    buffer: AudioBuffer,
    delay = 0,
    fade?: { from: number; length: number },
  ) {
    const voice: Voice = { buffer, out, origin: this.now(ctx) + delay, fade, source: null, gain: null }
    this.voices.add(voice)
    if (this.pausedAt === null) this.start(ctx, voice)
  }

  pause(ctx: BaseAudioContext) {
    if (this.pausedAt !== null) return
    this.pausedAt = ctx.currentTime
    for (const voice of this.voices) this.silence(voice)
  }

  resume(ctx: BaseAudioContext) {
    if (this.pausedAt === null) return
    this.offset += ctx.currentTime - this.pausedAt
    this.pausedAt = null
    for (const voice of [...this.voices]) this.start(ctx, voice)
  }

  /** Cala tudo e esquece: nada do que estava no grupo volta num `resume`. */
  stop() {
    for (const voice of this.voices) this.silence(voice)
    this.voices.clear()
    this.offset = 0
    this.pausedAt = null
  }

  private silence(voice: Voice) {
    const { source, gain } = voice
    // Zerar antes de parar: o `onended` que vem depois vê que a fonte já
    // não é a da voz e não a tira do grupo.
    voice.source = null
    voice.gain = null
    if (!source) return
    try {
      source.stop()
    } catch {
      // Já tinha parado.
    }
    source.disconnect()
    gain?.disconnect()
  }

  private start(ctx: BaseAudioContext, voice: Voice) {
    const now = ctx.currentTime
    // Onde o começo do buffer cai no relógio do contexto, agora.
    const at = voice.origin + this.offset
    const into = Math.max(0, now - at)
    if (into >= voice.buffer.duration) {
      this.voices.delete(voice)
      return
    }

    const startAt = Math.max(now, at)
    const gain = ctx.createGain()
    if (voice.fade) {
      const fadeStart = at + voice.fade.from
      const fadeEnd = fadeStart + voice.fade.length
      gain.gain.setValueAtTime(levelOnFade(startAt, fadeStart, fadeEnd), startAt)
      if (fadeEnd > startAt) {
        if (fadeStart > startAt) gain.gain.setValueAtTime(1, fadeStart)
        gain.gain.linearRampToValueAtTime(0.0001, fadeEnd)
      }
    }

    const source = ctx.createBufferSource()
    source.buffer = voice.buffer
    source.connect(gain)
    gain.connect(voice.out)
    source.onended = () => {
      if (voice.source !== source) return
      this.voices.delete(voice)
      gain.disconnect()
    }
    source.start(startAt, into)
    voice.source = source
    voice.gain = gain
  }
}

/** O volume no meio de um fecho linear até o silêncio. */
function levelOnFade(t: number, fadeStart: number, fadeEnd: number) {
  if (t <= fadeStart) return 1
  if (t >= fadeEnd) return 0.0001
  return 1 - ((t - fadeStart) / (fadeEnd - fadeStart)) * (1 - 0.0001)
}

/** Onde os arquivos moram, servidos por `public/`. */
const BASE = '/sfx/'

export class SampleBank {
  private bytes = new Map<SampleName, Promise<ArrayBuffer | null>>()
  private buffers = new Map<SampleName, AudioBuffer>()
  private decoding = new Map<SampleName, Promise<AudioBuffer | null>>()

  /**
   * Começa a baixar tudo. Não precisa de contexto nem de gesto — é só rede,
   * e são menos de dois megabytes no total.
   */
  prefetch() {
    for (const name of SAMPLE_NAMES) this.fetchBytes(name)
  }

  /** Decodifica o que já chegou, para o primeiro efeito não pagar a espera. */
  preload(ctx: AudioContext) {
    for (const name of SAMPLE_NAMES) void this.buffer(ctx, name)
  }

  private fetchBytes(name: SampleName): Promise<ArrayBuffer | null> {
    const existente = this.bytes.get(name)
    if (existente) return existente

    const pedido = fetch(BASE + FILES[name])
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status}`)
        return response.arrayBuffer()
      })
      .catch((erro) => {
        // Um efeito que falta não pode derrubar o jogo. Ele simplesmente
        // não toca, e o console diz qual foi.
        console.warn(`Efeito sonoro ausente: ${FILES[name]}`, erro)
        return null
      })

    this.bytes.set(name, pedido)
    return pedido
  }

  /** O buffer decodificado, ou `null` se o arquivo não existir. */
  private buffer(ctx: AudioContext, name: SampleName): Promise<AudioBuffer | null> {
    const pronto = this.buffers.get(name)
    if (pronto) return Promise.resolve(pronto)

    const andamento = this.decoding.get(name)
    if (andamento) return andamento

    const trabalho = this.fetchBytes(name)
      .then(async (bytes) => {
        if (!bytes) return null
        // `decodeAudioData` consome o ArrayBuffer, e o mesmo arquivo pode
        // ser decodificado de novo por outro contexto — a cópia preserva o
        // original no cache de bytes.
        const buffer = await ctx.decodeAudioData(bytes.slice(0))
        this.buffers.set(name, buffer)
        return buffer
      })
      .catch((erro) => {
        console.warn(`Não consegui decodificar ${FILES[name]}`, erro)
        return null
      })
      .finally(() => this.decoding.delete(name))

    this.decoding.set(name, trabalho)
    return trabalho
  }

  /**
   * Efeitos soltos, que nunca pausam: os de menu.
   *
   * Passam pelo mesmo `VoiceGroup` que os de palco para haver um caminho só
   * de tocar amostra — ninguém chama `pause` neste.
   */
  private loose = new VoiceGroup()

  /**
   * Toca um efeito.
   *
   * Cada toque cria a própria fonte: dois efeitos ao mesmo tempo somam, e
   * nenhum corta o outro nem a música. Se o sample ainda não estiver
   * decodificado, toca assim que ficar pronto — com o `prefetch` no lugar
   * isso só acontece nos primeiros instantes da sessão.
   *
   * Com `group`, o efeito obedece à pausa dele.
   */
  play(ctx: AudioContext, out: AudioNode, name: SampleName, group = this.loose) {
    void this.buffer(ctx, name).then((buffer) => {
      if (!buffer || ctx.state === 'closed') return
      group.play(ctx, out, buffer)
    })
  }

  /**
   * Toca vários em fila, cada um começando quando o anterior termina.
   *
   * O encadeamento é feito no relógio do `AudioContext`, com todas as fontes
   * agendadas de uma vez — um `setTimeout` entre um som e o outro produziria
   * a lacuna audível que justamente não pode existir entre a aproximação da
   * pista e o arpejo das notas.
   */
  async playSequence(ctx: AudioContext, out: AudioNode, cues: Cue[], group = this.loose) {
    const buffers = await Promise.all(cues.map((cue) => this.buffer(ctx, cue.name)))
    if (ctx.state === 'closed') return

    const inicio = 0.05
    let deslocamento = 0

    for (let i = 0; i < cues.length; i++) {
      const buffer = buffers[i]
      // Um arquivo que faltou não desloca a fila: os seguintes sobem no
      // lugar dele, e a sequência continua fazendo sentido.
      if (!buffer) continue

      const cue = cues[i]
      // O fecho é contado do começo da sequência; a voz o quer contado do
      // começo dela.
      const fade =
        cue.fadeFrom === undefined
          ? undefined
          : { from: Math.max(0, cue.fadeFrom - deslocamento), length: cue.fadeFor ?? 1 }
      group.play(ctx, out, buffer, inicio + deslocamento, fade)
      deslocamento += buffer.duration
    }
  }
}
