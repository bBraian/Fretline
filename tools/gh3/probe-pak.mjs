/**
 * Sonda a estrutura de um PAK do Guitar Hero III.
 *
 * O formato é o da Neversoft: um cabeçalho de entradas de tamanho fixo,
 * cada uma apontando para um pedaço de dados dentro do mesmo arquivo. Os
 * nomes não sobrevivem no build de varejo — no lugar deles vão somas de
 * verificação —, então identificar o que é cada coisa depende de olhar os
 * primeiros bytes de cada pedaço.
 *
 * Este script não decide nada: só imprime o que encontrou, para confirmar o
 * layout antes de escrever o extrator de verdade.
 */

import { readFileSync } from 'node:fs'

const ENTRY_SIZE = 32

function u32(buf, at) {
  return buf.readUInt32BE(at)
}

function preview(buf, at, length = 8) {
  const bytes = buf.subarray(at, at + length)
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ')
  const ascii = [...bytes].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('')
  return `${hex}  |${ascii}|`
}

const path = process.argv[2]
const buf = readFileSync(path)
console.log(`arquivo: ${path}`)
console.log(`tamanho: ${buf.length} bytes\n`)

console.log('--- primeiras entradas do cabeçalho, campo a campo ---')
for (let i = 0; i < 6; i++) {
  const at = i * ENTRY_SIZE
  const fields = []
  for (let f = 0; f < 8; f++) fields.push(u32(buf, at + f * 4).toString(16).padStart(8, '0'))
  console.log(`  #${i}: ${fields.join(' ')}`)
}

console.log('\n--- interpretando como [ext, offset, tamanho, ...] ---')
let entries = 0
for (let i = 0; i < 400; i++) {
  const at = i * ENTRY_SIZE
  if (at + ENTRY_SIZE > buf.length) break

  const ext = u32(buf, at)
  const offset = u32(buf, at + 4)
  const size = u32(buf, at + 8)

  // O fim do cabeçalho é marcado por uma entrada zerada ou por uma extensão
  // impossível.
  if (ext === 0 && offset === 0 && size === 0) {
    console.log(`  fim do cabeçalho na entrada ${i}`)
    break
  }
  if (offset + size > buf.length) {
    console.log(`  entrada ${i} aponta para fora do arquivo (off ${offset}, size ${size}) — parando`)
    break
  }

  entries++
  if (i < 12) {
    console.log(
      `  #${String(i).padStart(2)} ext=${ext.toString(16).padStart(8, '0')} ` +
        `off=${String(offset).padStart(9)} size=${String(size).padStart(9)}  ${preview(buf, offset)}`,
    )
  }
}
console.log(`\ntotal de entradas plausíveis: ${entries}`)

console.log('\n--- assinaturas encontradas no arquivo ---')
const signatures = ['QBKY', 'CHNK', '.qb', 'MThd', 'FSB4', 'IMGB']
for (const sig of signatures) {
  const at = buf.indexOf(Buffer.from(sig, 'latin1'))
  console.log(`  ${sig.padEnd(6)} ${at >= 0 ? `em ${at}` : 'não encontrado'}`)
}
