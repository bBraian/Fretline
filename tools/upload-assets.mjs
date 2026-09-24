/**
 * Publica músicas e modelos no host de assets da versão hospedada.
 *
 * ## Por que isto existe
 *
 * Na própria máquina, `songs/` é servida pelo plugin de desenvolvimento
 * (`tools/songs-plugin.mjs`) e `public/models/` sai do próprio servidor.
 * Nenhuma das duas coisas sobrevive a um deploy estático: o plugin é
 * middleware do Vite e não roda na Vercel, e as duas pastas somam mais de
 * trezentos megabytes que não fazem sentido no repositório.
 *
 * Então elas vão para um Worker só de assets na Cloudflare
 * (`fretline-assets`), com o índice da biblioteca ao lado. O jogo aprende a
 * ler de lá por `VITE_ASSETS_BASE` — ver `src/songs/libraryIndex.ts` e
 * `src/render/assetBase.ts`.
 *
 * ## Como usar
 *
 *     npm run upload-assets              monta, gera os previews e publica
 *     npm run upload-assets -- --dry-run só monta `.assets-dist/`
 *
 * Precisa de `ffmpeg` e `ffprobe` no PATH e de `npx wrangler login` feito
 * uma vez. O wrangler só envia o que mudou, e cada publicação substitui a
 * anterior inteira: o que saiu de `songs/` sai do host também.
 *
 * ## O que vai para o host
 *
 *     _headers                 CORS aberto
 *     library.json             o índice — ver `buildManifest`
 *     songs/<pasta>/…          chart, song.ini, áudio e o preview.opus gerado
 *     models/…                 public/models/ inteiro
 *
 * Os arquivos entram por hard link, não por cópia: são centenas de
 * megabytes que não precisam existir duas vezes em disco. A exceção é o
 * preview — ver `gerarPreview`.
 */

import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  HEADERS,
  PREVIEW_FILE,
  buildManifest,
  publishBlocker,
  listar,
  publishedFiles,
  varrerMusicas,
} from './upload-assets-lib.mjs'
import { missingPreviewTool, mixPreview } from './preview-mix.mjs'

const DIST = path.resolve('.assets-dist')
const CONFIG = 'tools/assets-worker/wrangler.jsonc'

/** Para com a instrução exata, em vez de falhar no meio da montagem. */
async function conferirFerramentas() {
  const falta = await missingPreviewTool()
  if (falta) {
    console.error(falta)
    process.exit(1)
  }
}

/**
 * Hard link, e cópia quando o link não é possível — `.assets-dist/` noutro
 * volume, ou um sistema de arquivos que não os aceita.
 */
async function linkarOuCopiar(origem, destino) {
  await fs.mkdir(path.dirname(destino), { recursive: true })
  try {
    await fs.link(origem, destino)
  } catch (erro) {
    if (erro.code !== 'EXDEV' && erro.code !== 'EPERM') throw erro
    await fs.copyFile(origem, destino)
  }
}

/**
 * Gera o `preview.opus` de uma música dentro de `.assets-dist/`.
 *
 * Lê de `songs/` e escreve num arquivo que ainda não existe: o destino nunca
 * é um hard link. Se fosse, o ffmpeg escrevendo por cima truncaria o
 * original em `songs/` — é por isso que `publishedFiles` deixa o preview do
 * pack fora dos links.
 */
function gerarPreview(pastaOrigem, pastaDestino, arquivos) {
  return mixPreview(pastaOrigem, arquivos, path.join(pastaDestino, PREVIEW_FILE))
}

async function montar() {
  // Apagar a pasta desfaz só os links; os originais ficam onde estão.
  await fs.rm(DIST, { recursive: true, force: true })
  await fs.mkdir(DIST, { recursive: true })

  const raizMusicas = path.resolve('songs')
  const musicas = await varrerMusicas(raizMusicas)
  console.log(`${musicas.length} música(s) em songs/`)

  const publicadas = []
  for (const musica of musicas) {
    const segmentos = musica.path.split('/').filter(Boolean)
    const origem = path.join(raizMusicas, ...segmentos)
    const destino = path.join(DIST, 'songs', ...segmentos)

    for (const arquivo of publishedFiles(musica.files)) {
      await linkarOuCopiar(path.join(origem, arquivo), path.join(destino, arquivo))
    }

    let hasPreview = false
    try {
      hasPreview = await gerarPreview(origem, destino, musica.files)
    } catch (erro) {
      // Um áudio que o ffmpeg não lê não derruba a publicação: a música vai
      // sem preview, e o menu cai na faixa inteira.
      console.warn(`  ! ${musica.id}: preview não gerado — ${String(erro.message).split('\n')[0]}`)
    }
    publicadas.push({ ...musica, hasPreview })
    console.log(`  ✓ ${musica.id}${hasPreview ? '' : ' (sem preview)'}`)
  }

  const raizModelos = path.resolve('public/models')
  const modelos = await listar(raizModelos)
  for (const modelo of modelos) {
    const segmentos = modelo.split('/')
    await linkarOuCopiar(path.join(raizModelos, ...segmentos), path.join(DIST, 'models', ...segmentos))
  }
  console.log(`${modelos.length} arquivo(s) de public/models/`)

  const indice = buildManifest(publicadas)
  await fs.writeFile(path.join(DIST, 'library.json'), JSON.stringify(indice, null, 2) + '\n')
  await fs.writeFile(path.join(DIST, '_headers'), HEADERS)
  return { songs: musicas.length, models: modelos.length }
}

/**
 * Publica `.assets-dist/` e devolve a URL que o wrangler imprimiu.
 *
 * A saída vai para o terminal enquanto chega — o primeiro envio leva
 * minutos — e fica guardada para achar a URL no fim.
 */
function publicar() {
  return new Promise((resolve, reject) => {
    const filho = spawn('npx', ['wrangler', 'deploy', '--config', CONFIG], {
      stdio: ['inherit', 'pipe', 'inherit'],
    })
    let saida = ''
    filho.stdout.on('data', (pedaco) => {
      process.stdout.write(pedaco)
      saida += pedaco
    })
    filho.on('error', reject)
    filho.on('close', (codigo) => {
      if (codigo !== 0) reject(new Error(`o wrangler deploy saiu com código ${codigo}`))
      else resolve(saida.match(/https:\/\/\S+\.workers\.dev/)?.[0] ?? null)
    })
  })
}

async function main() {
  const ensaio = process.argv.includes('--dry-run')

  await conferirFerramentas()
  const bloqueio = publishBlocker(await montar())

  if (bloqueio && !ensaio) {
    console.error(`\n${bloqueio}`)
    process.exit(1)
  }
  if (ensaio) {
    console.log('\n--dry-run: .assets-dist/ montado, nada publicado.')
    return
  }

  const url = await publicar()
  console.log('\nPublicado. A variável do projeto na Vercel é:')
  console.log(`  VITE_ASSETS_BASE=${url ?? 'https://fretline-assets.<subdominio>.workers.dev'}`)
  console.log('Ela só muda se a URL mudar; música nova não pede deploy na Vercel.')
}

await main()
