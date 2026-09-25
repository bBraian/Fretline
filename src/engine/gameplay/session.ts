/**
 * A sessão: a máquina de estados de uma música sendo tocada.
 *
 * É o coração do jogo e o único lugar onde acerto, erro e pontuação são
 * decididos. Não conhece Three.js, React nem áudio — recebe o tempo da
 * música de fora e eventos de input com carimbo de tempo próprio, e devolve
 * estado. É isso que permite testar o timing inteiro sem navegador.
 *
 * Os eventos de input trazem o próprio instante em vez de serem amostrados
 * por frame: um frame de 16ms é largo demais perto de uma janela de 70ms.
 *
 * Há dois jeitos de tocar, escolhidos na criação (`SessionOptions.strum`).
 *
 * **Sem palhetada**, o padrão, toda nota é resolvida na mudança dos
 * trastes, o que torna teclado e controle igualmente jogáveis — nenhum dos
 * dois tem um gesto decente para palhetar. A barra de strum, se houver,
 * vale como um segundo gatilho (ver `onStrum`), mas ninguém precisa dela.
 *
 * **Com palhetada**, que é como se toca com uma guitarra, vale a regra do
 * original: a nota normal só sai com a barra, e o traste sozinho toca só
 * HOPO e tap. Ver `onFretsWithStrum` e `onStrumRequired`.
 *
 * Sem palhetada, três consequências que a máquina de estados precisa tratar:
 *
 * - duas notas seguidas na mesma digitação exigem soltar e apertar de novo,
 *   porque a mão precisa *mudar* para resolver nota;
 * - a mudança que resolve pode ser uma soltura. Sem palhetada existem notas
 *   que nenhum aperto alcança: um acorde verde+vermelho resolvendo para um
 *   vermelho sozinho se toca soltando o verde. Vale quando a mão para
 *   exatamente na forma da nota;
 * - o castigo por palhetar no vazio vira castigo por tocar no vazio, com
 *   uma folga para montar acordes (ver `CHORD_GRACE` e `buildingChord`).
 *   Sem ele, martelar os cinco trastes acertaria a música inteira.
 */

import type { Chart, Difficulty, Judgement, Note, Verdict } from '../types'
import { countFrets } from '../types'
import {
  CHORD_GRACE,
  ESCALATION_CAP,
  GHOST_TAP_COST,
  HIT_WINDOW,
  HOPO_STRUM_LENIENCY,
  METER_BY_DIFFICULTY,
  METER_START,
  PERFECT_WINDOW,
  POINTS_PER_NOTE,
  POINTS_PER_SUSTAIN_BEAT,
  STAR_POWER_ACTIVATION_MINIMUM,
  STAR_POWER_BEATS_PER_FULL_BAR,
  STAR_POWER_PER_PHRASE,
  STRUM_LENIENCY,
  beatDurationAt,
  fretsSatisfyNote,
  multiplierFor,
  type MeterTuning,
} from './rules'

export type InputEvent =
  | { kind: 'frets'; mask: number; time: number }
  | { kind: 'strum'; time: number }
  | { kind: 'whammy'; value: number; time: number }
  | { kind: 'starPower'; time: number }

export type NoteStatus = 'pending' | 'hit' | 'missed'

/** Aviso de algo que acabou de acontecer, para o render reagir. */
export type SessionEvent =
  | { kind: 'hit'; note: Note; verdict: Verdict; delta: number }
  | { kind: 'miss'; note: Note }
  | { kind: 'ghostTap'; time: number }
  | { kind: 'sustainEnd'; note: Note; completed: boolean }
  | { kind: 'starPowerStart' }
  | { kind: 'starPowerEnd' }
  | { kind: 'phraseComplete' }
  | { kind: 'failed' }
  | { kind: 'finished' }

interface ActiveSustain {
  note: Note
  endTime: number
  paidUntil: number
}

