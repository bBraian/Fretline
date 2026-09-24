/**
 * Gera o `preview.opus` de uma música com o ffmpeg.
 *
 * Dois usuários, um jeito de fazer: `upload-assets.mjs` gera o preview de
 * cada música que publica, e o plugin de desenvolvimento
 * (`songs-plugin.mjs`) gera sob demanda o da música em que o seletor parou.
 * Se cada um tivesse o seu, o preview que se ouve na própria máquina e o
 * que se ouve no site divergiriam na primeira mudança.
 *
 * As decisões — quais faixas, de onde a onde, que filtro — moram em
 * `upload-assets-lib.mjs`, que se testa sem ffmpeg. Aqui fica só a execução.
 */

import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { ffmpegPreviewArgs, pickPreviewSource, previewClip, readIni } from './upload-assets-lib.mjs'

const executar = promisify(execFile)

/**
 * O que falta para gerar preview, ou `null` quando está tudo lá.
 *
 * Devolve a instrução em vez de sair do processo: a publicação para com ela,
 * e o servidor de desenvolvimento avisa uma vez e segue sem preview gerado.
 */
export async function missingPreviewTool() {
  for (const ferramenta of ['ffmpeg', 'ffprobe']) {
    try {
      await executar(ferramenta, ['-version'])
    } catch {
      return `Falta o ${ferramenta} no PATH. Instale com: sudo apt install ffmpeg`
    }
  }
  const { stdout } = await executar('ffmpeg', ['-hide_banner', '-encoders'])
  if (!/\blibopus\b/.test(stdout)) {
    return 'Este ffmpeg não tem o encoder libopus. Use o do sistema: sudo apt install ffmpeg'
  }
  return null
}

async function duracao(arquivo) {
  const { stdout } = await executar('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arquivo,
  ])
  return Number.parseFloat(stdout)
}

/**
 * Escreve em `saida` o preview da música que está em `pasta`.
 *
 * `arquivos` são os nomes dentro da pasta. Devolve `false` quando não há de
 * onde tirar preview — música sem áudio, ou áudio sem duração legível.
 *
 * A duração vem sempre do `ffprobe` — a da faixa mais longa —, e não do
 * `song_length` do `.ini`: o fade de saída precisa do tamanho real de
 * qualquer jeito, e o `.ini` às vezes mente.
 *
 * `saida` nunca pode ser um hard link para um arquivo de `songs/`: o ffmpeg
 * escrevendo por cima truncaria o original.
 */
export async function mixPreview(pasta, arquivos, saida) {
  const fonte = pickPreviewSource(arquivos)
  if (!fonte) return false

  let previewStartMs = 0
  const ini = arquivos.find((nome) => nome.toLowerCase() === 'song.ini')
  if (ini) {
    const campos = readIni(await fs.readFile(path.join(pasta, ini), 'utf8'))
    previewStartMs = Number(campos.preview_start_time) || 0
  }

  const entradas = fonte.names.map((nome) => path.join(pasta, nome))
  const duracoes = (await Promise.all(entradas.map(duracao))).filter(Number.isFinite)
  const clip = previewClip({ previewStartMs, sourceSeconds: Math.max(0, ...duracoes) })
  if (!clip) return false

  await fs.mkdir(path.dirname(saida), { recursive: true })
  await executar('ffmpeg', ffmpegPreviewArgs({ inputs: entradas, output: saida, ...clip }))
  return true
}
