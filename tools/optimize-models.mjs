/**
 * Prepara modelos baixados para entrar no jogo.
 *
 * Arquivo de banco público costuma vir pesado pelo motivo errado. Nos oito
 * primeiros que este projeto importou, 53% do peso era textura — um deles
 * trazia 31 mapas de 1024x1024 para uma guitarra só, o que em memória de
 * vídeo dá perto de 124 MB. A geometria, que é onde se costuma olhar, não
 * era problema em nenhum: 94 mil vértices no pior caso, e o jogo já desenha
 * uma banda inteira todo quadro.
 *
 * Então o corte é em textura. 512 é de sobra para uma guitarra que aparece
 * na mão de alguém, e o WebP corta o resto.
 *
 * Compressão de geometria fica no `quantize`, e não no Draco: o Draco
 * levaria os arquivos a um quinto disso, mas exige um decodificador
 * WebAssembly no cliente, e o bundle já passa de 900 kB.
 *
 *   node tools/optimize-models.mjs <pasta-de-origem> [destino]
 *
 * O destino padrão é public/models/guitars/.
 */

import { readdirSync, mkdirSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { execFileSync } from 'node:child_process'

const origem = process.argv[2]
const destino = process.argv[3] ?? 'public/models/guitars'

if (!origem) {
  console.error('uso: node tools/optimize-models.mjs <pasta-de-origem> [destino]')
  process.exit(1)
}

mkdirSync(destino, { recursive: true })

const arquivos = readdirSync(origem).filter((f) => ['.glb', '.gltf'].includes(extname(f).toLowerCase()))
if (!arquivos.length) {
  console.error(`nenhum .glb ou .gltf em ${origem}`)
  process.exit(1)
}

for (const arquivo of arquivos) {
  // Nome de arquivo vira o id do modelo, então precisa sobreviver a uma URL.
  const limpo = basename(arquivo, extname(arquivo))
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/-$/, '')

  const saida = join(destino, `${limpo}.glb`)
  try {
    const log = execFileSync(
      'npx',
      ['--yes', '@gltf-transform/cli@latest', 'optimize', join(origem, arquivo), saida,
       '--texture-size', '512', '--texture-compress', 'webp', '--compress', 'quantize'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const resumo = log.split('\n').find((l) => l.startsWith('info:'))
    console.log(resumo ?? `${arquivo} -> ${saida}`)
  } catch (erro) {
    console.error(`falhou em ${arquivo}:`, erro.message.split('\n')[0])
  }
}
