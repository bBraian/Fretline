/**
 * Serve uma pasta de músicas local para o jogo.
 *
 * O seletor de pastas do navegador funciona, mas o que ele devolve vale só
 * para aquela aba: recarregar a página perde tudo e obriga a reimportar. Num
 * jogo que roda na própria máquina isso é atrito à toa.
 *
 * Este plugin expõe a pasta `songs/` do projeto em dois endereços:
 *
 *     GET /library/index.json        o que existe na pasta
 *     GET /library/file/<caminho>    um arquivo de dentro dela
 *
 * Assim a biblioteca é carregada sozinha ao abrir o jogo, e os endereços são
 * URLs comuns — que sobrevivem a recarregar a página, ao contrário de um
 * blob criado pelo seletor.
 *
 * Nada sai da máquina: é o próprio servidor de desenvolvimento servindo uma
 * pasta local.
 *
 * ## O preview
 *
 * O índice anuncia um `preview.opus` em cada música, no lugar do clipe que
 * veio no pack — a mesma forma do `library.json` que `upload-assets`
 * publica. Pedido, ele é gerado na hora com o ffmpeg, pelo mesmo código da
 * publicação (`preview-mix.mjs`), e fica guardado em `node_modules/.cache`
 * até alguma faixa mudar.
 *
 * Sem isso, o preview na própria máquina era o `song.opus` sozinho — que
 * num pack com instrumentos separados é a banda **sem a guitarra** — ou o
 * clipe do pack, com a guitarra lá no fundo. Sem ffmpeg, o índice continua
 * como era e o jogo cai nesses mesmos arquivos.
 */

import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { PREVIEW_FILE, pickPreviewSource, publishedFiles } from './upload-assets-lib.mjs'
import { missingPreviewTool, mixPreview } from './preview-mix.mjs'

/** Onde os previews gerados ficam entre uma execução e outra. */
const PREVIEW_CACHE = path.resolve('node_modules/.cache/fretline-previews')

const CHART_EXTENSIONS = ['.chart', '.mid', '.midi']
const AUDIO_EXTENSIONS = ['.ogg', '.mp3', '.opus', '.wav', '.m4a']

const CONTENT_TYPES = {
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.chart': 'text/plain; charset=utf-8',
  '.ini': 'text/plain; charset=utf-8',
  '.mid': 'application/octet-stream',
  '.midi': 'application/octet-stream',
}

function isInteresting(name) {
  const ext = path.extname(name).toLowerCase()
  return (
    CHART_EXTENSIONS.includes(ext) ||
    AUDIO_EXTENSIONS.includes(ext) ||
    name.toLowerCase() === 'song.ini'
  )
}

function hasChart(files) {
  return files.some((file) => CHART_EXTENSIONS.includes(path.extname(file).toLowerCase()))
}

/** Percorre a pasta procurando diretórios que contenham um chart. */
async function scan(root, relative = '', depth = 0, found = []) {
  if (depth > 4) return found

  let items
  try {
    items = await fs.readdir(path.join(root, relative), { withFileTypes: true })
  } catch {
    return found
  }

  const files = items.filter((i) => i.isFile()).map((i) => i.name)
  if (hasChart(files)) {
    const segments = relative.split(path.sep).filter(Boolean)
    found.push({
      id: segments.at(-1) ?? 'raiz',
      path: segments.join('/'),
      files: files.filter(isInteresting),
    })
  }

  for (const item of items) {
    if (!item.isDirectory()) continue
    await scan(root, path.join(relative, item.name), depth + 1, found)
  }

  return found
}

async function send(res, target) {
  const stat = await fs.stat(target)
  if (!stat.isFile()) throw new Error('não é arquivo')

  res.setHeader(
    'Content-Type',
    CONTENT_TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
  )
  res.setHeader('Content-Length', String(stat.size))
  createReadStream(target).pipe(res)
}

export function songsLibrary({ dir = 'songs', base = '/library' } = {}) {
  const root = path.resolve(dir)

  // Perguntado uma vez por servidor: sem ffmpeg, avisa e segue sem gerar.
  let tools = null
  const canMix = () =>
    (tools ??= missingPreviewTool()
      .then((falta) => {
        if (falta) console.warn(`[songs] preview sem a mixagem completa — ${falta}`)
        return !falta
      })
      .catch(() => false))

  /** O índice anuncia o preview gerado no lugar do clipe do pack. */
  const withMixedPreview = (song) =>
    pickPreviewSource(song.files)
      ? { ...song, files: [...publishedFiles(song.files), PREVIEW_FILE] }
      : song

  // Dois pedidos do mesmo preview ao mesmo tempo esperam a mesma geração.
  const mixing = new Map()

  /**
   * O preview gerado da música em `folder`, do cache quando ainda vale.
   *
   * Vale enquanto for mais novo que todos os arquivos da música: trocar uma
   * faixa ou o `preview_start_time` gera de novo. A geração escreve num
   * temporário e renomeia, para um pedido no meio dela nunca receber meio
   * arquivo.
   */
  const mixedPreview = async (folder) => {
    const files = (await fs.readdir(folder)).filter(isInteresting)
    if (!pickPreviewSource(files)) return null

    const target = path.join(PREVIEW_CACHE, path.relative(root, folder), PREVIEW_FILE)
    const sources = await Promise.all(files.map((name) => fs.stat(path.join(folder, name))))
    const newest = Math.max(...sources.map((stat) => stat.mtimeMs))
    const cached = await fs.stat(target).catch(() => null)
    if (cached && cached.mtimeMs >= newest) return target

    if (!mixing.has(target)) {
      const temporary = `${target}.${process.pid}.tmp.opus`
      const job = mixPreview(folder, files, temporary)
        .then(async (ok) => {
          if (!ok) return null
          await fs.rename(temporary, target)
          return target
        })
        .catch(async (error) => {
          await fs.rm(temporary, { force: true })
          throw error
        })
        .finally(() => mixing.delete(target))
      mixing.set(target, job)
    }
    return mixing.get(target)
  }

  const middleware = async (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith(base + '/')) return next()

    if (url.startsWith(base + '/index.json')) {
      const found = await scan(root).catch(() => [])
      const songs = (await canMix()) ? found.map(withMixedPreview) : found
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      // A pasta muda entre recarregamentos; nada de cache.
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ root, songs }))
      return
    }

    if (url.startsWith(base + '/file/')) {
      const requested = decodeURIComponent(url.slice((base + '/file/').length).split('?')[0])
      const target = path.resolve(root, requested)

      // Barreira contra caminhos que escapam da pasta de músicas.
      if (target !== root && !target.startsWith(root + path.sep)) {
        res.statusCode = 403
        res.end('fora da pasta de músicas')
        return
      }

      if (path.basename(target) === PREVIEW_FILE && (await canMix())) {
        try {
          const mixed = await mixedPreview(path.dirname(target))
          if (mixed) return await send(res, mixed)
        } catch (error) {
          // Uma faixa que o ffmpeg não lê não pode calar o preview: cai no
          // clipe do pack, se houver, logo abaixo.
          console.warn(`[songs] preview não gerado em ${requested}:`, error.message)
        }
      }

      try {
        await send(res, target)
      } catch {
        res.statusCode = 404
        res.end('não encontrado')
      }
      return
    }

    next()
  }

  return {
    name: 'fretline-songs-library',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
