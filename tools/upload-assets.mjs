/**
 * Sobe músicas e modelos para um storage público e escreve o manifesto.
 *
 * ## Por que isto existe
 *
 * Na própria máquina, `songs/` é servida pelo plugin de desenvolvimento
 * (`tools/songs-plugin.mjs`) e `public/models/` sai do próprio servidor.
 * Nenhuma das duas coisas sobrevive a um deploy estático: o plugin é
 * middleware do Vite e não roda na Vercel, e as duas pastas somam mais de
 * trezentos megabytes — muito além do que cabe num deploy e do que faz
 * sentido versionar.
 *
 * Então os arquivos vão para um storage, e o jogo aprende a lê-los de lá.
 * O único acréscimo no cliente é um prefixo: `library.ts` aceita um
 * manifesto com `base`, e os modelos passam por um reescritor de URL
 * instalado em `render/assetBase.ts`.
 *
 * ## Como usar
 *
 *     BLOB_READ_WRITE_TOKEN=... node tools/upload-assets.mjs
 *
 * O token sai do painel da Vercel, em Storage → Blob → Tokens. Ao terminar,
 * o script imprime o valor de `VITE_ASSETS_BASE` para pôr nas variáveis de
 * ambiente do projeto na Vercel — é ele que faz o build apontar para lá.
 *
 * ## Trocar de provedor
 *
 * Só `enviar()` conhece a Vercel. Para S3, R2 ou qualquer outro, é essa
 * função que muda; o resto é varredura de pasta e escrita de JSON. O
 * requisito do storage é ser público, servir com CORS liberado e preservar
 * o caminho do arquivo — o manifesto e o reescritor de URL montam os
 * endereços a partir de um prefixo só.
 */

import { put } from '@vercel/blob'
import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'

const CHART_EXTENSIONS = ['.chart', '.mid', '.midi']
const AUDIO_EXTENSIONS = ['.ogg', '.mp3', '.opus', '.wav', '.m4a']

/** Os mesmos arquivos que o plugin de desenvolvimento considera. */
function interessa(nome) {
  const ext = path.extname(nome).toLowerCase()
  return (
    CHART_EXTENSIONS.includes(ext) ||
    AUDIO_EXTENSIONS.includes(ext) ||
    nome.toLowerCase() === 'song.ini'
  )
}

function temChart(arquivos) {
  return arquivos.some((f) => CHART_EXTENSIONS.includes(path.extname(f).toLowerCase()))
}

/** Percorre `songs/` procurando pastas com chart, como o plugin faz. */
async function varrerMusicas(raiz, relativo = '', profundidade = 0, achados = []) {
  if (profundidade > 4) return achados

  let itens
  try {
    itens = await fs.readdir(path.join(raiz, relativo), { withFileTypes: true })
  } catch {
    return achados
  }

  const arquivos = itens.filter((i) => i.isFile()).map((i) => i.name)
  if (temChart(arquivos)) {
    const segmentos = relativo.split(path.sep).filter(Boolean)
    achados.push({
      id: segmentos.at(-1) ?? 'raiz',
      path: segmentos.join('/'),
      files: arquivos.filter(interessa),
    })
  }

  for (const item of itens) {
    if (!item.isDirectory()) continue
    await varrerMusicas(raiz, path.join(relativo, item.name), profundidade + 1, achados)
  }

  return achados
}

/** Lista recursiva de arquivos, para os modelos. */
async function listar(raiz, relativo = '', achados = []) {
  let itens
  try {
    itens = await fs.readdir(path.join(raiz, relativo), { withFileTypes: true })
  } catch {
    return achados
  }
  for (const item of itens) {
    const caminho = path.join(relativo, item.name)
    if (item.isDirectory()) await listar(raiz, caminho, achados)
    else achados.push(caminho.split(path.sep).join('/'))
  }
  return achados
}

/**
 * Envia um arquivo e devolve a URL pública.
 *
 * `addRandomSuffix: false` é o que mantém o endereço previsível: o arquivo
 * fica exatamente em `<base>/<destino>`. Sem isso cada envio geraria um
 * nome próprio e o manifesto teria de guardar URL por arquivo, em vez de um
 * prefixo só — e os modelos, que nem passam por manifesto, não teriam como
 * ser encontrados.
 */
async function enviar(origem, destino) {
  const { url } = await put(destino, createReadStream(origem), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: tipoDe(destino),
  })
  return url
}

const TIPOS = {
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.chart': 'text/plain; charset=utf-8',
  '.ini': 'text/plain; charset=utf-8',
  '.mid': 'application/octet-stream',
  '.midi': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
}

function tipoDe(nome) {
  return TIPOS[path.extname(nome).toLowerCase()] ?? 'application/octet-stream'
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('Falta BLOB_READ_WRITE_TOKEN. Pegue em Storage → Blob → Tokens, na Vercel.')
    process.exit(1)
  }

  const somenteMusicas = process.argv.includes('--songs')
  const somenteModelos = process.argv.includes('--models')
  const tudo = !somenteMusicas && !somenteModelos

  let base = null
  let enviados = 0
  let bytes = 0

  const subir = async (origem, destino) => {
    const { size } = await fs.stat(origem)
    const url = await enviar(origem, destino)
    enviados++
    bytes += size
    // O prefixo é o mesmo para todos: a URL menos o caminho do arquivo.
    if (!base) base = url.slice(0, url.length - destino.length).replace(/\/$/, '')
    return url
  }

  if (tudo || somenteMusicas) {
    const raiz = path.resolve('songs')
    const musicas = await varrerMusicas(raiz)
    console.log(`${musicas.length} música(s) em songs/`)

    for (const musica of musicas) {
      for (const arquivo of musica.files) {
        const origem = path.join(raiz, ...musica.path.split('/'), arquivo)
        await subir(origem, `songs/${musica.path}/${arquivo}`)
      }
      console.log(`  ✓ ${musica.id}`)
    }

    // O manifesto tem a mesma forma do `/library/index.json` do plugin, mais
    // o prefixo. É o que permite um caminho só no cliente para as duas
    // origens — ver `loadLocalLibrary`.
    const manifesto = { base: `${base}/songs`, songs: musicas }
    await fs.mkdir('public/library', { recursive: true })
    await fs.writeFile('public/library/remote.json', JSON.stringify(manifesto, null, 2))
    console.log('→ public/library/remote.json escrito')
  }

  if (tudo || somenteModelos) {
    const raiz = path.resolve('public/models')
    const modelos = await listar(raiz)
    console.log(`${modelos.length} arquivo(s) em public/models/`)
    for (const modelo of modelos) {
      await subir(path.join(raiz, ...modelo.split('/')), `models/${modelo}`)
      console.log(`  ✓ ${modelo}`)
    }
  }

  console.log(`\n${enviados} arquivo(s), ${mb(bytes)} enviados.`)
  console.log('\nPonha isto nas variáveis de ambiente do projeto na Vercel:')
  console.log(`  VITE_ASSETS_BASE=${base}`)
  console.log('\nE comite `public/library/remote.json` — ele é pequeno e vai no build.')
}

await main()
