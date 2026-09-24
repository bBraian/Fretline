/**
 * Um arquivo pequeno pedido do jeito certo: resposta de erro é erro, falha
 * passageira tenta de novo, e pedido pendurado desiste.
 *
 * O `fetch` puro não faz nenhuma das três. Um 404 no `song.ini` virava uma
 * música sem nome nem dificuldade; um 503 passageiro tirava a música da
 * sessão; e uma conexão parada deixava a abertura esperando para sempre.
 *
 * O corpo é lido aqui dentro, sob o mesmo vigia: para arquivos pequenos
 * (índice, `song.ini`, chart) o prazo sem novidade vale como prazo total.
 */

import { retry, type RetryOptions } from './retry'
import { STALL_MS, watchStall } from './stall'

export async function fetchOk<T>(
  url: string,
  read: (response: Response) => Promise<T>,
  { stallMs = STALL_MS, retry: opcoes }: { stallMs?: number; retry?: RetryOptions } = {},
): Promise<T> {
  return retry(async () => {
    const vigia = watchStall(stallMs)
    try {
      const response = await fetch(url, { signal: vigia.signal })
      if (!response.ok) {
        throw Object.assign(new Error(`${url} respondeu ${response.status}`), {
          status: response.status,
        })
      }
      return await read(response)
    } finally {
      vigia.stop()
    }
  }, opcoes)
}
