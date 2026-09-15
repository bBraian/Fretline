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
 */

import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'

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

export function songsLibrary({ dir = 'songs', base = '/library' } = {}) {
  const root = path.resolve(dir)

  const middleware = async (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith(base + '/')) return next()

    if (url.startsWith(base + '/index.json')) {
      const songs = await scan(root).catch(() => [])
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

      try {
        const stat = await fs.stat(target)
        if (!stat.isFile()) throw new Error('não é arquivo')

        res.setHeader(
          'Content-Type',
          CONTENT_TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
        )
        res.setHeader('Content-Length', String(stat.size))
        createReadStream(target).pipe(res)
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
