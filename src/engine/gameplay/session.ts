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
 */

import type { Chart, Difficulty, Judgement, Note, Verdict } from '../types'
import { countFrets } from '../types'
import {
  HIT_WINDOW,
  METER_BY_DIFFICULTY,
  METER_START,
  PERFECT_WINDOW,
  POINTS_PER_NOTE,
  POINTS_PER_SUSTAIN_BEAT,
  STAR_POWER_ACTIVATION_MINIMUM,
  STAR_POWER_BEATS_PER_FULL_BAR,
  STAR_POWER_PER_PHRASE,
  beatDurationAt,
  fretsSatisfyNote,
  multiplierFor,
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
  | { kind: 'overstrum'; time: number }
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
}

export class Session {
  private readonly noteStatus: NoteStatus[]
  private readonly notePhrase: Int32Array
  private readonly phrases: PhraseProgress[]
  private readonly meter: { gain: number; loss: number }
  private readonly inputOffset: number
  private readonly noFail: boolean

  /** Primeira nota ainda não resolvida; só anda para frente. */
  private cursor = 0
  private sustains: ActiveSustain[] = []
  private events: SessionEvent[] = []
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

    this.expireNotes(songTime)
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
        this.onStrum(time)
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

    // Soltar um traste no meio de um sustain derruba o sustain; isso é
    // tratado no update, junto com o resto do tempo contínuo.

    if (mask === previous) return

    // HOPO e tap são acertados só com o traste, sem palhetar. HOPO exige
    // que a corrente de acertos esteja viva; tap não exige nada.
    const candidate = this.findCandidate(time)
    if (!candidate) return
    if (candidate.type === 'strum') return
    if (candidate.type === 'hopo' && this.state.streak === 0) return
    if (!fretsSatisfyNote(mask, candidate)) return

    this.hit(candidate, time)
  }

  private onStrum(time: number) {
    const candidate = this.findCandidate(time)

    if (candidate && fretsSatisfyNote(this.state.fretMask, candidate)) {
      this.hit(candidate, time)
      return
    }

    // Palhetada no vazio: quebra a corrente e machuca o medidor. Sem isso o
    // jogador pode palhetar sem parar e nunca errar nada.
    this.breakStreak()
    this.damage()
    this.events.push({ kind: 'overstrum', time })
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

    this.state.streak++
    this.state.longestStreak = Math.max(this.state.longestStreak, this.state.streak)
    this.state.notesHit++
    this.state.notesSeen++
    this.refreshMultiplier()

    const chordSize = note.isOpen ? 1 : Math.max(1, countFrets(note.frets))
    this.state.score += POINTS_PER_NOTE * chordSize * this.state.multiplier

    this.state.rockMeter = Math.min(1, this.state.rockMeter + this.meter.gain)
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

      this.noteStatus[i] = 'missed'
      this.state.notesSeen++
      this.breakStreak()
      this.damage()
      this.creditPhrase(i, false)
      this.events.push({ kind: 'miss', note })
    }
    this.advanceCursor()
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

  private damage() {
    if (this.state.starPowerActive || this.noFail) return
    this.state.rockMeter = Math.max(0, this.state.rockMeter - this.meter.loss)
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
