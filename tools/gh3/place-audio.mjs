/**
 * Distribui audio extraido do Guitar Hero III pelas pastas dos charts.
 *
 * Depois de extrair os bancos de som com uma ferramenta da comunidade, o
 * resultado costuma ser uma pilha de arquivos com o nome interno do jogo —
 * `Barracuda.ogg`, ou `Barracuda_0.ogg`, `Barracuda_1.ogg` quando o banco
 * traz as faixas separadas. Casar isso com as 158 pastas de chart na mao e
 * um trabalho de uma tarde.
 *
 * Este script faz o pareamento pelo nome normalizado, do mesmo jeito que a
 * carreira casa musica com setlist: sem acento, sem pontuacao, sem artigo.
 * Assim `Anarchyintheuk.ogg` encontra a pasta `Anarchyintheuk`, e
 * `Black Magic Woman.ogg` encontra `Blackmagicwoman`.
 *
 * ## Faixas separadas
 *
 * Quando um banco tem mais de um som, a ordem dos arquivos decide o papel de
 * cada um. A ordem padrao abaixo e a mais comum, mas varia por jogo e por
 * ferramenta — confira uma musica antes de rodar em tudo, e ajuste com
 * `--ordem`. O papel importa: a faixa chamada `guitar` e a que o jogo corta
 * quando voce erra.
 *
 * ```
 * node tools/gh3/place-audio.mjs <pasta com o audio> songs
 * node tools/gh3/place-audio.mjs <pasta> songs --ordem=guitar,song,rhythm
 * node tools/gh3/place-audio.mjs <pasta> songs --mover
 * ```
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'

const AUDIO_EXTENSIONS = new Set(['.ogg', '.mp3', '.wav', '.opus', '.m4a'])

/** Ordem padrao dos sons dentro de um banco com varias faixas. */
const DEFAULT_ORDER = ['guitar', 'song', 'rhythm']

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/&/g, 'and')
    .replace(/^the/, '')
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Separa o sufixo de indice do nome, quando houver.
 *
 * `Barracuda_1.ogg` e `Barracuda 2.ogg` viram ambos `barracuda`, com indice
 * 1 e 2 — e e o indice que decide qual faixa e qual.
 */
function splitIndex(baseName) {
  const match = baseName.match(/^(.*?)[ _-](\d{1,2})$/)
  return match ? { name: match[1], index: Number(match[2]) } : { name: baseName, index: 0 }
}

/** Todos os arquivos de audio de uma pasta, inclusive em subpastas. */
function collectAudio(dir, depth = 0, found = []) {
  if (depth > 3) return found
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectAudio(full, depth + 1, found)
    else if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) found.push(full)
  }
  return found
}

function hasAudio(folder) {
  return readdirSync(folder).some((name) => AUDIO_EXTENSIONS.has(path.extname(name).toLowerCase()))
}

// --- argumentos -----------------------------------------------------------

const args = process.argv.slice(2)
const [audioDir, songsDir] = args.filter((a) => !a.startsWith('--'))

if (!audioDir || !songsDir) {
  console.error(
    'uso: node place-audio.mjs <pasta com o audio> <pasta songs> [--ordem=a,b,c] [--mover]',
  )
  process.exit(1)
}

const orderArg = args.find((a) => a.startsWith('--ordem='))
const order = orderArg ? orderArg.slice('--ordem='.length).split(',') : DEFAULT_ORDER
const move = args.includes('--mover')

// --- pareamento -----------------------------------------------------------

const folders = new Map()
for (const entry of readdirSync(songsDir, { withFileTypes: true })) {
  if (entry.isDirectory()) folders.set(normalize(entry.name), entry.name)
}

const audioFiles = collectAudio(audioDir)
console.log(`${audioFiles.length} arquivos de audio, ${folders.size} pastas de musica`)
console.log(`ordem das faixas: ${order.join(', ')}\n`)

/** Agrupa os arquivos por musica, guardando o indice de cada faixa. */
const bySong = new Map()
for (const file of audioFiles) {
  const { name, index } = splitIndex(path.basename(file, path.extname(file)))
  const key = normalize(name)

  const list = bySong.get(key)
  if (list) list.push({ file, index })
  else bySong.set(key, [{ file, index }])
}

// --- aplicacao ------------------------------------------------------------

let placed = 0
const unmatched = []

for (const [key, tracks] of bySong) {
  const folder = folders.get(key)
  if (!folder) {
    unmatched.push(tracks[0].file)
    continue
  }

  tracks.sort((a, b) => a.index - b.index)
  const target = path.join(songsDir, folder)
  mkdirSync(target, { recursive: true })

  for (const [i, track] of tracks.entries()) {
    // Com uma faixa so, ela e a mixagem inteira: vira `song`.
    const role = tracks.length === 1 ? 'song' : (order[i] ?? `extra${i}`)
    const destination = path.join(target, `${role}${path.extname(track.file)}`)
    if (move) renameSync(track.file, destination)
    else copyFileSync(track.file, destination)
  }

  // O aviso deixa de fazer sentido assim que o audio chega.
  const notice = path.join(target, 'FALTA-O-AUDIO.txt')
  if (existsSync(notice)) rmSync(notice)

  console.log(`  ${folder.padEnd(26)} ${tracks.length} faixa(s)`)
  placed++
}

console.log(`\n${placed} musicas com audio`)

const missing = [...folders.values()].filter(
  (name) => !hasAudio(path.join(songsDir, name)),
)
if (missing.length > 0) {
  const list = missing.slice(0, 8).join(', ')
  console.log(`${missing.length} ainda sem audio: ${list}${missing.length > 8 ? ' ...' : ''}`)
}

if (unmatched.length > 0) {
  console.log(`\n${unmatched.length} arquivos sem pasta correspondente:`)
  for (const file of unmatched.slice(0, 8)) console.log(`  ${path.basename(file)}`)
}
