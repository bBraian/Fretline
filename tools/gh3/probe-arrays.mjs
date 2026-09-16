/**
 * Classifica os vetores de um `.qb` pelo formato do conteúdo.
 *
 * Os nomes das seções viraram somas de verificação de uma função que não é
 * o CRC-32 comum, então casá-los por nome exigiria descobrir a função. Não
 * é preciso: o conteúdo já diz o que cada vetor é.
 *
 * - **notas** — trincas (tempo, duração, máscara) com tempo crescente,
 *   duração plausível e máscara dentro do alcance de cinco trastes;
 * - **trechos** — trincas em número bem menor, que são star power e solos;
 * - **grade de batidas** — inteiros crescentes, sozinhos;
 * - **fórmula de compasso** — trincas (tempo, numerador, denominador).
 *
 * A ordem também informa: as quatro maiores listas de notas aparecem em
 * ordem crescente de densidade, que é a ordem das dificuldades.
 */

import { readFileSync } from 'node:fs'

const [pakPath, offsetArg, sizeArg] = process.argv.slice(2)
const pak = readFileSync(pakPath)
const qb = pak.subarray(Number(offsetArg), Number(offsetArg) + Number(sizeArg))

const fileKey = qb.readUInt32BE(36)

function readInts(pointer, count) {
  const out = new Int32Array(count)
  for (let i = 0; i < count; i++) out[i] = qb.readInt32BE(pointer + i * 4)
  return out
}

/** Decide o que é um vetor a partir do formato dos números. */
function classify(ints) {
  if (ints.length === 0) return 'vazio'

  const risingSingles = ints.every((v, i) => i === 0 || v > ints[i - 1])
  if (risingSingles && ints.length > 32) return 'grade de batidas'

  if (ints.length % 3 === 0) {
    let notes = true
    let timesig = true
    let previous = -1
    for (let i = 0; i < ints.length; i += 3) {
      const time = ints[i]
      const second = ints[i + 1]
      const third = ints[i + 2]
      if (time < previous) {
        notes = false
        timesig = false
      }
      previous = time
      if (second < 0 || second > 20000 || third <= 0 || third > 63) notes = false
      if (second < 1 || second > 32 || third < 1 || third > 32) timesig = false
    }
    if (timesig && ints.length <= 90) return 'formula de compasso'
    if (notes) return ints.length > 300 ? 'notas' : 'trechos'
  }

  if (ints.length % 2 === 0) {
    let pairs = true
    let previous = -1
    for (let i = 0; i < ints.length; i += 2) {
      if (ints[i] < previous) pairs = false
      previous = ints[i]
    }
    if (pairs) return 'pares'
  }

  return 'outro'
}

const found = []

for (let at = 28; at + 20 <= qb.length; at += 4) {
  if (qb.readUInt32BE(at + 8) !== fileKey) continue
  if (qb.readUInt32BE(at) !== 0x00200c00) continue

  const value = qb.readUInt32BE(at + 12)
  if (value + 12 > qb.length) continue

  const count = qb.readUInt32BE(value + 4)
  const pointer = qb.readUInt32BE(value + 8)
  if (count === 0 || count > 200000) continue
  if (pointer + count * 4 > qb.length) continue

  found.push({ at, count, ints: readInts(pointer, count) })
}

console.log('--- vetores ---')
for (const item of found.slice(0, 24)) {
  const kind = classify(item.ints)
  const head = [...item.ints.slice(0, 9)].join(', ')
  console.log(
    `  @${String(item.at).padStart(7)} ${String(item.count).padStart(6)} ints  ` +
      `${kind.padEnd(22)} [${head}${item.count > 9 ? ', ...' : ''}]`,
  )
}

const charts = found.filter((f) => classify(f.ints) === 'notas')
console.log(`\nlistas de notas: ${charts.length}`)
for (const chart of charts) {
  const last = chart.ints[chart.count - 3]
  console.log(`  ${String(chart.count / 3).padStart(5)} notas, ultima em ${(last / 1000).toFixed(1)}s`)
}

const bars = found.find((f) => classify(f.ints) === 'grade de batidas')
if (bars) {
  const span = (bars.ints[bars.count - 1] - bars.ints[0]) / 1000
  console.log(`\ngrade de batidas: ${bars.count} batidas em ${span.toFixed(1)}s`)
  console.log(`  BPM medio: ${((bars.count / span) * 60).toFixed(1)}`)
}
