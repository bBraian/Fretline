/**
 * Parser do formato `.chart` (Moonscraper / Clone Hero).
 *
 * O arquivo é um texto em seções:
 *
 *     [Song]        metadados
 *     [SyncTrack]   mudanças de BPM e de fórmula de compasso
 *     [Events]      seções nomeadas da música
 *     [ExpertSingle] notas daquela dificuldade
 *
 * A saída é o modelo normalizado do engine, com tudo em segundos. Nenhuma
 * camada depois daqui conhece tick.
 */

import type { Chart, Difficulty, Note, NoteType, Phrase, Song, SongMeta } from '../types'
import { TempoMap, type TempoEvent, type TimeSignature } from './tempoMap'

const SECTION_BY_DIFFICULTY: Record<Difficulty, string> = {
  easy: 'EasySingle',
  medium: 'MediumSingle',
  hard: 'HardSingle',
  expert: 'ExpertSingle',
}

/** Flags que ocupam o lugar de um traste num evento `N`. */
const FLAG_FORCED = 5
const FLAG_TAP = 6
const FLAG_OPEN = 7

/** Tipo do evento `S`: 2 é trecho de star power. */
const SPECIAL_STAR_POWER = 2

/**
 * Distância máxima, em ticks a uma resolução de 192, para que uma nota seja
 * HOPO naturalmente. É o valor que o Moonscraper usa por padrão.
 */
const DEFAULT_HOPO_THRESHOLD_AT_192 = 65

interface RawNoteEvent {
  tick: number
  value: number
  length: number
}

interface RawSpecial {
  tick: number
  type: number
  length: number
}

function splitSections(text: string): Map<string, string[]> {
  const sections = new Map<string, string[]>()
  const lines = text.split(/\r?\n/)
  let current: string | null = null
  let buffer: string[] = []
  let depth = 0

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (current === null) {
      const header = /^\[(.+)\]$/.exec(line)
      if (header) {
        current = header[1]
        buffer = []
        depth = 0
      }
      continue
    }

    if (line === '{') {
      depth++
      continue
    }
    if (line === '}') {
      depth--
      if (depth <= 0) {
        sections.set(current, buffer)
        current = null
      }
      continue
    }
    buffer.push(line)
  }

  return sections
}

function parseSongSection(lines: string[] | undefined): Map<string, string> {
  const out = new Map<string, string>()
  if (!lines) return out
  for (const line of lines) {
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1)
    }
    out.set(key, value)
  }
  return out
}

function parseSyncTrack(lines: string[] | undefined) {
  const tempos: TempoEvent[] = []
  const signatures: TimeSignature[] = []
  if (!lines) return { tempos, signatures }

  for (const line of lines) {
    const m = /^(\d+)\s*=\s*(\w+)\s+(.*)$/.exec(line)
    if (!m) continue
    const tick = Number(m[1])
    const kind = m[2].toUpperCase()
    const args = m[3].trim().split(/\s+/).map(Number)

    if (kind === 'B') {
      tempos.push({ tick, bpmThousandths: args[0] })
    } else if (kind === 'TS') {
      // O segundo argumento é o expoente do denominador; omitido significa 2 (= /4).
      const exponent = Number.isFinite(args[1]) ? args[1] : 2
      signatures.push({ tick, numerator: args[0], denominator: 2 ** exponent })
    }
  }

  return { tempos, signatures }
}

function parseTrack(lines: string[] | undefined) {
  const notes: RawNoteEvent[] = []
  const specials: RawSpecial[] = []
  if (!lines) return { notes, specials }

  for (const line of lines) {
    const m = /^(\d+)\s*=\s*(\w+)\s+(.*)$/.exec(line)
    if (!m) continue
    const tick = Number(m[1])
    const kind = m[2].toUpperCase()
    const args = m[3].trim().split(/\s+/)

    if (kind === 'N') {
      notes.push({ tick, value: Number(args[0]), length: Number(args[1]) || 0 })
    } else if (kind === 'S') {
      specials.push({ tick, type: Number(args[0]), length: Number(args[1]) || 0 })
    }
  }

  return { notes, specials }
}

/**
 * Agrupa os eventos `N` por tick e resolve o tipo de cada nota.
 *
 * As flags de forced e tap chegam como eventos separados no mesmo tick, por
 * isso o agrupamento vem antes de decidir qualquer coisa sobre o tipo.
 */
