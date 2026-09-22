/**
 * Mesa de som: volume geral, música de fundo dos menus e efeitos sonoros.
 *
 * Existe um lugar só onde o volume mora, e é aqui. A tela de ajustes escreve
 * nele, o tocador da música lê dele, e quem quiser saber quando mudou se
 * inscreve. Antes o volume era passado ao tocador uma vez, no início da
 * música — mexer no controle durante a partida não tinha efeito nenhum, e
 * nada além da música obedecia.
 *
 * ## Sintetizado e gravado, lado a lado
 *
 * A música de fundo continua sendo osciladores: ela toca em laço por tempo
 * indeterminado, e um arquivo em laço custa download e memória para dizer a
 * mesma coisa. Já os efeitos do jogo são amostras de verdade, em
 * `public/sfx/` — uma plateia gritando e um "you rock" não se fazem com três
 * osciladores, e tentar produz caricatura. Ver `sfx.ts`.
 *
 * Sobrou um sintetizado no meio dos gravados: o `tweak` dos controles
 * deslizantes. Ele dispara a cada passo do controle, dezenas de vezes por
 * segundo de arrasto, e uma amostra ali vira serra elétrica.
 *
 * ## Contexto próprio
 *
 * A mesa tem o seu `AudioContext`, separado do que toca a música da
 * partida. São ciclos de vida diferentes — o da partida nasce e morre com a
 * tela de jogo, enquanto este vive enquanto a aba estiver aberta. O volume
 * geral é que liga os dois.
 */

import { MenuPlaylist, type MenuTrack } from './menuPlaylist'
import { SampleBank, ShuffleBag, type SampleName } from './sfx'

/** Quanto a música de menu toca abaixo do volume geral. */
const MENU_MUSIC_RATIO = 0.5

/**
 * Por quanto tempo um "voltar" cala o som de "abrir menu".
 *
 * Voltar ao menu é as duas coisas ao mesmo tempo: sai de uma tela e entra em
 * outra. Sem esta folga, o botão de voltar dispararia o par de sons um em
 * cima do outro, que é o defeito mais audível que este sistema pode ter.
 */
const BACK_MUTES_ENTER = 0.4

/** O efeito gravado de cada som de menu. O que falta aqui é sintetizado. */
const MENU_SAMPLE: Partial<Record<MenuSound, SampleName>> = {
  move: 'scroll',
  back: 'ui09',
  enter: 'ui01',
  // Recusar é um parente de voltar: as duas coisas dizem "não foi por aí".
  // Mas `blocked` não navega, então não cala o som de abrir menu como o
  // `back` faz.
  blocked: 'ui09',
}

/** O efeito gravado de cada aviso de jogo. */
const CUE_SAMPLE: Record<GameCue, SampleName> = {
  cash: 'cash',
  win: 'youRock',
  fail: 'crowdFail',
  // A plateia levanta junto com o boost. Toca aqui, no contexto da mesa, e
  // não no da partida: é reação de público, e não pode disputar espaço com
  // o corte da faixa de guitarra nem morrer com o contexto da música.
  boost: 'crowdSwell',
}

type Listener = (volume: number) => void

