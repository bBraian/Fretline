/**
 * Deixa na pasta `songs/` apenas o que faz parte da carreira.
 *
 * Extrair uma instalacao inteira do Guitar Hero III enche a biblioteca com
 * cento e cinquenta musicas que nao estao na setlist, a maioria sem audio.
 * Este script apaga as que sobram.
 *
 * O pareamento e pelo **titulo**, nao pelo nome da pasta: um pack baixado
 * chega como `Heart - Barracuda (Harmonix)` e o titulo de verdade esta no
 * `song.ini` dentro dela. A normalizacao e a mesma que a carreira usa —
 * sem acento, sem pontuacao, sem artigo — para que `Anarchyintheuk` e
 * `Anarchy in the U.K.` sejam a mesma coisa.
 *
 * Por padrao so mostra o que faria. Use `--apagar` para valer.
 *
 * ```
 * node tools/prune-library.mjs songs
 * node tools/prune-library.mjs songs --apagar
 * ```
 */

import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'

const SETLIST_FILE = 'src/content/setlists.ts'

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/&/g, 'and')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Le os titulos da carreira do proprio arquivo de setlist.
 *
 * Ler o TypeScript com expressao regular so funciona porque o formato do
 * arquivo e controlado — uma linha `title: '...'` por faixa. Se algum dia
 * ele mudar, o script para de achar titulos e avisa, em vez de apagar a
 * biblioteca inteira por engano.
 */
function readSetlistTitles() {
  const source = readFileSync(SETLIST_FILE, 'utf8')
  const titles = [...source.matchAll(/title:\s*(['"])(.*?)\1/g)].map((m) => m[2])
  const aliases = [...source.matchAll(/aliases:\s*\[(.*?)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/(['"])(.*?)\1/g)].map((a) => a[2]),
  )

  if (titles.length === 0) {
    throw new Error(`nenhum titulo encontrado em ${SETLIST_FILE} — abortando por seguranca`)
  }
  return [...titles, ...aliases]
}

/** O titulo de verdade de uma pasta: o do `song.ini`, se houver. */
function titleOf(folder) {
  const ini = path.join(folder, 'song.ini')
  try {
    const text = readFileSync(ini, 'utf8')
    const match = text.match(/^\s*name\s*=\s*(.+)$/im)
    if (match) return match[1].trim()
  } catch {
    // Sem `song.ini`, o nome da pasta e a melhor informacao disponivel.
  }
  return path.basename(folder)
}

function folderSize(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    total += entry.isDirectory() ? folderSize(full) : statSync(full).size
  }
  return total
}

function hasAudio(dir) {
  const audio = new Set(['.ogg', '.mp3', '.wav', '.opus', '.m4a'])
  return readdirSync(dir).some((name) => audio.has(path.extname(name).toLowerCase()))
}

// --- execucao -------------------------------------------------------------

const args = process.argv.slice(2)
const songsDir = args.find((a) => !a.startsWith('--')) ?? 'songs'
const apply = args.includes('--apagar')

const wanted = new Set(readSetlistTitles().map(normalize))
console.log(`carreira: ${wanted.size} faixas\n`)

const keep = []
const remove = []

for (const entry of readdirSync(songsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue

  const full = path.join(songsDir, entry.name)
  const title = titleOf(full)
  const key = normalize(title)

  // Alem da igualdade, vale prefixo: o nome interno do jogo costuma ser a
  // versao curta do titulo ("Cities on Flame" para "Cities on Flame with
  // Rock and Roll"). O minimo de oito caracteres evita que um nome curto
  // case com meia biblioteca.
  const matched =
    wanted.has(key) ||
    [...wanted].some(
      (want) => key.length >= 8 && (want.startsWith(key) || key.startsWith(want)),
    )

  const target = matched ? keep : remove
  target.push({ folder: entry.name, title, dir: full })
}

console.log('--- fica ---')
for (const item of keep.sort((a, b) => a.title.localeCompare(b.title))) {
  const audio = hasAudio(item.dir) ? 'com audio' : 'sem audio'
  console.log(`  ${item.title.padEnd(34)} ${audio.padEnd(10)} ${item.folder}`)
}

const totalBytes = remove.reduce((sum, item) => sum + folderSize(item.dir), 0)
console.log(`\n--- sai (${remove.length} pastas, ${(totalBytes / 1024 / 1024).toFixed(1)} MB) ---`)
for (const item of remove.slice(0, 12)) console.log(`  ${item.title}`)
if (remove.length > 12) console.log(`  ... e mais ${remove.length - 12}`)

// Quase-acertos: pastas que compartilham um comeco com alguma faixa da
// carreira. Se algo da setlist tiver ficado de fora por diferenca de grafia,
// e aqui que aparece — antes de sumir.
const suspicious = remove.filter((item) => {
  const key = normalize(item.title)
  return [...wanted].some((want) => key.slice(0, 6) === want.slice(0, 6))
})
if (suspicious.length > 0) {
  console.log('\n--- parecidas com a carreira, confira antes ---')
  for (const item of suspicious) console.log(`  ${item.title}  (pasta ${item.folder})`)
}

if (!apply) {
  console.log('\nEnsaio: nada foi apagado. Rode de novo com --apagar para valer.')
} else {
  for (const item of remove) rmSync(item.dir, { recursive: true, force: true })
  console.log(`\n${remove.length} pastas apagadas. Restaram ${keep.length}.`)
}