function buildNotes(raw: RawNoteEvent[], tempo: TempoMap, hopoThreshold: number): Note[] {
  const byTick = new Map<number, RawNoteEvent[]>()
  for (const ev of raw) {
    const list = byTick.get(ev.tick)
    if (list) list.push(ev)
    else byTick.set(ev.tick, [ev])
  }

  const ticks = [...byTick.keys()].sort((a, b) => a - b)
  const notes: Note[] = []
  let prevTick = -Infinity
  let prevFrets = -1
  let prevWasChord = false

  for (const tick of ticks) {
    const events = byTick.get(tick)!
    let frets = 0
    let maxLength = 0
    let forced = false
    let tap = false
    let open = false

    for (const ev of events) {
      if (ev.value >= 0 && ev.value <= 4) {
        frets |= 1 << ev.value
        maxLength = Math.max(maxLength, ev.length)
      } else if (ev.value === FLAG_FORCED) {
        forced = true
      } else if (ev.value === FLAG_TAP) {
        tap = true
      } else if (ev.value === FLAG_OPEN) {
        open = true
        maxLength = Math.max(maxLength, ev.length)
      }
    }

    if (frets === 0 && !open) continue
    if (open) frets = 0

    const isChord = countBits(frets) > 1

    // Regra natural do gênero: uma nota vira HOPO quando cai perto da
    // anterior, não é acorde, e usa um traste diferente. A flag `forced`
    // inverte esse resultado; a flag `tap` ganha de tudo.
    const closeEnough = tick - prevTick <= hopoThreshold
    const differentFret = frets !== prevFrets
    const naturalHopo =
      closeEnough && !isChord && differentFret && !prevWasChord && prevTick !== -Infinity

    let type: NoteType
    if (tap) type = 'tap'
    else if (forced) type = naturalHopo ? 'strum' : 'hopo'
    else type = naturalHopo ? 'hopo' : 'strum'

    notes.push({
      index: notes.length,
      time: tempo.timeAt(tick),
      duration: tempo.durationOf(tick, maxLength),
      frets,
      type,
      isOpen: open,
    })

    prevTick = tick
    prevFrets = frets
    prevWasChord = isChord
  }

  return notes
}

function countBits(mask: number) {
  let n = 0
  while (mask) {
    n += mask & 1
    mask >>= 1
  }
  return n
}

function buildStarPower(specials: RawSpecial[], tempo: TempoMap): Phrase[] {
  return specials
    .filter((s) => s.type === SPECIAL_STAR_POWER)
    .map((s) => ({ start: tempo.timeAt(s.tick), end: tempo.timeAt(s.tick + s.length) }))
    .sort((a, b) => a.start - b.start)
}

export interface ParseChartOptions {
  /** Identificador da música; por padrão vem do nome da pasta. */
  id?: string
  /** Arquivos de áudio encontrados junto do chart. */
  audioFiles?: string[]
}

export function parseChart(text: string, options: ParseChartOptions = {}): Song {
  const sections = splitSections(text)
  const song = parseSongSection(sections.get('Song'))

  const resolution = Number(song.get('Resolution')) || 192
  const { tempos, signatures } = parseSyncTrack(sections.get('SyncTrack'))
  const tempo = new TempoMap(resolution, tempos)

  const declaredThreshold = Number(song.get('HopoThreshold'))
  const hopoThreshold = Number.isFinite(declaredThreshold) && declaredThreshold > 0
    ? declaredThreshold
    : (resolution / 192) * DEFAULT_HOPO_THRESHOLD_AT_192

  const meta: SongMeta = {
    id: options.id ?? slug(song.get('Name') ?? 'song'),
    name: song.get('Name') ?? 'Sem nome',
    artist: song.get('Artist') ?? 'Desconhecido',
    charter: song.get('Charter') ?? '',
    album: song.get('Album') ?? '',
    year: (song.get('Year') ?? '').replace(/^,\s*/, ''),
    // O `Offset` do .chart vem em segundos e desloca o áudio, não as notas.
    offset: Number(song.get('Offset')) || 0,
    previewStart: (Number(song.get('PreviewStart')) || 0) / 1000,
    length: 0,
  }

  const charts: Partial<Record<Difficulty, Chart>> = {}
  let lastTick = 0

  for (const [difficulty, sectionName] of Object.entries(SECTION_BY_DIFFICULTY) as [
    Difficulty,
    string,
  ][]) {
    const lines = sections.get(sectionName)
    if (!lines) continue

    const { notes: rawNotes, specials } = parseTrack(lines)
    if (rawNotes.length === 0) continue

    for (const ev of rawNotes) lastTick = Math.max(lastTick, ev.tick + ev.length)

    charts[difficulty] = {
      difficulty,
      notes: buildNotes(rawNotes, tempo, hopoThreshold),
      starPower: buildStarPower(specials, tempo),
      beats: [],
    }
  }

  const beats = tempo.beatTimes(lastTick, signatures)
  for (const chart of Object.values(charts)) chart.beats = beats

  meta.length = tempo.timeAt(lastTick)

  const audioStream = song.get('MusicStream')
  const audioFiles = options.audioFiles ?? (audioStream ? [audioStream] : [])

  return { meta, charts, audioFiles }
}

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