interface PhraseProgress {
  firstNote: number
  lastNote: number
  total: number
  hits: number
  resolved: boolean
}

export interface SessionState {
  score: number
  streak: number
  longestStreak: number
  multiplier: number
  notesHit: number
  notesSeen: number
  notesTotal: number
  rockMeter: number
  failed: boolean
  finished: boolean
  starPowerAmount: number
  starPowerActive: boolean
  fretMask: number
  whammy: number
  /** Notas com sustain sendo mantido agora, para o render esticar o rastro. */
  activeSustains: number[]
  lastJudgement: Judgement | null
}

export interface SessionOptions {
  /** Deslocamento do julgamento, em segundos, vindo da calibração de áudio. */
  inputOffset?: number
  /** Desliga a falha por medidor zerado. */
  noFail?: boolean
  /**
   * Exige palhetada, como no original: a nota normal só vale com a barra de
   * strum, e HOPO e tap se tocam no traste. Desligado, toda nota é tocada
   * no traste e a barra é opcional.
   */
  strum?: boolean
}

export class Session {
  private readonly noteStatus: NoteStatus[]
  private readonly notePhrase: Int32Array
  private readonly phrases: PhraseProgress[]
  private readonly meter: MeterTuning
  private readonly inputOffset: number
  private readonly noFail: boolean
  /** A nota normal exige a barra de strum? Ver `SessionOptions.strum`. */
  readonly strum: boolean

  /** Primeira nota ainda não resolvida; só anda para frente. */
  private cursor = 0
  /** Erros seguidos, para a escalada da perda de medidor. */
  private consecutiveMisses = 0
  private sustains: ActiveSustain[] = []
  private events: SessionEvent[] = []
  /** Toque que ainda não resolveu nota; aguarda a folga do acorde. */
  private pendingTap: { time: number } | null = null
  /**
   * Nota que levou um traste errado e ainda não se resolveu.
   *
   * O castigo desse toque fica esperando a nota: se ela expirar, a conta é
   * a nota perdida; se o jogador corrigir a tempo, é o toque no vazio. Ver
   * `resolvePendingTap`.
   */
  private wrongAttempt = -1
  /**
   * Com palhetada: palhetada que não tocou nada e ainda espera os trastes.
   * Ver `STRUM_LENIENCY`.
   */
  private pendingStrum: { time: number } | null = null
  /**
   * Com palhetada: quando o último HOPO foi tocado no traste, ou -1. A
   * palhetada que vem logo atrás é dele; ver `HOPO_STRUM_LENIENCY`.
   */
  private hammeredAt = -1
  private lastUpdate: number
  private starPowerAnnounced = false

  private state: SessionState

  constructor(
    private readonly chart: Chart,
    difficulty: Difficulty,
    options: SessionOptions = {},
  ) {
    this.meter = METER_BY_DIFFICULTY[difficulty]
    this.inputOffset = options.inputOffset ?? 0
    this.noFail = options.noFail ?? false
    this.strum = options.strum ?? false
    this.noteStatus = new Array(chart.notes.length).fill('pending')
    this.notePhrase = new Int32Array(chart.notes.length).fill(-1)
    this.phrases = []
    this.lastUpdate = chart.notes.length > 0 ? chart.notes[0].time - 5 : 0

    this.indexPhrases()

    this.state = {
      score: 0,
      streak: 0,
      longestStreak: 0,
      multiplier: 1,
      notesHit: 0,
      notesSeen: 0,
      notesTotal: chart.notes.length,
      rockMeter: METER_START,
      failed: false,
      finished: false,
      starPowerAmount: 0,
      starPowerActive: false,
      fretMask: 0,
      whammy: 0,
      activeSustains: [],
      lastJudgement: null,
    }
  }

