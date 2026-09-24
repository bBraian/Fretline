/**
 * O que o painel "Não deu" diz, e se oferece "Tentar de novo".
 *
 * Só vale oferecer quando tentar de novo pode dar certo: rede que caiu ou
 * servidor sobrecarregado. Um arquivo que o servidor não tem (403, 404) e um
 * áudio que não decodifica continuam iguais na segunda vez — ali o botão
 * seria uma promessa falsa.
 */

import { TrackLoadError } from '../audio/download'

export interface LoadErrorView {
  message: string
  retryable: boolean
}

const AUSENTE = new Set([403, 404, 410])

export function loadErrorView(error: unknown): LoadErrorView {
  if (error instanceof TrackLoadError && error.kind === 'network') {
    if (error.status !== undefined && AUSENTE.has(error.status)) {
      return { message: 'O áudio dessa música não está no servidor.', retryable: false }
    }
    return {
      message: 'Não consegui baixar a música. Confira a conexão e tente de novo.',
      retryable: true,
    }
  }
  return { message: 'Não consegui decodificar o áudio dessa música.', retryable: false }
}
