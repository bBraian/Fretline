/**
 * Descobre o tipo de elemento de cada vetor do `.qb`.
 *
 * O classificador anterior tratou todo vetor como lista de inteiros e
 * acertou os charts, mas errou os vetores pequenos: os numeros deles crescem
 * de 24 em 24, o que nao e tempo de musica — e ponteiro. Ou seja, sao
 * vetores de estruturas, e o cabecalho do vetor deve dizer isso numa palavra
 * que o leitor anterior ignorava.
 *
 * Este script imprime essa palavra ao lado do conteudo, para separar os dois
 * casos antes de escrever o extrator.
 */

import { readFileSync } from 'node:fs'

const [pakPath, offsetArg, sizeArg] = process.argv.slice(2)
const pak = readFileSync(pakPath)
const qb = pak.subarray(Number(offsetArg), Number(offsetArg) + Number(sizeArg))
const fileKey = qb.readUInt32BE(36)

console.log('  @secao   tipoVetor  itens  ponteiro  primeiros valores')

let shown = 0
for (let at = 28; at + 20 <= qb.length && shown < 26; at += 4) {
  if (qb.readUInt32BE(at + 8) !== fileKey) continue
  if (qb.readUInt32BE(at) !== 0x00200c00) continue

  const value = qb.readUInt32BE(at + 12)
  if (value + 12 > qb.length) continue

  const elementType = qb.readUInt32BE(value)
  const count = qb.readUInt32BE(value + 4)
  const pointer = qb.readUInt32BE(value + 8)
  if (count === 0 || count > 200000 || pointer + count * 4 > qb.length) continue

  const head = []
  for (let i = 0; i < Math.min(6, count); i++) head.push(qb.readInt32BE(pointer + i * 4))

  console.log(
    `  ${String(at).padStart(7)}  ${elementType.toString(16).padStart(8, '0')}  ` +
      `${String(count).padStart(5)}  ${String(pointer).padStart(8)}  [${head.join(', ')}]`,
  )
  shown++
}

// Para os vetores de estrutura, o conteudo real esta atras dos ponteiros.
console.log('\n--- conteudo atras do primeiro ponteiro de um vetor pequeno ---')
for (let at = 28; at + 20 <= qb.length; at += 4) {
  if (qb.readUInt32BE(at + 8) !== fileKey) continue
  if (qb.readUInt32BE(at) !== 0x00200c00) continue

  const value = qb.readUInt32BE(at + 12)
  if (value + 12 > qb.length) continue
  const count = qb.readUInt32BE(value + 4)
  const pointer = qb.readUInt32BE(value + 8)
  if (count < 3 || count > 40 || pointer + count * 4 > qb.length) continue

  const first = qb.readInt32BE(pointer)
  if (first < 0 || first + 48 > qb.length) continue

  console.log(`  vetor @${at}, ${count} itens, primeiro item aponta para ${first}`)
  for (let row = 0; row < 3; row++) {
    const words = []
    for (let i = 0; i < 6; i++) words.push(qb.readUInt32BE(first + row * 24 + i * 4).toString(16).padStart(8, '0'))
    console.log(`    +${String(row * 24).padStart(3)}: ${words.join(' ')}`)
  }
  break
}
