/**
 * Parser de `notes.mid`, o formato em que praticamente toda música charteada
 * para Clone Hero é distribuída hoje.
 *
 * A convenção vem do Rock Band e é posicional: cada dificuldade ocupa uma
 * oitava da trilha `PART GUITAR`, com cinco notas seguidas para os cinco
 * trastes, mais duas logo acima para as marcações de HOPO forçado. Star
 * power, solo e tap ficam em notas fixas, fora das oitavas.
 *
 *     Easy    60..64    forçado 65/66
 *     Medium  72..76    forçado 77/78
 *     Hard    84..88    forçado 89/90
 *     Expert  96..100   forçado 101/102
 *     Solo         103
 *     Tap          104
 *     Star power   116
 *
 * Notas abertas não existem na convenção original: foram acrescentadas pelo
 * Phase Shift como mensagens SysEx, e é assim que os charts modernos as
 * marcam. O bloco abaixo trata as duas formas.
 */

import type { Chart, Difficulty, Note, NoteType, Phrase, Song, SongMeta } from '../types'
import { TempoMap, type TempoEvent, type TimeSignature } from './tempoMap'
import { sustainThreshold } from './sustain'
import {
  META_TEMPO,
  META_TIME_SIGNATURE,
  parseMidiFile,
  type MidiFile,
  type MidiNoteEvent,
  type MidiTrack,
} from './midiFile'

/** Nota MIDI mais baixa de cada dificuldade. */
const DIFFICULTY_BASE: Record<Difficulty, number> = {
  easy: 60,
  medium: 72,
  hard: 84,
  expert: 96,
}

const FORCE_HOPO_ON = 5
const FORCE_HOPO_OFF = 6

const NOTE_STAR_POWER = 116
const NOTE_TAP = 104

/** Nomes de trilha aceitos para a guitarra solo, em ordem de preferência. */
const GUITAR_TRACKS = ['PART GUITAR', 'T1 GEMS', 'PART GUITAR COOP', 'PART RHYTHM']

/** Limite de HOPO natural, em ticks por semínima de 480. */
const HOPO_THRESHOLD_AT_480 = 163

interface PendingNote {
  startTick: number
  velocity: number
}

interface Span {
  start: number
  end: number
}

function buildTempoMap(file: MidiFile) {
  const tempos: TempoEvent[] = []
  const signatures: TimeSignature[] = []

  for (const track of file.tracks) {
    for (const event of track.events) {
      if (event.kind !== 'meta') continue

      if (event.type === META_TEMPO && event.data.length >= 3) {
        // Microssegundos por semínima, em três bytes.
        const microseconds = (event.data[0] << 16) | (event.data[1] << 8) | event.data[2]
        const bpm = 60_000_000 / microseconds
        tempos.push({ tick: event.tick, bpmThousandths: Math.round(bpm * 1000) })
      } else if (event.type === META_TIME_SIGNATURE && event.data.length >= 2) {
        signatures.push({
          tick: event.tick,
          numerator: event.data[0],
          denominator: 2 ** event.data[1],
        })
      }
    }
  }

  return { tempos, signatures }
}

function findGuitarTrack(file: MidiFile): MidiTrack | null {
  for (const wanted of GUITAR_TRACKS) {
    const track = file.tracks.find((t) => t.name.trim().toUpperCase() === wanted)
    if (track) return track
  }
  // Sem nome reconhecido, vale a trilha com mais notas nas oitavas usadas.
  let best: MidiTrack | null = null
  let bestCount = 0
  for (const track of file.tracks) {
    const count = track.events.filter(
      (e) => e.kind === 'note' && e.on && e.note >= 60 && e.note <= 100,
    ).length
    if (count > bestCount) {
      best = track
      bestCount = count
    }
  }
  return bestCount > 0 ? best : null
}

/**
 * Trechos de nota aberta marcados por SysEx do Phase Shift.
 *
 * A mensagem tem a forma `50 53 00 00 <dificuldade> 01 <liga>`, onde a
 * dificuldade 0xFF significa todas. Um trecho começa quando `liga` é 1 e
 * termina no próximo com 0.
 */
function readOpenSpans(track: MidiTrack): Map<Difficulty | 'all', Span[]> {
  const spans = new Map<Difficulty | 'all', Span[]>()
  const open = new Map<Difficulty | 'all', number>()
  const order: Array<Difficulty | 'all'> = ['easy', 'medium', 'hard', 'expert']

  for (const event of track.events) {
    if (event.kind !== 'sysex') continue
    const d = event.data
    if (d.length < 7) continue
    if (d[0] !== 0x50 || d[1] !== 0x53) continue
    if (d[5] !== 0x01) continue

    const key: Difficulty | 'all' = d[4] === 0xff ? 'all' : (order[d[4]] ?? 'all')
    const enabling = d[6] === 0x01

    if (enabling) {
      open.set(key, event.tick)
    } else {
      const start = open.get(key)
      if (start === undefined) continue
      open.delete(key)
      const list = spans.get(key)
      if (list) list.push({ start, end: event.tick })
      else spans.set(key, [{ start, end: event.tick }])
    }
  }

  return spans
}

function inSpan(spans: Span[] | undefined, tick: number) {
  if (!spans) return false
  return spans.some((span) => tick >= span.start && tick < span.end)
}