  /** Liga cada nota ao trecho de star power que a contém. */
  private indexPhrases() {
    for (const phrase of this.chart.starPower) {
      let first = -1
      let last = -1
      for (let i = 0; i < this.chart.notes.length; i++) {
        const t = this.chart.notes[i].time
        if (t >= phrase.start && t < phrase.end) {
          if (first < 0) first = i
          last = i
          this.notePhrase[i] = this.phrases.length
        }
      }
      if (first < 0) continue
      this.phrases.push({
        firstNote: first,
        lastNote: last,
        total: last - first + 1,
        hits: 0,
        resolved: false,
      })
    }
  }

  getState(): Readonly<SessionState> {
    return this.state
  }

  getChart(): Chart {
    return this.chart
  }

  statusOf(noteIndex: number): NoteStatus {
    return this.noteStatus[noteIndex]
  }

  /** Esvazia a fila de avisos. O render chama uma vez por frame. */
  consumeEvents(): SessionEvent[] {
    if (this.events.length === 0) return []
    const out = this.events
    this.events = []
    return out
  }

  /**
   * Avança a sessão até `songTime`. Expira notas que passaram da janela,
   * paga sustains mantidos e consome o medidor de star power.
   */
  update(songTime: number) {
    if (this.state.finished) return

    const dt = Math.max(0, songTime - this.lastUpdate)
    this.lastUpdate = songTime

    // Antes de expirar: uma palhetada errada em cima da nota precisa saber
    // que a nota ainda está de pé para cobrar uma vez só.
    this.resolvePendingStrum(songTime)
    this.expireNotes(songTime)
    this.resolvePendingTap(songTime)
    this.updateSustains(songTime)
    this.drainStarPower(songTime, dt)

    if (this.state.failed) return

    const lastNote = this.chart.notes.at(-1)
    if (lastNote && this.cursor >= this.chart.notes.length && this.sustains.length === 0) {
      if (songTime > lastNote.time + lastNote.duration) {
        this.state.finished = true
        this.events.push({ kind: 'finished' })
      }
    }
  }

  handleInput(event: InputEvent) {
    if (this.state.failed || this.state.finished) return
    const time = event.time - this.inputOffset

    switch (event.kind) {
      case 'frets':
        this.onFretChange(event.mask, time)
        break
      case 'strum':
        if (this.strum) this.onStrumRequired(time)
        else this.onStrum(time)
        break
      case 'whammy':
        this.state.whammy = event.value
        break
      case 'starPower':
        this.activateStarPower()
        break
    }
  }

  // --- input -------------------------------------------------------------

  private onFretChange(mask: number, time: number) {
    const previous = this.state.fretMask
    this.state.fretMask = mask
    if (mask === previous) return
    if (this.strum) {
      this.onFretsWithStrum(mask, time)
      return
    }

    const pressed = mask & ~previous
    const candidate = this.findCandidate(time)

    if (pressed === 0) {
      // Uma soltura resolve nota quando a mão *para* exatamente na forma da
      // nota seguinte. Não é generosidade: sem palhetada, existem notas que
      // nenhum aperto alcança. Um acorde verde+vermelho resolvendo para um
      // vermelho sozinho se toca soltando o verde — nenhum traste novo
      // desce. Exigir soltar tudo e reapertar tornaria essas notas
      // impossíveis de tocar no tempo, e elas são 16% de um chart de expert
      // com muitos acordes.
      //
      // A nota aberta cai neste mesmo caso: "nenhum traste pressionado" só
      // pode ser expressado soltando tudo.
      //
      // O que continua não valendo é soltar para *nada*: largar o verde com
      // outro verde à frente deixa a máscara em zero, que não satisfaz a
      // nota, e ela segue pendente — duas notas no mesmo traste continuam
      // exigindo soltar e apertar.
      if (candidate && fretsSatisfyNote(mask, candidate)) this.hit(candidate, time)
      return
    }

    if (candidate && fretsSatisfyNote(mask, candidate)) {
      this.pendingTap = null
      this.hit(candidate, time)
      return
    }

    // Apertar um traste com uma nota aberta à frente não é castigado: o
    // jogador está quase sempre a caminho de soltar tudo para tocá-la.
    if (candidate?.isOpen) return

    // Ainda não resolveu. Pode ser um acorde em construção, então o castigo
    // espera a folga; o instante guardado é o do primeiro dedo, para que
    // montar o acorde não conte como atraso.
    if (!this.pendingTap) this.pendingTap = { time }
  }

