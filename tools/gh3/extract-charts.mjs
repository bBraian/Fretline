/**
 * Extrai os charts do Guitar Hero III para o formato que o Fretline le.
 *
 * O caminho e: PAK -> pedaco `.qb` -> vetores -> arquivo `.chart`.
 *
 * ## O formato, como foi descoberto
 *
 * Um PAK da Neversoft e um cabecalho de entradas de 32 bytes em big-endian,
 * cada uma com [extensao, deslocamento, tamanho, pai, nome, caminho, ...],
 * terminado por uma entrada de extensao `2cb3ef3b`. Os nomes nao sobrevivem
 * no build de varejo — viraram somas de verificacao de uma funcao que nao e
 * o CRC-32 comum.
 *
 * Por isso nada aqui depende de nome: os vetores sao identificados pelo
 * **formato do conteudo**, que e inequivoco.
 *
 * - `00010100` e vetor de inteiros. Em trincas (tempo_ms, duracao_ms,
 *   mascara) com tempo crescente, e um chart. Sozinhos e crescentes, e a
 *   grade de batidas.
 * - `00010c00` e vetor de vetores. Cada elemento aponta para uma trinca
 *   (tempo_ms, duracao_ms, quantas notas) — um trecho de star power.
 *
 * A ordem no arquivo tambem informa, e foi conferida contra a musica: os
 * quatro primeiros charts sao a guitarra em ordem crescente de dificuldade,
 * os quatro seguintes sao a base.
 *
 * ## O que este script nao faz
 *
 * Nao toca no audio. Os bancos `.fsb.xen` estao cifrados, e decifra-los e
 * outro problema — as pastas saem com o chart pronto e um aviso dizendo
 * onde largar o audio.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const PAK_ENTRY_SIZE = 32
const PAK_LAST_ENTRY = 0x2cb3ef3b
const QB_EXTENSION = 0xa7f505c4

const ARRAY_OF_INTS = 0x00010100
const ARRAY_OF_ARRAYS = 0x00010c00
const SECTION_ARRAY = 0x00200c00

/** Resolucao do `.chart` gerado, em ticks por seminima. */
const RESOLUTION = 192

const DIFFICULTIES = ['EasySingle', 'MediumSingle', 'HardSingle', 'ExpertSingle']

// --- PAK ------------------------------------------------------------------

function readPak(buffer) {
  const entries = []
  for (let i = 0; i * PAK_ENTRY_SIZE + PAK_ENTRY_SIZE <= buffer.length; i++) {
    const at = i * PAK_ENTRY_SIZE
    const extension = buffer.readUInt32BE(at)
    if (extension === PAK_LAST_ENTRY) break

    const offset = buffer.readUInt32BE(at + 4)
    const size = buffer.readUInt32BE(at + 8)
    if (extension === 0 && offset === 0 && size === 0) break
    if (offset + size > buffer.length) break

    entries.push({ extension, offset, size })
  }
  return entries
}

// --- QB -------------------------------------------------------------------

/** Todos os vetores de um pedaco `.qb`, com tipo e conteudo cru. */
function readArrays(qb) {
  const fileKey = qb.readUInt32BE(36)
  const arrays = []

  for (let at = 28; at + 20 <= qb.length; at += 4) {
    if (qb.readUInt32BE(at + 8) !== fileKey) continue
    if (qb.readUInt32BE(at) !== SECTION_ARRAY) continue

    const value = qb.readUInt32BE(at + 12)
    if (value + 12 > qb.length) continue

    const elementType = qb.readUInt32BE(value)
    const count = qb.readUInt32BE(value + 4)
    const pointer = qb.readUInt32BE(value + 8)
    if (count === 0 || count > 500000 || pointer + count * 4 > qb.length) continue

    arrays.push({ at, elementType, count, pointer })
  }

  return arrays
}

function readInts(qb, pointer, count) {
  const out = new Int32Array(count)
  for (let i = 0; i < count; i++) out[i] = qb.readInt32BE(pointer + i * 4)
  return out
}

