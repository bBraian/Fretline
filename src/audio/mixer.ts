/**
 * Mesa de som dos menus: volume geral, música de fundo e efeitos.
 *
 * Existe um lugar só onde o volume mora, e é aqui. A tela de ajustes escreve
 * nele, o tocador da música lê dele, e quem quiser saber quando mudou se
 * inscreve. Antes o volume era passado ao tocador uma vez, no início da
 * música — mexer no controle durante a partida não tinha efeito nenhum, e
 * nada além da música obedecia.
 *
 * ## Por que o som é sintetizado
 *
 * O projeto não embarca arquivo de áudio nenhum, e a faixa de demonstração
 * já é gerada em código. Os efeitos de menu e a música de fundo seguem a
 * mesma regra: são alguns osciladores, custam menos de um kilobyte de
 * código e nada de download.
 *
 * ## Contexto próprio
 *
 * A mesa tem o seu `AudioContext`, separado do que toca a música da
 * partida. São ciclos de vida diferentes — o da partida nasce e morre com a
 * tela de jogo, enquanto este vive enquanto a aba estiver aberta. O volume
 * geral é que liga os dois.
 */

/** Quanto a música de menu toca abaixo do volume geral. */
const MENU_MUSIC_RATIO = 0.5

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

  setMenuMusicEnabled(enabled: boolean) {
    this.menuMusicOn = enabled
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(
        enabled ? MENU_MUSIC_RATIO : 0,
        this.ctx.currentTime,
        0.15,
      )
    }
    if (enabled) this.startMenuMusic()
  }

  /**
   * Liga a música de fundo, se já não estiver tocando.
   *
   * Chamar de novo não empilha uma segunda instância — é o que evita duas
   * músicas sobrepostas ao andar pelas telas.
   */
  startMenuMusic() {
    if (!this.menuMusicOn || this.musicNodes.length) return
    const ctx = this.ensure()
    if (!ctx || !this.musicGain) return
    this.musicNodes = buildMenuLoop(ctx, this.musicGain)
  }

  /** Desliga a música com um fecho suave, para entrar no palco. */
  stopMenuMusic(fade = 0.4) {
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

  /** Um efeito curto de menu. */
  play(sound: MenuSound) {
    const ctx = this.ensure()
    if (!ctx || !this.sfxGain) return
    playSound(ctx, this.sfxGain, sound)
  }
}

export type MenuSound = 'move' | 'select' | 'back' | 'tweak'

/**
 * Os efeitos.
 *
 * Curtos de propósito: navegar por uma lista dispara `move` a cada item, e
 * qualquer coisa com cauda longa vira barulho depois do terceiro toque.
 */
function playSound(ctx: AudioContext, out: GainNode, sound: MenuSound) {
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(out)

  const shape: Record<MenuSound, { type: OscillatorType; from: number; to: number; len: number; peak: number }> = {
    move: { type: 'triangle', from: 520, to: 660, len: 0.07, peak: 0.28 },
    select: { type: 'square', from: 330, to: 740, len: 0.14, peak: 0.34 },
    back: { type: 'triangle', from: 480, to: 240, len: 0.12, peak: 0.3 },
    tweak: { type: 'sine', from: 720, to: 760, len: 0.05, peak: 0.22 },
  }
  const s = shape[sound]

  osc.type = s.type
  osc.frequency.setValueAtTime(s.from, now)
  osc.frequency.exponentialRampToValueAtTime(s.to, now + s.len)

  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(s.peak, now + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.001, now + s.len)

  osc.start(now)
  osc.stop(now + s.len + 0.02)
}

/**
 * A música de fundo: um laço de baixo e acordes, em menor, lento.
 *
 * Feita para não disputar atenção — sem percussão e sem melodia aguda, que
 * são as duas coisas que cansam quem está lendo uma lista de músicas.
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
