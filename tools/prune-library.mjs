/**
 * Remove da pasta `songs/` o que nao da para tocar.
 *
 * Extrair uma instalacao inteira do Guitar Hero III enche a biblioteca de
 * charts sem audio. Eles aparecem no jogo marcados como "sem audio", o que e
 * util enquanto voce esta atras dos arquivos — e vira lixo depois que voce
 * desiste deles.
 *
 * A carreira e montada a partir do que e tocavel, entao nada aqui precisa
 * saber de setlist: o criterio e simplesmente ter, ou nao ter, um arquivo de
 * audio na pasta.
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

const AUDIO = new Set(['.ogg', '.mp3', '.wav', '.opus', '.m4a'])
const CHARTS = new Set(['.chart', '.mid', '.midi'])

/** O titulo de verdade de uma pasta: o do `song.ini`, se houver. */
function titleOf(folder) {
  try {
    const text = readFileSync(path.join(folder, 'song.ini'), 'utf8')
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

function inventory(dir) {
  const names = readdirSync(dir)
  return {
    audio: names.filter((n) => AUDIO.has(path.extname(n).toLowerCase())).length,
    chart: names.some((n) => CHARTS.has(path.extname(n).toLowerCase())),
  }
}

// --- execucao -------------------------------------------------------------

const args = process.argv.slice(2)
const songsDir = args.find((a) => !a.startsWith('--')) ?? 'songs'
const apply = args.includes('--apagar')

const keep = []
const remove = []

for (const entry of readdirSync(songsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue

  const dir = path.join(songsDir, entry.name)
  const { audio, chart } = inventory(dir)
  const item = { folder: entry.name, title: titleOf(dir), dir, audio, chart }

  // Sem chart tambem nao serve, mas ai nem chega a aparecer no jogo.
  if (audio > 0 && chart) keep.push(item)
  else remove.push(item)
}

console.log(`--- tocaveis (${keep.length}) ---`)
for (const item of keep.sort((a, b) => a.title.localeCompare(b.title))) {
  console.log(`  ${item.title.padEnd(40)} ${item.audio} faixa(s)`)
}

const totalBytes = remove.reduce((sum, item) => sum + folderSize(item.dir), 0)
console.log(`\n--- sai (${remove.length} pastas, ${(totalBytes / 1024 / 1024).toFixed(1)} MB) ---`)
for (const item of remove) {
  const reason = !item.chart ? 'sem chart' : 'sem audio'
  console.log(`  ${item.title.padEnd(40)} ${reason}`)
}

if (remove.length === 0) {
  console.log('  (nada)')
} else if (!apply) {
  console.log('\nEnsaio: nada foi apagado. Rode de novo com --apagar para valer.')
} else {
  for (const item of remove) rmSync(item.dir, { recursive: true, force: true })
  console.log(`\n${remove.length} pastas apagadas. Restaram ${keep.length}.`)
}