class Mixer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null

  private volume = 0.8
  private menuMusicOn = true
  private musicNodes: Array<{ stop(): void }> = []
  private listeners = new Set<Listener>()

  private bank = new SampleBank()
  /** Instante do último "voltar", para não somar o som de "abrir menu". */
  private lastBack = -Infinity

  /** Confirmar sai em duas versões, sorteadas sem repetir. */
  private selectBag = new ShuffleBag<SampleName>(['ui05', 'ui06'])

  /** Trechos das músicas da biblioteca; ver `menuPlaylist.ts`. */
  private playlist = new MenuPlaylist()

  constructor() {
    // Nenhuma faixa da biblioteca abriu — codec desconhecido, arquivo
    // corrompido, URL de blob expirada. O menu não fica em silêncio por
    // isso: esquece a lista e volta para o laço sintetizado.
    this.playlist.onGiveUp = () => {
      this.playlist.setTracks([])
      this.startMenuMusic()
    }
  }

  /**
   * O contexto só nasce no primeiro gesto do jogador.
   *
   * Navegador nenhum deixa tocar som antes disso, e criar o contexto cedo
   * só produz um contexto suspenso que depois precisa ser acordado.
   */
  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return this.ctx
    }
    if (typeof AudioContext === 'undefined') return null

    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    this.master = this.ctx.createGain()
    this.master.gain.value = this.volume
    this.master.connect(this.ctx.destination)

    this.musicGain = this.ctx.createGain()
    this.musicGain.gain.value = this.menuMusicOn ? MENU_MUSIC_RATIO : 0
    this.musicGain.connect(this.master)

    this.sfxGain = this.ctx.createGain()
    this.sfxGain.gain.value = 0.55
    this.sfxGain.connect(this.master)

    // Os bytes já vieram pelo `warm()`; aqui só falta decodificar, o que
    // custa milissegundos. É o que faz o primeiro efeito sair no tempo.
    this.bank.preload(this.ctx)

    return this.ctx
  }

  getVolume() {
    return this.volume
  }

  /**
   * Volume geral, de 0 a 1.
   *
   * Aplicado na hora, e avisado a quem depende — é o que faz o controle da
   * tela de ajustes ter efeito enquanto a música toca.
   */
  setVolume(value: number) {
    this.volume = Math.min(1, Math.max(0, value))
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02)
    }
    for (const listener of this.listeners) listener(this.volume)
  }

  /** Avisa quando o volume muda. Devolve a função que cancela a inscrição. */
  onVolumeChange(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * As músicas da biblioteca, para o menu tocar trechos delas.
   *
   * Quem passa a lista é a interface, que é quem conhece a biblioteca —
   * a mesa não importa de `songs/`, senão as duas camadas se enlaçariam.
   */
  setMenuTracks(tracks: MenuTrack[]) {
    const tinha = this.playlist.hasTracks
    this.playlist.setTracks(tracks)

    // A pasta `songs/` é lida depois que o menu já está no ar, então a
    // primeira coisa que toca é sempre o laço sintetizado. Quando as
    // músicas chegam, elas tomam o lugar dele — mas só se ele estiver
    // tocando de fato: durante a partida a música de menu está parada, e
    // ressuscitá-la aqui colocaria duas músicas no palco ao mesmo tempo.
    if (!tinha && this.playlist.hasTracks && this.menuMusicOn && this.musicNodes.length) {
      this.startMenuMusic()
    }
  }

  setMenuMusicEnabled(enabled: boolean) {
    this.menuMusicOn = enabled

    if (!enabled) {
      // Desligar é parar de verdade, e não só abaixar o volume: a lista
      // transmite um arquivo, e deixá-la tocando muda gasta banda à toa.
      this.stopMenuMusic(0.25)
      if (this.musicGain && this.ctx) {
        this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15)
      }
      return
    }

    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(MENU_MUSIC_RATIO, this.ctx.currentTime, 0.15)
    }
    this.startMenuMusic()
  }

  /**
   * Liga a música de fundo, se já não estiver tocando.
   *
   * Chamar de novo não empilha uma segunda instância — é o que evita duas
   * músicas sobrepostas ao andar pelas telas.
   *
   * Com a biblioteca carregada, toca trechos das músicas de verdade; sem
   * ela — antes da varredura da pasta, ou num build estático sem pasta
   * nenhuma — cai no laço sintetizado.
   */
  startMenuMusic() {
    if (!this.menuMusicOn) return
    const ctx = this.ensure()
    if (!ctx || !this.musicGain) return

    if (this.playlist.hasTracks) {
      this.stopLoop()
      this.playlist.start(ctx, this.musicGain)
      return
    }

    if (this.musicNodes.length) return
    this.musicNodes = buildMenuLoop(ctx, this.musicGain)
  }

  /** Derruba o laço sintetizado na hora, sem fecho. */
  private stopLoop() {
    for (const node of this.musicNodes) node.stop()
    this.musicNodes = []
  }

  /** Desliga a música com um fecho suave, para entrar no palco. */
  stopMenuMusic(fade = 0.4) {
    // A lista tem o próprio controle de ganho e o próprio fecho.
    this.playlist.stop(fade)

    if (!this.musicNodes.length || !this.ctx || !this.musicGain) {
      this.musicNodes = []
      return
    }
    const now = this.ctx.currentTime
    this.musicGain.gain.cancelScheduledValues(now)
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now)
    this.musicGain.gain.linearRampToValueAtTime(0, now + fade)

    const nodes = this.musicNodes
    this.musicNodes = []
    setTimeout(() => {
      for (const node of nodes) node.stop()
      if (this.musicGain && this.ctx && this.menuMusicOn) {
        this.musicGain.gain.setValueAtTime(MENU_MUSIC_RATIO, this.ctx.currentTime)
      }
    }, fade * 1000 + 60)
  }

  /**
   * Começa a baixar os efeitos.
   *
   * Separado do `ensure` de propósito: baixar não precisa de gesto do
   * jogador, e adiantar isso para a abertura da aba é o que evita o primeiro
   * clique sair mudo.
   */
  warm() {
    this.bank.prefetch()
  }

  /** Um efeito curto de menu. */
  play(sound: MenuSound) {
    const ctx = this.ensure()
    if (!ctx || !this.sfxGain) return

    if (sound === 'back') this.lastBack = ctx.currentTime
    if (sound === 'enter' && ctx.currentTime - this.lastBack < BACK_MUTES_ENTER) return

    if (sound === 'select') {
      this.bank.play(ctx, this.sfxGain, this.selectBag.next())
      return
    }

    const sample = MENU_SAMPLE[sound]
    if (sample) this.bank.play(ctx, this.sfxGain, sample)
    else playTweak(ctx, this.sfxGain)
  }

  /** Um aviso do jogo: compra, derrota, vitória. */
  playCue(cue: GameCue) {
    const ctx = this.ensure()
    if (!ctx || !this.sfxGain) return
    this.bank.play(ctx, this.sfxGain, CUE_SAMPLE[cue])
  }

  /**
   * O preview da tela de seleção: toca esta música, em laço, até sair.
   *
   * `null` mantém o modo preview em silêncio — é o estado enquanto o
   * jogador navega e nenhuma música completou os dois segundos parada.
   *
   * **Não** obedece ao interruptor de música de menu. O preview não é
   * trilha: é a resposta a um gesto, o jeito de ouvir o que se está
   * escolhendo. Quem desligou a música de fundo desligou o que toca
   * sozinho, não o que ele pediu. O volume geral continua mandando.
   */
  playPreview(track: MenuTrack | null) {
    const ctx = this.ensure()
    if (!ctx || !this.musicGain) return

    // O barramento da música pode estar zerado pelo interruptor; o preview
    // o reabre enquanto durar, e `endPreview` devolve o que era.
    this.musicGain.gain.setTargetAtTime(MENU_MUSIC_RATIO, ctx.currentTime, 0.08)
    // O laço sintetizado sai de cena: o preview é a música que o jogador
    // está olhando, e não divide o palco com nada.
    this.stopLoop()
    this.playlist.preview(ctx, this.musicGain, track)
  }

  /** Sai do preview e devolve o fundo do menu. */
  endPreview() {
    const ctx = this.ctx
    if (!ctx || !this.musicGain) return

    this.musicGain.gain.setTargetAtTime(
      this.menuMusicOn ? MENU_MUSIC_RATIO : 0,
      ctx.currentTime,
      0.1,
    )
    // Com a trilha desligada não há para onde voltar, e deixar a fila
    // tocando em volume zero seria transmitir um arquivo para ninguém.
    if (!this.menuMusicOn) {
      this.playlist.stop(0.25)
      return
    }
    this.playlist.endPreview(ctx, this.musicGain)
    // Sem fila não há para onde voltar: o laço sintetizado reassume.
    if (!this.playlist.hasTracks) this.startMenuMusic()
  }

  /**
   * Silêncio total do menu, para entrar no palco.
   *
   * O roteador já manda parar a música ao trocar de tela, mas isso é uma
   * ordem que depende de a tela certa estar montada na hora certa. Esta é a
   * garantia de quem vai tocar: nada de menu, nada de preview, agora.
   */
  silenceMenu() {
    this.playlist.stop(0.2)
    this.stopLoop()
  }

  /**
   * A abertura de uma música: a pista sobe, as notas passam e a plateia
   * grita, nessa ordem, emendadas.
   *
   * Toca no contexto da mesa, não no da música, e é isso que a mantém viva
   * enquanto a tela de jogo monta e destrói o contexto dela.
   *
   * O grito dura quase dez segundos e a aproximação, três: ele atravessa o
   * começo da música de propósito — é assim que soa uma plateia de verdade —
   * mas desce até o silêncio logo depois, para não enterrar o primeiro
   * compasso.
   */
  playSongIntro(leadIn: number) {
    const ctx = this.ensure()
    if (!ctx || !this.sfxGain) return
    void this.bank.playSequence(ctx, this.sfxGain, [
      { name: 'highwayRise' },
      { name: 'notesRipple' },
      { name: 'crowdCheer', fadeFrom: leadIn, fadeFor: 1.5 },
    ])
  }
}

