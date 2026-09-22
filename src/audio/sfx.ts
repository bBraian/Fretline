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
   * Toca um efeito.
   *
   * Cada toque cria a própria fonte: dois efeitos ao mesmo tempo somam, e
   * nenhum corta o outro nem a música. Se o sample ainda não estiver
   * decodificado, toca assim que ficar pronto — com o `prefetch` no lugar
   * isso só acontece nos primeiros instantes da sessão.
   */
  play(ctx: AudioContext, out: AudioNode, name: SampleName) {
    void this.buffer(ctx, name).then((buffer) => {
      if (!buffer || ctx.state === 'closed') return
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(out)
      source.start()
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
  async playSequence(ctx: AudioContext, out: AudioNode, cues: Cue[]) {
    const buffers = await Promise.all(cues.map((cue) => this.buffer(ctx, cue.name)))
    if (ctx.state === 'closed') return

    const inicio = ctx.currentTime + 0.05
    let deslocamento = 0

    for (let i = 0; i < cues.length; i++) {
      const buffer = buffers[i]
      // Um arquivo que faltou não desloca a fila: os seguintes sobem no
      // lugar dele, e a sequência continua fazendo sentido.
      if (!buffer) continue

      const cue = cues[i]
      const quando = inicio + deslocamento
      const source = ctx.createBufferSource()
      source.buffer = buffer

      if (cue.fadeFrom !== undefined) {
        const ganho = ctx.createGain()
        const fadeAt = inicio + cue.fadeFrom
        ganho.gain.setValueAtTime(1, quando)
        ganho.gain.setValueAtTime(1, Math.max(quando, fadeAt))
        ganho.gain.linearRampToValueAtTime(
          0.0001,
          Math.max(quando, fadeAt) + (cue.fadeFor ?? 1),
        )
        source.connect(ganho)
        ganho.connect(out)
      } else {
        source.connect(out)
      }

      source.start(quando)
      deslocamento += buffer.duration
    }
  }
}