/** Um vetor de inteiros e um chart se for trincas de tempo crescente. */
function looksLikeChart(ints) {
  if (ints.length < 30 || ints.length % 3 !== 0) return false
  let previous = -1
  for (let i = 0; i < ints.length; i += 3) {
    const [time, duration, mask] = [ints[i], ints[i + 1], ints[i + 2]]
    if (time < previous || duration < 0 || duration > 30000 || mask <= 0 || mask > 0xff) return false
    previous = time
  }
  return true
}

function looksLikeBeatGrid(ints) {
  if (ints.length < 32) return false
  for (let i = 1; i < ints.length; i++) if (ints[i] <= ints[i - 1]) return false
  return true
}

/** Trechos de star power: cada elemento aponta para (tempo, duracao, notas). */
function readPhrases(qb, array) {
  const phrases = []
  for (let i = 0; i < array.count; i++) {
    const itemPointer = qb.readInt32BE(array.pointer + i * 4)
    if (itemPointer < 0 || itemPointer + 12 > qb.length) return []

    const innerCount = qb.readUInt32BE(itemPointer + 4)
    const innerPointer = qb.readUInt32BE(itemPointer + 8)
    if (innerCount !== 3 || innerPointer + 12 > qb.length) return []

    phrases.push({
      time: qb.readInt32BE(innerPointer),
      duration: qb.readInt32BE(innerPointer + 4),
      notes: qb.readInt32BE(innerPointer + 8),
    })
  }
  return phrases
}

// --- tempo ----------------------------------------------------------------

/**
 * Converte milissegundos em ticks usando a grade de batidas da propria
 * musica.
 *
 * Interpolar dentro da batida em que o tempo cai preserva o ritmo exato
 * mesmo quando o andamento muda no meio da faixa — e muda, em boa parte do
 * repertorio.
 */
function makeTickConverter(beats) {
  return (ms) => {
    if (beats.length < 2) return Math.round((ms / 500) * RESOLUTION)

    let lo = 0
    let hi = beats.length - 2
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (beats[mid] <= ms) lo = mid
      else hi = mid - 1
    }

    const span = beats[lo + 1] - beats[lo]
    const fraction = span > 0 ? (ms - beats[lo]) / span : 0
    return Math.round((lo + fraction) * RESOLUTION)
  }
}

/** Mudancas de andamento, uma por batida em que o intervalo muda. */
function tempoEvents(beats) {
  const events = []
  let lastBpm = -1

  for (let i = 0; i + 1 < beats.length; i++) {
    const interval = beats[i + 1] - beats[i]
    if (interval <= 0) continue
    const bpm = Math.round((60000 / interval) * 1000)
    if (bpm === lastBpm) continue
    events.push({ tick: i * RESOLUTION, bpm })
    lastBpm = bpm
  }

  if (events.length === 0) events.push({ tick: 0, bpm: 120000 })
  return events
}

// --- geracao do .chart ----------------------------------------------------

function buildChart(song) {
  const toTicks = makeTickConverter(song.beats)
  const lines = []

  lines.push('[Song]')
  lines.push('{')
  lines.push(`  Name = "${song.title}"`)
  lines.push(`  Artist = "${song.artist}"`)
  lines.push('  Charter = "extraido do Guitar Hero III"')
  lines.push('  Offset = 0')
  lines.push(`  Resolution = ${RESOLUTION}`)
  lines.push('  MusicStream = "song.ogg"')
  lines.push('}')

  lines.push('[SyncTrack]')
  lines.push('{')
  lines.push('  0 = TS 4')
  for (const { tick, bpm } of tempoEvents(song.beats)) lines.push(`  ${tick} = B ${bpm}`)
  lines.push('}')

  song.charts.forEach((chart, index) => {
    if (!chart) return
    lines.push(`[${DIFFICULTIES[index]}]`)
    lines.push('{')

    for (let i = 0; i < chart.length; i += 3) {
      const tick = toTicks(chart[i])
      const endTick = toTicks(chart[i] + chart[i + 1])
      // Sustain curto e artefato de gravacao, nao intencao do charter.
      const length = endTick - tick >= RESOLUTION / 4 ? endTick - tick : 0
      // Os cinco bits baixos sao os trastes; o resto sao marcacoes que este
      // jogo nao usa, porque nele nao existe palhetada.
      const mask = chart[i + 2] & 0x1f

      for (let fret = 0; fret < 5; fret++) {
        if (mask & (1 << fret)) lines.push(`  ${tick} = N ${fret} ${length}`)
      }
    }

    for (const phrase of song.phrases[index] ?? []) {
      const tick = toTicks(phrase.time)
      const length = toTicks(phrase.time + phrase.duration) - tick
      if (length > 0) lines.push(`  ${tick} = S 2 ${length}`)
    }

    lines.push('}')
  })

  return lines.join('\n') + '\n'
}