/** Emparelha note-on com note-off e devolve os intervalos por nota MIDI. */
function collectSpans(events: MidiNoteEvent[]): Map<number, Span[]> {
  const pending = new Map<number, PendingNote>()
  const spans = new Map<number, Span[]>()

  for (const event of events) {
    if (event.on) {
      pending.set(event.note, { startTick: event.tick, velocity: event.velocity })
      continue
    }

    const start = pending.get(event.note)
    if (!start) continue
    pending.delete(event.note)

    const list = spans.get(event.note)
    const span = { start: start.startTick, end: event.tick }
    if (list) list.push(span)
    else spans.set(event.note, [span])
  }

  return spans
}

function buildChart(
  difficulty: Difficulty,
  spans: Map<number, Span[]>,
  openSpans: Map<Difficulty | 'all', Span[]>,
  tempo: TempoMap,
  division: number,
  beats: number[],
): Chart | null {
  const base = DIFFICULTY_BASE[difficulty]

  // Agrupa por tick: notas que começam juntas formam um acorde.
  const byTick = new Map<number, { frets: number; length: number }>()

  for (let lane = 0; lane < 5; lane++) {
    for (const span of spans.get(base + lane) ?? []) {
      const entry = byTick.get(span.start)
      const length = span.end - span.start
      if (entry) {
        entry.frets |= 1 << lane
        entry.length = Math.max(entry.length, length)
      } else {
        byTick.set(span.start, { frets: 1 << lane, length })
      }
    }
  }

  if (byTick.size === 0) return null

  const forceOn = spans.get(base + FORCE_HOPO_ON) ?? []
  const forceOff = spans.get(base + FORCE_HOPO_OFF) ?? []
  const taps = spans.get(NOTE_TAP) ?? []
  const opens = openSpans.get(difficulty) ?? openSpans.get('all')

  // O limite de HOPO escala com a resolução do arquivo.
  const hopoThreshold = (division / 480) * HOPO_THRESHOLD_AT_480

  const ticks = [...byTick.keys()].sort((a, b) => a - b)
  const notes: Note[] = []
  let previousTick = -Infinity
  let previousFrets = -1
  let previousWasChord = false

  for (const tick of ticks) {
    const entry = byTick.get(tick)!
    const isOpen = inSpan(opens, tick)
    const frets = isOpen ? 0 : entry.frets
    const isChord = !isOpen && countBits(frets) > 1

    const naturalHopo =
      previousTick !== -Infinity &&
      tick - previousTick <= hopoThreshold &&
      !isChord &&
      !previousWasChord &&
      frets !== previousFrets

    let type: NoteType
    if (inSpan(taps, tick)) type = 'tap'
    else if (inSpan(forceOn, tick)) type = 'hopo'
    else if (inSpan(forceOff, tick)) type = 'strum'
    else type = naturalHopo ? 'hopo' : 'strum'

    const rawLength = entry.length
    const duration =
      rawLength >= sustainThreshold(division) ? tempo.durationOf(tick, rawLength) : 0

    notes.push({
      index: notes.length,
      time: tempo.timeAt(tick),
      duration,
      frets,
      type,
      isOpen,
    })

    previousTick = tick
    previousFrets = frets
    previousWasChord = isChord
  }

  const starPower: Phrase[] = (spans.get(NOTE_STAR_POWER) ?? [])
    .map((span) => ({ start: tempo.timeAt(span.start), end: tempo.timeAt(span.end) }))
    .sort((a, b) => a.start - b.start)

  return { difficulty, notes, starPower, beats }
}

function countBits(mask: number) {
  let n = 0
  while (mask) {
    n += mask & 1
    mask >>= 1
  }
  return n
}

export interface ParseMidiOptions {
  id?: string
  audioFiles?: string[]
  /** Metadados vindos do `song.ini`, que o MIDI não carrega. */
  meta?: Partial<SongMeta>
}

export function parseMidi(buffer: ArrayBuffer, options: ParseMidiOptions = {}): Song {
  const file = parseMidiFile(buffer)
  const { tempos, signatures } = buildTempoMap(file)
  const tempo = new TempoMap(file.division, tempos)

  const track = findGuitarTrack(file)
  if (!track) throw new Error('nenhuma trilha de guitarra encontrada no MIDI')

  const noteEvents = track.events.filter((e): e is MidiNoteEvent => e.kind === 'note')
  const spans = collectSpans(noteEvents)
  const openSpans = readOpenSpans(track)

  let lastTick = 0
  for (const list of spans.values()) {
    for (const span of list) lastTick = Math.max(lastTick, span.end)
  }

  const beats = tempo.beatTimes(lastTick, signatures)

  const charts: Partial<Record<Difficulty, Chart>> = {}
  for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as Difficulty[]) {
    const chart = buildChart(difficulty, spans, openSpans, tempo, file.division, beats)
    if (chart) charts[difficulty] = chart
  }

  const meta: SongMeta = {
    id: options.id ?? 'midi-song',
    name: 'Sem nome',
    artist: 'Desconhecido',
    charter: '',
    album: '',
    year: '',
    offset: 0,
    previewStart: 0,
    length: tempo.timeAt(lastTick),
    ...options.meta,
  }

  return { meta, charts, audioFiles: options.audioFiles ?? [] }
}
