/**
 * O que a abertura diz em cada momento. Puro, para ser conferido em Node.
 *
 * A barra soma modelos e efeitos em bytes (ver `downloadProgress`); a
 * biblioteca tem linha própria, contada por pasta, porque são dezenas de
 * arquivos pequenos cujo tamanho não se sabe de antemão. As duas coisas
 * precisam terminar para o "Pressione qualquer tecla".
 *
 * As frases vêm do dicionário que a tela passa: aqui mora só qual delas
 * vale em cada momento.
 */

import { downloadProgress, mb, type DownloadItem } from './downloadProgress'
import type { Messages } from '../i18n'

export interface BootState {
  /** Modelos e efeitos. Vazio só antes de a abertura começar. */
  itens: DownloadItem[]
  biblioteca: {
    done: number
    total: number | null
    pronta: boolean
    /** Músicas que de fato entraram; só se sabe no fim. */
    carregadas: number | null
  }
  /** Arquivos que desistiram depois das novas tentativas. */
  falhas: number
}

export interface BootView {
  bar: number | null
  line: string
  library: string
  ready: boolean
  failures: string | null
}

export function bootView({ itens, biblioteca, falhas }: BootState, t: Messages): BootView {
  const baixado = downloadProgress(itens)
  const arquivosProntos = itens.length > 0 && baixado.phase === 'done'
  const ready = arquivosProntos && biblioteca.pronta

  let bar: number | null
  let line: string
  if (baixado.phase === 'connecting' || itens.length === 0) {
    bar = null
    line = t.boot.connecting
  } else if (baixado.phase === 'downloading') {
    bar = baixado.fraction
    line =
      baixado.total !== null
        ? `${mb(baixado.loaded, t.locale)} / ${mb(baixado.total, t.locale)} MB`
        : t.boot.files(Math.round((baixado.fraction ?? 0) * itens.length), itens.length)
  } else {
    bar = 1
    line = t.boot.readingLibrary
  }

  // Pronta, conta o que entrou, não o tamanho do índice: uma pasta que não
  // abriu não está na biblioteca, e dizer "25" seria prometer uma a mais.
  const carregadas = biblioteca.carregadas ?? 0
  let library: string
  if (biblioteca.pronta && carregadas === 0) library = t.boot.noLibrary
  else if (biblioteca.pronta && biblioteca.total && carregadas < biblioteca.total)
    library = t.boot.someSongs(carregadas, biblioteca.total)
  else if (biblioteca.pronta) library = `${carregadas} ${t.songsWord(carregadas)}`
  else if (biblioteca.total === null) library = t.boot.libraryPending
  else library = t.boot.libraryProgress(biblioteca.done, biblioteca.total)

  const failures = falhas === 0 ? null : t.boot.failures(falhas)

  return { bar, line, library, ready, failures }
}

/** Teclas que não contam como "qualquer tecla": foco, janela e modificadores. */
const IGNORADAS = new Set(['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'F11', 'F12'])

/**
 * A tecla sai da abertura? Atalho com Ctrl, Alt ou Cmd não: é zoom,
 * ferramenta de desenvolvedor, troca de aba — nada que queira dizer
 * "começa".
 */
export function contaComoTecla(event: {
  key: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey) return false
  return !IGNORADAS.has(event.key)
}
