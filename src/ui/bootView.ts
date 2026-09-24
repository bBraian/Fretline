/**
 * O que a abertura diz em cada momento. Puro, para ser conferido em Node.
 *
 * A barra soma modelos e efeitos em bytes (ver `downloadProgress`); a
 * biblioteca tem linha própria, contada por pasta, porque são dezenas de
 * arquivos pequenos cujo tamanho não se sabe de antemão. As duas coisas
 * precisam terminar para o "Pressione qualquer tecla".
 */

import { downloadProgress, mb, type DownloadItem } from './downloadProgress'

export interface BootState {
  /** Modelos e efeitos. Vazio só antes de a abertura começar. */
  itens: DownloadItem[]
  biblioteca: { done: number; total: number | null; pronta: boolean }
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

export function bootView({ itens, biblioteca, falhas }: BootState): BootView {
  const baixado = downloadProgress(itens)
  const arquivosProntos = itens.length > 0 && baixado.phase === 'done'
  const ready = arquivosProntos && biblioteca.pronta

  let bar: number | null
  let line: string
  if (baixado.phase === 'connecting' || itens.length === 0) {
    bar = null
    line = 'Conectando…'
  } else if (baixado.phase === 'downloading') {
    bar = baixado.fraction
    line =
      baixado.total !== null
        ? `${mb(baixado.loaded)} / ${mb(baixado.total)} MB`
        : `${Math.round((baixado.fraction ?? 0) * itens.length)}/${itens.length} arquivos`
  } else {
    bar = 1
    line = 'Lendo a biblioteca…'
  }

  let library: string
  if (biblioteca.pronta && !biblioteca.total) library = 'Sem biblioteca — entra a faixa de demonstração'
  else if (biblioteca.pronta) library = `${biblioteca.total} música${biblioteca.total === 1 ? '' : 's'}`
  else if (biblioteca.total === null) library = 'Biblioteca…'
  else library = `Biblioteca ${biblioteca.done}/${biblioteca.total}`

  const failures =
    falhas === 0
      ? null
      : falhas === 1
        ? '1 arquivo não veio — carrega quando precisar'
        : `${falhas} arquivos não vieram — carregam quando precisar`

  return { bar, line, library, ready, failures }
}
