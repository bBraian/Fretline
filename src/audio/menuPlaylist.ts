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
  /**
   * Duração em segundos, quando o `song.ini` declara.
   *
   * Vale mais que a do elemento de mídia, e não é redundância: um `.opus`
   * num container sem cabeçalho de duração responde `Infinity` até ter
   * baixado quase tudo, e com `Infinity` não há meio a calcular — o trecho
   * sairia do começo da música, que é justamente o que não se quer.
   */
  duration?: number
  /**
   * Onde começar, em segundos. Sem isto, o trecho sai do meio da música.
   *
   * É por aqui que entra o `preview_start_time` do `song.ini` — o ponto que
   * quem charteou escolheu para representar a faixa.
   */
  startAt?: number
}

/** Quanto dura cada trecho. */
const EXCERPT = 30
const FADE_IN = 2
const FADE_OUT = 3
/**
 * O preview entra mais rápido que a música de fundo.
 *
 * Ele é resposta a um gesto — o jogador parou em cima de uma música e
 * esperou. Dois segundos de fade depois de dois segundos de espera fazem o
 * jogo parecer lento.
 */
const PREVIEW_FADE_IN = 0.6
/** Quanto esperar pelos metadados antes de desistir da faixa. */
const METADATA_TIMEOUT = 8000

export class MenuPlaylist {
  private el: HTMLAudioElement | null = null
  private gain: GainNode | null = null
  private bag: ShuffleBag<MenuTrack> | null = null
  private tracks: MenuTrack[] = []

  private running = false
  private timer = 0
  /**
   * Modo preview: a fila fica suspensa e quem manda é `forced`.
   *
   * O preview usa o mesmo elemento de áudio da música de fundo, e isso não
   * é economia — é o que torna dois previews ao mesmo tempo, ou um preview
   * por cima da música de menu, impossíveis de acontecer. Não há um segundo
   * lugar de onde possa sair som.
   */
  private previewing = false
  private forced: MenuTrack | null = null
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
  /**
   * O navegador recusou o `play()` por falta de gesto. Não é defeito da
   * faixa, e passar para a próxima só gastaria a lista inteira em recusas:
   * a trilha para e avisa, e quem a religa é o primeiro gesto de verdade.
   * Sair da abertura pelo controle é o caso comum — botão de gamepad não
   * conta como gesto para o navegador.
   */
  onBlocked: (() => void) | null = null

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

  /**
   * Toca esta faixa em vez da fila, em laço, até `endPreview`.
   *
   * `null` entra no modo preview em silêncio — é o estado entre uma música
   * e a seguinte, enquanto o jogador navega e nenhuma completou os dois
   * segundos parada.
   */
  preview(ctx: AudioContext, out: AudioNode, track: MenuTrack | null) {
    this.previewing = true
    this.forced = track
    // Invalida o que estiver agendado: o trecho anterior para agora.
    this.token++
    window.clearTimeout(this.timer)

    if (!track) {
      this.hush()
      return
    }
    this.running = true
    void this.advance(ctx, out)
  }

  /** Sai do modo preview e devolve o fundo do menu à fila. */
  endPreview(ctx: AudioContext, out: AudioNode) {
    if (!this.previewing) return
    this.previewing = false
    this.forced = null
    this.token++
    window.clearTimeout(this.timer)

    if (this.bag) {
      this.running = true
      void this.advance(ctx, out)
      return
    }
    this.stop(0.25)
  }

  /** Cala sem desmontar: o elemento continua pronto para o próximo trecho. */
  private hush(fade = 0.25) {
    const gain = this.gain
    const el = this.el
    if (!gain || !el) return

    const token = this.token
    const now = gain.context.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0.0001, now + fade)
    window.setTimeout(() => {
      if (this.token === token) el.pause()
    }, fade * 1000 + 40)
  }

  /** Para e libera a transmissão. O elemento é reaproveitado. */
  stop(fade = 0.4) {
    this.previewing = false
    this.forced = null
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
    // Sem isto, um arquivo de outra origem — o storage da versão hospedada —
    // atravessa o `createMediaElementSource` como silêncio.
    el.crossOrigin = 'anonymous'
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

  /**
   * Onde começa o trecho.
   *
   * Com um ponto declarado, é ele — recuado só o bastante para o trecho
   * caber antes do fim. Sem ele, o meio: o começo de uma música costuma ser
   * a parte que ainda não é a música.
   */
  private excerptStart(duration: number, startAt?: number) {
    const cabe = Number.isFinite(duration) && duration > EXCERPT
    if (startAt !== undefined && startAt >= 0) {
      return cabe ? Math.min(startAt, duration - EXCERPT) : startAt
    }
    return cabe ? (duration - EXCERPT) / 2 : 0
  }

  private async advance(ctx: AudioContext, out: AudioNode) {
    if (!this.running) return

    const track = this.previewing ? this.forced : (this.bag?.next() ?? null)
    // Modo preview sem faixa é silêncio de propósito: o jogador ainda não
    // parou tempo suficiente em nenhuma música.
    if (!track) return

    const token = ++this.token
    const el = this.connect(ctx, out)
    const gain = this.gain!

    try {
      el.src = track.url
      el.load()
      // Espera os metadados de qualquer forma: sem eles não dá para
      // posicionar a faixa, mesmo sabendo a duração por fora.
      const medida = await metadata(el)
      if (token !== this.token || !this.running) return

      const declarada = track.duration
      const duration =
        declarada !== undefined && Number.isFinite(declarada) && declarada > 0
          ? declarada
          : medida

      const start = this.excerptStart(duration, track.startAt)
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

      const fadeIn = this.previewing ? PREVIEW_FADE_IN : FADE_IN
      const now = ctx.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(1, now + fadeIn)
      gain.gain.setValueAtTime(1, now + Math.max(fadeIn, span - FADE_OUT))
      gain.gain.linearRampToValueAtTime(0.0001, now + span)

      // No preview, a volta a este mesmo ponto repete a faixa em laço: o
      // jogador pode ficar parado na música mais tempo que o trecho dura.
      this.timer = window.setTimeout(() => {
        if (token === this.token) void this.advance(ctx, out)
      }, span * 1000)

      // Um clipe mais curto que o trecho acaba antes do prazo. Sem isto, o
      // resto do prazo seria silêncio: um preview transmitido sem byte
      // range tem duração `Infinity`, e o prazo cai nos 30 s cheios.
      el.onended = () => {
        if (token !== this.token) return
        window.clearTimeout(this.timer)
        void this.advance(ctx, out)
      }
    } catch (erro) {
      // Uma faixa que não abre passa a vez. Se nenhuma abrir, o menu não
      // pode ficar tentando para sempre nem em silêncio.
      if (token !== this.token || !this.running) return
      if ((erro as { name?: string } | null)?.name === 'NotAllowedError') {
        this.running = false
        this.onBlocked?.()
        return
      }
      // Um preview que não abre simplesmente não toca. Insistir renderia um
      // laço de tentativas sobre uma música que o jogador já pode ter
      // deixado para trás.
      if (this.previewing) {
        this.hush()
        return
      }
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
