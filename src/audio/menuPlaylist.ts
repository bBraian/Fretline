/**
 * A música de fundo dos menus: trechos das músicas da biblioteca.
 *
 * Antes era um laço de osciladores em lá menor. Funcionava, mas dizia
 * respeito a nada: a pessoa que importou trinta músicas ouvia a mesma
 * progressão sintetizada enquanto escolhia entre elas. Agora o menu toca o
 * que a pessoa vai tocar.
 *
 * ## Por que um `<audio>` e não um `AudioBuffer`
 *
 * O resto do projeto decodifica áudio para `AudioBuffer`, porque a partida
 * precisa de amostragem exata para o relógio. O menu não precisa de nada
 * disso — e decodificar uma música de quatro minutos inteira para ouvir
 * trinta segundos dela custa dezenas de megabytes de PCM por faixa, num
 * momento em que o jogo não está fazendo mais nada de útil com essa
 * memória. Um elemento `<audio>` transmite, posiciona em qualquer ponto sem
 * baixar o que veio antes, e entra no mesmo barramento pelo
 * `createMediaElementSource`, que é o que mantém o volume geral mandando.
 *
 * ## O trecho
 *
 * Do meio, e não do começo: o começo de uma música é justamente a parte que
 * ainda não é a música — contagem, silêncio, um violão sozinho. O meio é
 * onde a banda inteira está tocando.
 */

import { ShuffleBag } from './sfx'

export interface MenuTrack {
  id: string
  url: string
}

/** Quanto dura cada trecho. */
const EXCERPT = 30
const FADE_IN = 2
const FADE_OUT = 3
/** Quanto esperar pelos metadados antes de desistir da faixa. */
const METADATA_TIMEOUT = 8000

export class MenuPlaylist {
  private el: HTMLAudioElement | null = null
  private gain: GainNode | null = null
  private bag: ShuffleBag<MenuTrack> | null = null
  private tracks: MenuTrack[] = []

  private running = false
  private timer = 0
  /** Cada troca invalida os avisos pendentes da faixa anterior. */
  private token = 0
  /** Faixas seguidas que não tocaram. Ver `advance`. */
  private failures = 0

  /**
   * Chamado quando nenhuma faixa da biblioteca tocou.
   *
   * Arquivo corrompido, codec que o navegador não abre, URL de blob que
   * expirou: o menu não pode ficar em silêncio por causa disso, e quem sabe
   * o que colocar no lugar é a mesa.
   */
  onGiveUp: (() => void) | null = null

  setTracks(tracks: MenuTrack[]) {
    const mudou =
      tracks.length !== this.tracks.length ||
      tracks.some((t, i) => t.url !== this.tracks[i]?.url)
    if (!mudou) return

    this.tracks = tracks
    this.bag = tracks.length ? new ShuffleBag(tracks) : null
    this.failures = 0
  }

  get hasTracks() {
    return this.tracks.length > 0
  }

  get isRunning() {
    return this.running
  }

  /** Começa, ou não faz nada se já estiver tocando. */
  start(ctx: AudioContext, out: AudioNode) {
    if (this.running || !this.bag) return
    this.running = true
    void this.advance(ctx, out)
  }

  /** Para e libera a transmissão. O elemento é reaproveitado. */
  stop(fade = 0.4) {
    if (!this.running) return
    this.running = false
    this.token++
    window.clearTimeout(this.timer)

    const el = this.el
    const gain = this.gain
    if (!el || !gain) return

    const ctx = gain.context
    const now = ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0.0001, now + fade)

    window.setTimeout(() => {
      // Só solta a transmissão se ninguém religou a música nesse meio-tempo.
      if (this.running) return
      el.pause()
      el.removeAttribute('src')
      el.load()
    }, fade * 1000 + 60)
  }

  /**
   * O elemento e a ligação com o barramento, criados uma vez só.
   *
   * `createMediaElementSource` não pode ser chamado duas vezes para o mesmo
   * elemento — a segunda chamada lança. Por isso o elemento é reaproveitado
   * de uma faixa para a outra, trocando só o `src`.
   */
  private connect(ctx: AudioContext, out: AudioNode): HTMLAudioElement {
    if (this.el && this.gain) {
      this.gain.disconnect()
      this.gain.connect(out)
      return this.el
    }

    const el = new Audio()
    el.preload = 'metadata'
    // A faixa é cortada por tempo, não pelo fim do arquivo; o laço nativo
    // atrapalharia o corte.
    el.loop = false

    const gain = ctx.createGain()
    gain.gain.value = 0.0001
    ctx.createMediaElementSource(el).connect(gain)
    gain.connect(out)

    this.el = el
    this.gain = gain
    return el
  }

  /** Onde começa o trecho: centrado, para cair no meio da música. */
  private excerptStart(duration: number) {
    if (!Number.isFinite(duration) || duration <= EXCERPT) return 0
    return (duration - EXCERPT) / 2
  }

  private async advance(ctx: AudioContext, out: AudioNode) {
    if (!this.running || !this.bag) return

    const track = this.bag.next()
    const token = ++this.token
    const el = this.connect(ctx, out)
    const gain = this.gain!

    try {
      el.src = track.url
      el.load()
      const duration = await metadata(el)
      if (token !== this.token || !this.running) return

      const start = this.excerptStart(duration)
      el.currentTime = start
      await el.play()
      if (token !== this.token || !this.running) {
        el.pause()
        return
      }

      this.failures = 0

      // Quanto deste trecho de fato existe: uma música de vinte segundos
      // não rende trinta.
      const span = Number.isFinite(duration)
        ? Math.max(4, Math.min(EXCERPT, duration - start))
        : EXCERPT

      const now = ctx.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(1, now + FADE_IN)
      gain.gain.setValueAtTime(1, now + Math.max(FADE_IN, span - FADE_OUT))
      gain.gain.linearRampToValueAtTime(0.0001, now + span)

      this.timer = window.setTimeout(() => {
        if (token === this.token) void this.advance(ctx, out)
      }, span * 1000)
    } catch {
      // Uma faixa que não abre passa a vez. Se nenhuma abrir, o menu não
      // pode ficar tentando para sempre nem em silêncio.
      if (token !== this.token || !this.running) return
      this.failures++
      if (this.failures >= this.tracks.length) {
        this.running = false
        this.onGiveUp?.()
        return
      }
      this.timer = window.setTimeout(() => {
        if (token === this.token) void this.advance(ctx, out)
      }, 250)
    }
  }
}

/** Espera os metadados da faixa, com prazo. Devolve a duração. */
function metadata(el: HTMLAudioElement): Promise<number> {
  if (el.readyState >= 1) return Promise.resolve(el.duration)

  return new Promise((resolve, reject) => {
    const limpar = () => {
      el.removeEventListener('loadedmetadata', ok)
      el.removeEventListener('error', falhou)
      window.clearTimeout(prazo)
    }
    const ok = () => {
      limpar()
      resolve(el.duration)
    }
    const falhou = () => {
      limpar()
      reject(new Error('faixa não abriu'))
    }
    const prazo = window.setTimeout(falhou, METADATA_TIMEOUT)
    el.addEventListener('loadedmetadata', ok)
    el.addEventListener('error', falhou)
  })
}
