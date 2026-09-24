/**
 * Tentar de novo o que pode dar certo na segunda vez.
 *
 * Rede que caiu, servidor sobrecarregado (5xx, 408, 429): espera e pede de
 * novo, duas vezes. Um 404 não muda com a espera, um JSON inválido também
 * não, e cancelar é decisão de quem pediu — esses voltam na hora, sem
 * atrasar a abertura em dois segundos e meio por nada.
 */

export const RETRY_DELAYS = [500, 2000]

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function isTransient(error: unknown): boolean {
  if (error instanceof SyntaxError) return false
  if (error && typeof error === 'object') {
    if ((error as { name?: string }).name === 'AbortError') return false
    const status =
      (error as { status?: number }).status ??
      (error as { response?: { status?: number } }).response?.status
    if (typeof status === 'number') return status >= 500 || status === 408 || status === 429
  }
  return true
}

export async function retry<T>(
  attempt: () => Promise<T>,
  { delays = RETRY_DELAYS, wait = esperar }: { delays?: number[]; wait?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await attempt()
    } catch (error) {
      if (tentativa >= delays.length || !isTransient(error)) throw error
      await wait(delays[tentativa])
    }
  }
}
