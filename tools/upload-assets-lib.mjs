/**
 * As partes da publicação que não chamam ferramenta externa.
 *
 * Ficam fora de `upload-assets.mjs` para serem testadas em Node, sem
 * ffmpeg e sem rede: qual faixa vira preview, de onde a onde, e o que entra
 * no índice. O resto do script é hard link, ffmpeg e wrangler.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

const CHART_EXTENSIONS = ['.chart', '.mid', '.midi']
const AUDIO_EXTENSIONS = ['.ogg', '.mp3', '.opus', '.wav', '.m4a']

/** Duração do clipe de preview, em segundos. */
export const PREVIEW_SECONDS = 30

/** O nome do preview gerado — o mesmo para toda música. */
export const PREVIEW_FILE = 'preview.opus'

/**
 * O `_headers` do host. Só CORS: o cache fica no padrão da Cloudflare
 * (revalida com `ETag`), para uma música substituída nunca chegar velha.
 */
export const HEADERS = '/*\n  Access-Control-Allow-Origin: *\n'

/** Os mesmos arquivos que o plugin de desenvolvimento considera. */
export function interessa(nome) {
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
export async function varrerMusicas(raiz, relativo = '', profundidade = 0, achados = []) {
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
export async function listar(raiz, relativo = '', achados = []) {
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

function semExtensao(nome) {
  return nome.replace(/\.[^.]+$/, '').toLowerCase()
}

function ehAudio(nome) {
  return AUDIO_EXTENSIONS.includes(path.extname(nome).toLowerCase())
}

/** `preview.ogg`, `preview.opus`… — o clipe que veio no pack. */
function ehPreview(nome) {
  return ehAudio(nome) && semExtensao(nome) === 'preview'
}

/**
 * Lê um `song.ini` só no que a publicação precisa.
 *
 * O leitor de verdade é `src/songs/songIni.ts`, em TypeScript; este script
 * roda em Node puro e quer um número, então chave e valor bastam. Chaves em
 * minúsculas, como o Clone Hero as trata.
 */
export function readIni(texto) {
  const campos = {}
  for (const linha of texto.replace(/^﻿/, '').split(/\r?\n/)) {
    const par = linha.match(/^\s*([^=;#[\s][^=]*?)\s*=\s*(.*?)\s*$/)
    if (par) campos[par[1].toLowerCase()] = par[2]
  }
  return campos
}

/**
 * De quais arquivos sai o preview.
 *
 * O clipe do pack ganha sempre: é o trecho que o charter escolheu. Sem ele,
 * a soma de todas as faixas que o jogo toca. Não serve só a faixa de fundo:
 * num pack com instrumentos separados, o `song.opus` guarda só o que sobrou
 * — nos da Harmonix, às vezes silêncio. A plateia gravada fica de fora, como
 * fica da mixagem da partida.
 */
export function pickPreviewSource(arquivos) {
  const audios = arquivos.filter(ehAudio).sort()
  const pack = audios.find(ehPreview)
  if (pack) return { names: [pack], fromPack: true }

  const mixagem = audios.filter((nome) => semExtensao(nome) !== 'crowd')
  return mixagem.length > 0 ? { names: mixagem, fromPack: false } : null
}

/**
 * Onde o clipe começa e quanto dura, em segundos.
 *
 * O do pack é reencodado desde o início. Nos outros vale o
 * `preview_start_time`; sem ele, 35% da faixa, que costuma cair depois da
 * introdução. Em qualquer caso o clipe cabe na faixa: um início perto do fim
 * recua, e uma faixa curta vira um clipe curto — nunca um arquivo vazio.
 */
export function previewClip({ fromPack, previewStartMs, sourceSeconds }) {
  if (!(sourceSeconds > 0)) return null
  const pedido = fromPack ? 0 : previewStartMs > 0 ? previewStartMs / 1000 : sourceSeconds * 0.35
  const start = Math.max(0, Math.min(pedido, sourceSeconds - PREVIEW_SECONDS))
  return { start, length: Math.min(PREVIEW_SECONDS, sourceSeconds - start) }
}

/**
 * Os argumentos do ffmpeg para um clipe.
 *
 * `-ss` e `-t` antes de cada `-i` cortam na entrada, sem decodificar o
 * começo das faixas. Várias faixas são somadas sem normalizar: as faixas
 * separadas de um pack foram feitas para somar na mixagem original, e é
 * assim que o jogo as toca. O fade de saída conta do fim do clipe, não dos
 * 30 s: um clipe curto também termina em fade. `bitexact` tira do arquivo o
 * que muda a cada execução (o número de série do Ogg), para que publicar de
 * novo não reenvie previews idênticos.
 */
export function ffmpegPreviewArgs({ inputs, output, start, length }) {
  const entradas = inputs.flatMap((input) => [
    '-ss', start.toFixed(3), '-t', length.toFixed(3), '-i', input,
  ])
  const soma =
    inputs.length > 1
      ? `${inputs.map((_, i) => `[${i}:a:0]`).join('')}amix=inputs=${inputs.length}:normalize=0:duration=longest,`
      : '[0:a:0]'
  const fadeOut = Math.max(0, length - 1)
  const fades = `afade=t=in:d=0.5,afade=t=out:st=${fadeOut.toFixed(3)}:d=1`
  return [
    '-hide_banner', '-v', 'error', '-y',
    ...entradas,
    '-filter_complex', `${soma}${fades}[saida]`,
    '-map', '[saida]', '-map_metadata', '-1',
    '-c:a', 'libopus', '-b:a', '96k',
    '-fflags', '+bitexact', '-flags:a', '+bitexact',
    output,
  ]
}

/**
 * Os arquivos de uma música que vão para o host como estão.
 *
 * O preview do pack fica de fora: o gerado toma o lugar dele, e ele nunca
 * pode entrar por hard link — ver `gerarPreview` em `upload-assets.mjs`.
 */
export function publishedFiles(arquivos) {
  return arquivos.filter((nome) => interessa(nome) && !ehPreview(nome))
}

/**
 * O índice que o jogo lê do host: a forma do `/library/index.json` do
 * plugin, mais um `base` relativo. O cliente resolve o `base` contra a URL
 * do próprio índice, então o índice não sabe em que domínio está.
 *
 * Um preview só por música: o cliente pega o primeiro `preview.*` que acha.
 */
export function buildManifest(musicas) {
  return {
    base: 'songs/',
    songs: musicas
      .map(({ id, path: caminho, files, hasPreview }) => ({
        id,
        path: caminho,
        files: [...publishedFiles(files), ...(hasPreview ? [PREVIEW_FILE] : [])].sort(),
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  }
}