function buildIni(song) {
  const lengthMs = song.beats.at(-1) ?? 0
  return [
    '[song]',
    `name = ${song.title}`,
    `artist = ${song.artist}`,
    'album = Guitar Hero III',
    'charter = extraido do jogo',
    `song_length = ${lengthMs}`,
    'preview_start_time = 30000',
    'delay = 0',
    '',
  ].join('\n')
}

// --- extracao de uma musica -----------------------------------------------

function extract(pakPath, title) {
  const buffer = readFileSync(pakPath)
  const entries = readPak(buffer)

  // O maior pedaco `.qb` e o que carrega as notas; o outro e um script curto.
  const qbEntries = entries.filter((e) => e.extension === QB_EXTENSION)
  if (qbEntries.length === 0) throw new Error('nenhum pedaco .qb no PAK')

  const biggest = qbEntries.reduce((a, b) => (b.size > a.size ? b : a))
  const qb = buffer.subarray(biggest.offset, biggest.offset + biggest.size)

  const arrays = readArrays(qb)

  const charts = []
  const phrases = []
  let beats = null

  for (const array of arrays) {
    if (array.elementType === ARRAY_OF_INTS) {
      const ints = readInts(qb, array.pointer, array.count)
      if (looksLikeChart(ints) && charts.length < 4) charts.push(ints)
      else if (!beats && looksLikeBeatGrid(ints)) beats = ints
    } else if (array.elementType === ARRAY_OF_ARRAYS && phrases.length < 4) {
      const list = readPhrases(qb, array)
      if (list.length > 0) phrases.push(list)
    }
  }

  if (charts.length === 0) throw new Error('nenhum chart encontrado')
  if (!beats) throw new Error('grade de batidas ausente')

  return { title, artist: 'Guitar Hero III', charts, phrases, beats: [...beats] }
}

// --- linha de comando -----------------------------------------------------

const [songsDir, outputDir] = process.argv.slice(2)
if (!songsDir || !outputDir) {
  console.error('uso: node extract-charts.mjs <DATA/SONGS> <pasta de saida>')
  process.exit(1)
}

const files = readdirSync(songsDir).filter((name) => name.endsWith('_song.pak.xen'))
console.log(`${files.length} musicas em ${songsDir}\n`)

let ok = 0
const failures = []

for (const file of files) {
  const id = file.replace('_song.pak.xen', '')
  const title = id.charAt(0).toUpperCase() + id.slice(1)

  try {
    const song = extract(path.join(songsDir, file), title)
    const dir = path.join(outputDir, title)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'notes.chart'), buildChart(song))
    writeFileSync(path.join(dir, 'song.ini'), buildIni(song))
    writeFileSync(
      path.join(dir, 'FALTA-O-AUDIO.txt'),
      'Largue o audio desta musica aqui como song.ogg (ou .mp3/.wav).\n' +
        'Com faixas separadas, o nome guitar.ogg faz a guitarra ser cortada nos erros.\n',
    )

    const notes = song.charts.map((c) => c.length / 3).join('/')
    console.log(`  ${title.padEnd(26)} ${notes} notas, ${song.beats.length} batidas`)
    ok++
  } catch (error) {
    failures.push(`${id}: ${error.message}`)
  }
}

console.log(`\n${ok} musicas extraidas para ${outputDir}`)
if (failures.length > 0) {
  console.log(`${failures.length} falharam:`)
  for (const failure of failures.slice(0, 10)) console.log(`  ${failure}`)
}