  /**
   * Palhetada, quando ela não é exigida.
   *
   * Nesse modo o jogo resolve a nota no traste — mas um controle pode ter a
   * barra, e quem a tem vai usá-la. Ela é um segundo gatilho para a nota
   * que já está debaixo dos dedos: se a mão satisfaz a nota candidata, a
   * palhetada resolve.
   *
   * Palhetar no vazio não é castigado, e é de propósito. Aqui a palhetada é
   * opcional, não obrigatória; punir quem palheteia por hábito enquanto
   * também aperta o traste cobraria por um gesto que o jogo nem pede.
   */
  private onStrum(time: number) {
    const candidate = this.findCandidate(time)
    if (!candidate) return
    if (!fretsSatisfyNote(this.state.fretMask, candidate)) return
    this.pendingTap = null
    this.hit(candidate, time)
  }

  /**
   * Trastes, com palhetada.
   *
   * O traste sozinho não toca nota normal, e mexer nele à toa não é
   * castigado — sem palhetar, a mão está só se posicionando. Ele resolve
   * nota em dois casos: fechando uma palhetada que chegou um pouco antes
   * dele, e no HOPO e no tap, que é para isso que eles existem.
   *
   * A soltura vale igual ao aperto: soltar o traste de cima para revelar o
   * de baixo é o pull-off.
   */
  private onFretsWithStrum(mask: number, time: number) {
    const pending = this.pendingStrum
    if (pending && time - pending.time <= STRUM_LENIENCY) {
      const target = this.findStrumTarget(mask, time)
      if (target) {
        this.pendingStrum = null
        this.hitStrummed(target, time)
        return
      }
    }

    const candidate = this.findCandidate(time)
    if (candidate && this.canHammer(candidate) && fretsSatisfyNote(mask, candidate)) {
      this.hammeredAt = time
      this.hit(candidate, time)
    }
  }

  /**
   * HOPO se toca no traste só com a corrente de pé, como no original:
   * depois de um erro, o primeiro HOPO precisa ser palhetado. Tap não tem
   * essa condição — é o que o separa do HOPO.
   */
  private canHammer(note: Note): boolean {
    if (note.type === 'tap') return true
    return note.type === 'hopo' && this.state.streak > 0
  }

  /**
   * Palhetada obrigatória.
   *
   * Toca a nota que os trastes na mão satisfazem. Se não satisfazem nenhuma,
   * ela ainda espera os trastes um instante (`STRUM_LENIENCY`) antes de
   * virar overstrum.
   */
  private onStrumRequired(time: number) {
    if (this.hammeredAt >= 0 && time - this.hammeredAt <= HOPO_STRUM_LENIENCY) {
      // É a palhetada do HOPO que acabou de sair no traste. Uma só: a
      // seguinte já é outra palhetada.
      this.hammeredAt = -1
      return
    }

    // A palhetada anterior ainda esperava os trastes e perdeu a vez.
    if (this.pendingStrum) this.overstrum(this.pendingStrum.time)
    this.pendingStrum = null

    const target = this.findStrumTarget(this.state.fretMask, time)
    if (target) this.hitStrummed(target, time)
    else this.pendingStrum = { time }
  }

  /** Palhetada que atravessou a folga sem tocar nada: é overstrum. */
  private resolvePendingStrum(songTime: number) {
    const pending = this.pendingStrum
    if (!pending) return
    if (songTime < pending.time + STRUM_LENIENCY) return
    this.pendingStrum = null
    this.overstrum(pending.time)
  }

