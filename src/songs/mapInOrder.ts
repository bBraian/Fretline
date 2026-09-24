/**
 * `map` assíncrono com no máximo `limit` tarefas no ar, e o resultado na
 * ordem da entrada — não na ordem em que as tarefas terminam.
 *
 * Existe para a biblioteca: com o índice num host remoto, ler as pastas uma
 * atrás da outra eram dezenas de pedidos em série. Todas de uma vez
 * disputariam banda com os modelos.
 *
 * `fn` não deve rejeitar: quem chama decide o que fazer com a falha de um
 * item (a biblioteca pula a pasta). Uma rejeição rejeita tudo.
 */
export async function mapInOrder<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let done = 0

  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
      onProgress?.(++done, items.length)
    }
  }

  const workers = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workers }, worker))
  return results
}
