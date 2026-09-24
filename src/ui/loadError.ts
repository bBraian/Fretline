/**
 * Por que o painel "Não deu" apareceu, e se oferece "Tentar de novo".
 *
 * Só vale oferecer quando tentar de novo pode dar certo: rede que caiu ou
 * servidor sobrecarregado. Um arquivo que o servidor não tem (403, 404) e um
 * áudio que não decodifica continuam iguais na segunda vez — ali o botão
 * seria uma promessa falsa.
 *
 * Devolve o motivo, não a frase: a frase é do dicionário (`play.errors`).
 */

import { TrackLoadError } from '../audio/download'

export type LoadErrorReason = 'missing' | 'network' | 'decode'

export interface LoadErrorView {
  reason: LoadErrorReason
  retryable: boolean
}

const AUSENTE = new Set([403, 404, 410])

export function loadErrorView(error: unknown): LoadErrorView {
  if (error instanceof TrackLoadError && error.kind === 'network') {
    if (error.status !== undefined && AUSENTE.has(error.status)) {
      return { reason: 'missing', retryable: false }
    }
    return { reason: 'network', retryable: true }
  }
  return { reason: 'decode', retryable: false }
}