  /**
   * Palhetar sem tocar nota.
   *
   * Custa como um toque no vazio, e corta o sustain que estiver soando, como
   * no original: palhetar de novo é largar a nota que estava tocando.
   */
  private overstrum(time: number) {
    if (this.sustains.length > 0) {
      for (const sustain of this.sustains) {
        this.events.push({ kind: 'sustainEnd', note: sustain.note, completed: false })
      }
      this.sustains = []
      this.syncSustainView()
    }
    this.strayTouch(time)
  }

  /**
   * A nota que uma palhetada toca, dados os trastes na mão.
   *
   * É a primeira da janela que os trastes satisfazem — podendo passar por
   * cima de notas que já cruzaram a linha e ficaram para trás. Sem isso,
   * num trecho rápido, a nota perdida por atraso ocupava a janela da
   * seguinte: a palhetada certa da seguinte virava overstrum, e o jogador
   * pagava duas vezes pelo mesmo atraso. Nota que ainda está por vir nunca
   * é pulada.
   */
  private findStrumTarget(mask: number, time: number): Note | null {
    for (let i = this.cursor; i < this.chart.notes.length; i++) {
      if (this.noteStatus[i] !== 'pending') continue
      const note = this.chart.notes[i]
      if (note.time > time + HIT_WINDOW) return null
      if (note.time < time - HIT_WINDOW) continue
      if (fretsSatisfyNote(mask, note)) return note
      if (note.time >= time) return null
    }
    return null
  }

  /** Acerta pela palhetada; as notas que ela pulou estão perdidas. */
  private hitStrummed(note: Note, time: number) {
    for (let i = this.cursor; i < note.index; i++) {
      if (this.noteStatus[i] === 'pending') this.missNote(i)
    }
    this.hit(note, time)
  }

  /** Toque que atravessou a folga sem virar acerto: é castigo. */
  private resolvePendingTap(songTime: number) {
    const pending = this.pendingTap
    if (!pending) return
    if (songTime < pending.time + CHORD_GRACE) return
    if (this.buildingChord(songTime)) return

    this.pendingTap = null
    this.strayTouch(pending.time)
  }

  /** Um toque — traste ou palhetada — que não tocou nada. */
  private strayTouch(time: number) {
    this.breakStreak()
    this.events.push({ kind: 'ghostTap', time })

    // Com nota na janela, o toque foi uma tentativa errada *dela*, e o
    // medidor espera o desfecho para cobrar uma vez só — antes cobrava o
    // toque agora e a nota perdida logo depois, e errar o botão, que é o
    // erro mais comum que existe, derrubava a música no dobro da
    // velocidade de não tocar. A corrente quebra na hora de qualquer jeito.
    //
    // Só a primeira tentativa espera. A segunda na mesma nota é cobrada na
    // hora: sem isso, varrer os trastes em cima de cada nota sairia de graça.
    const aimedAt = this.findCandidate(time)
    if (aimedAt && aimedAt.index !== this.wrongAttempt) {
      this.wrongAttempt = aimedAt.index
      return
    }
    this.damage(GHOST_TAP_COST)
  }

  /**
   * Os trastes na mão são parte de um acorde que ainda está por vir?
   *
   * A folga fixa sozinha não dá conta: ninguém fecha três trastes no mesmo
   * instante, e o espalhamento dos dedos de um jogador comum passa dos 30ms
   * sem esforço. Mas espalhamento não é martelada, e dá para distinguir os
   * dois pelo conteúdo e não pelo relógio — dedos que são um *subconjunto*
   * do acorde que está chegando são uma mão montando a nota.
   *
   * Enquanto for esse o caso, o castigo espera. Se o acorde nunca fechar, a
   * nota expira e a perda dela é a conta; se fechar, vira acerto.
   */
  private buildingChord(songTime: number): boolean {
    const candidate = this.findCandidate(songTime)
    return candidate !== null && this.maskBuilds(candidate)
  }