export type MenuSound = 'move' | 'select' | 'back' | 'enter' | 'blocked' | 'tweak'
export type GameCue = 'cash' | 'fail' | 'win' | 'boost'

/**
 * O único efeito que continua sintetizado.
 *
 * Os controles deslizantes dos ajustes disparam um destes por passo, dezenas
 * de vezes num arrasto. Uma amostra nessa cadência vira serra elétrica; um
 * oscilador de 50ms, não.
 */
function playTweak(ctx: AudioContext, out: GainNode) {
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(out)

  osc.type = 'sine'
  osc.frequency.setValueAtTime(720, now)
  osc.frequency.exponentialRampToValueAtTime(760, now + 0.05)

  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.22, now + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05)

  osc.start(now)
  osc.stop(now + 0.07)
}

/**
 * A música de reserva: um laço de baixo e acordes, em menor, lento.
 *
 * É o que toca enquanto a pasta `songs/` ainda está sendo lida, e o que
 * sobra quando não há pasta nenhuma — num build estático, ou numa
 * instalação sem músicas importadas. Feita para não disputar atenção: sem
 * percussão e sem melodia aguda, que são as duas coisas que cansam quem
 * está lendo uma lista de músicas.
 */
function buildMenuLoop(ctx: AudioContext, out: GainNode): Array<{ stop(): void }> {
  const tempo = 84
  const beat = 60 / tempo
  const bar = beat * 4
  const bars = 8
  const loop = bar * bars

  // Uma progressão menor, cíclica: lá menor, fá, dó, sol.
  const roots = [57, 53, 48, 55]
  const nodes: Array<{ stop(): void }> = []
  const start = ctx.currentTime + 0.08

  const voice = (midi: number, at: number, len: number, type: OscillatorType, peak: number) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12)
    osc.connect(gain)
    gain.connect(out)
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(peak, at + 0.05)
    gain.gain.setTargetAtTime(0, at + len * 0.6, len * 0.25)
    osc.start(at)
    osc.stop(at + len + 0.1)
    nodes.push(osc)
  }

  // Duas voltas agendadas de uma vez, e a segunda recomeça pelo temporizador
  // — agendar tudo de antemão prenderia o laço a um fim.
  const schedule = (origin: number) => {
    for (let b = 0; b < bars; b++) {
      const root = roots[b % roots.length]
      const at = origin + b * bar
      voice(root - 12, at, bar * 0.9, 'sine', 0.22)
      voice(root, at + beat * 0.5, bar * 0.4, 'triangle', 0.1)
      voice(root + 7, at + beat * 1.5, bar * 0.4, 'triangle', 0.08)
      voice(root + 12, at + beat * 2.5, bar * 0.3, 'sine', 0.06)
    }
  }

  schedule(start)
  const timer = setInterval(() => schedule(ctx.currentTime + 0.05), loop * 1000)
  nodes.push({ stop: () => clearInterval(timer) })

  return nodes
}

/** A mesa é uma só, para a aba inteira. */
export const mixer = new Mixer()

// Gancho de conferência: o volume aplicado de verdade, não o que está salvo.
if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  ;(window as unknown as { __mixerVolume?: () => number }).__mixerVolume = () => mixer.getVolume()
}