  /** Os trastes na mão são parte — e só parte — desta nota? */
  private maskBuilds(note: Note): boolean {
    const mask = this.state.fretMask
    if (mask === 0 || note.isOpen) return false
    return (mask & ~note.frets) === 0
  }

  /** A nota pendente mais antiga que ainda está dentro da janela. */
  private findCandidate(time: number): Note | null {
    for (let i = this.cursor; i < this.chart.notes.length; i++) {
      if (this.noteStatus[i] !== 'pending') continue
      const note = this.chart.notes[i]
      if (note.time > time + HIT_WINDOW) return null
      if (note.time >= time - HIT_WINDOW) return note
    }
    return null
  }

  // --- resolução de notas ------------------------------------------------

  private hit(note: Note, time: number) {
    const delta = time - note.time
    const verdict: Verdict = Math.abs(delta) <= PERFECT_WINDOW ? 'perfect' : 'good'

    this.noteStatus[note.index] = 'hit'
    this.advanceCursor()

    // Corrigiu a tempo depois de um traste errado: a nota foi tocada, mas o
    // toque errado continua sendo ruído, e é agora que ele é cobrado.
    if (this.wrongAttempt === note.index) {
      this.wrongAttempt = -1
      this.damage(GHOST_TAP_COST)
    }

    this.state.streak++
    this.state.longestStreak = Math.max(this.state.longestStreak, this.state.streak)
    this.state.notesHit++
    this.state.notesSeen++
    this.refreshMultiplier()

    const chordSize = note.isOpen ? 1 : Math.max(1, countFrets(note.frets))
    this.state.score += POINTS_PER_NOTE * chordSize * this.state.multiplier

    this.state.rockMeter = Math.min(1, this.state.rockMeter + this.meter.gain)
    this.consecutiveMisses = 0
    this.state.lastJudgement = { noteIndex: note.index, delta, verdict, time }

    if (note.duration > 0) {
      this.sustains.push({ note, endTime: note.time + note.duration, paidUntil: note.time })
      this.syncSustainView()
    }

    this.creditPhrase(note.index, true)
    this.events.push({ kind: 'hit', note, verdict, delta })
  }

  private expireNotes(songTime: number) {
    const deadline = songTime - HIT_WINDOW
    for (let i = this.cursor; i < this.chart.notes.length; i++) {
      const note = this.chart.notes[i]
      if (note.time > deadline) break
      if (this.noteStatus[i] !== 'pending') continue
      this.missNote(i)
    }
    this.advanceCursor()
  }

  private missNote(i: number) {
    const note = this.chart.notes[i]
    this.noteStatus[i] = 'missed'
    this.state.notesSeen++

    // Um toque que estava montando justamente esta nota já tem a sua
    // conta: a nota perdida. Cobrar também o castigo por tocar no vazio
    // puniria a mesma falha duas vezes, e era o que fazia uma passagem
    // difícil derrubar o medidor no dobro da velocidade devida.
    if (this.pendingTap && this.maskBuilds(note)) this.pendingTap = null
    // O mesmo vale para o traste errado que esperava esta nota.
    if (this.wrongAttempt === i) this.wrongAttempt = -1

    this.breakStreak()
    this.damage()
    this.creditPhrase(i, false)
    this.events.push({ kind: 'miss', note })
  }

  private advanceCursor() {
    while (this.cursor < this.chart.notes.length && this.noteStatus[this.cursor] !== 'pending') {
      this.cursor++
    }
  }

  private breakStreak() {
    this.state.streak = 0
    this.refreshMultiplier()
  }

  private refreshMultiplier() {
    this.state.multiplier = multiplierFor(this.state.streak, this.state.starPowerActive)
  }

  /**
   * Tira do medidor.
   *
   * `weight` abaixo de 1 é para falhas que valem menos que perder uma nota.
   * A escalada por erros seguidos é o que faz um tropeço isolado ser barato
   * e uma passagem inteira errada ser cara.
   */
  private damage(weight = 1) {
    if (this.state.starPowerActive || this.noFail) return

    const escalated = 1 + Math.min(this.consecutiveMisses, ESCALATION_CAP) * this.meter.escalation
    this.consecutiveMisses++

    this.state.rockMeter = Math.max(0, this.state.rockMeter - this.meter.loss * escalated * weight)
    if (this.state.rockMeter <= 0 && !this.state.failed) {
      this.state.failed = true
      this.events.push({ kind: 'failed' })
    }
  }

  // --- sustains ----------------------------------------------------------

  private updateSustains(songTime: number) {
    if (this.sustains.length === 0) return

    const beat = beatDurationAt(this.chart.beats, songTime)
    const remaining: ActiveSustain[] = []

    for (const sustain of this.sustains) {
      const holding = fretsSatisfyNote(this.state.fretMask, sustain.note)
      const until = Math.min(songTime, sustain.endTime)

      if (holding && until > sustain.paidUntil) {
        const beatsHeld = (until - sustain.paidUntil) / beat
        this.state.score += Math.round(POINTS_PER_SUSTAIN_BEAT * beatsHeld * this.state.multiplier)
        // Usar a alavanca durante um sustain alimenta o star power, como no
        // original: é o que dá função à whammy fora do efeito sonoro.
        if (this.state.whammy > 0 && !this.state.starPowerActive) {
          this.addStarPower(this.state.whammy * (until - sustain.paidUntil) * 0.05)
        }
        sustain.paidUntil = until
      }

      if (songTime >= sustain.endTime) {
        this.events.push({ kind: 'sustainEnd', note: sustain.note, completed: holding })
        continue
      }
      if (!holding) {
        this.events.push({ kind: 'sustainEnd', note: sustain.note, completed: false })
        continue
      }
      remaining.push(sustain)
    }

    if (remaining.length !== this.sustains.length) {
      this.sustains = remaining
      this.syncSustainView()
    }
  }

  private syncSustainView() {
    this.state.activeSustains = this.sustains.map((s) => s.note.index)
  }

  // --- star power --------------------------------------------------------

  private creditPhrase(noteIndex: number, hit: boolean) {
    const phraseIndex = this.notePhrase[noteIndex]
    if (phraseIndex < 0) return
    const phrase = this.phrases[phraseIndex]
    if (phrase.resolved) return

    if (!hit) {
      // Uma nota perdida invalida o trecho inteiro.
      phrase.resolved = true
      return
    }

    phrase.hits++
    if (phrase.hits >= phrase.total) {
      phrase.resolved = true
      this.addStarPower(STAR_POWER_PER_PHRASE)
      this.events.push({ kind: 'phraseComplete' })
    }
  }

  private addStarPower(amount: number) {
    this.state.starPowerAmount = Math.min(1, this.state.starPowerAmount + amount)
  }

  private activateStarPower() {
    if (this.state.starPowerActive) return
    if (this.state.starPowerAmount < STAR_POWER_ACTIVATION_MINIMUM) return
    this.state.starPowerActive = true
    this.starPowerAnnounced = true
    this.refreshMultiplier()
    this.events.push({ kind: 'starPowerStart' })
  }

  private drainStarPower(songTime: number, dt: number) {
    if (!this.state.starPowerActive) return

    const beat = beatDurationAt(this.chart.beats, songTime)
    const drain = dt / (beat * STAR_POWER_BEATS_PER_FULL_BAR)
    this.state.starPowerAmount = Math.max(0, this.state.starPowerAmount - drain)

    if (this.state.starPowerAmount <= 0) {
      this.state.starPowerActive = false
      this.refreshMultiplier()
      if (this.starPowerAnnounced) {
        this.starPowerAnnounced = false
        this.events.push({ kind: 'starPowerEnd' })
      }
    }
  }
}
