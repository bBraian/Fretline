/**
 * O progresso de vários downloads como uma barra só.
 *
 * Três regras, e a que importa é a última. Enquanto algum item não
 * respondeu, não há total — a barra fica indeterminada em vez de chutar.
 * Com todos os tamanhos, conta bytes; se algum servidor não mandou
 * `Content-Length`, conta arquivos. E como o total só é fixado quando
 * todos responderam, a fração nunca anda para trás.
 *
 * Serve o Afinando (as faixas da música) e a abertura (modelos e efeitos).
 */

export interface DownloadItem {
  state: 'waiting' | 'receiving' | 'done'
  loaded: number
  total?: number
}

export interface DownloadProgress {
  phase: 'connecting' | 'downloading' | 'done'
  /** De 0 a 1; `null` enquanto o total não é conhecido. */
  fraction: number | null
  loaded: number
  /** Em bytes; `null` quando não dá para saber (conectando, ou por arquivo). */
  total: number | null
}

export function downloadProgress(items: readonly DownloadItem[]): DownloadProgress {
  const loaded = items.reduce((soma, item) => soma + item.loaded, 0)

  if (items.every((item) => item.state === 'done')) {
    return { phase: 'done', fraction: 1, loaded, total: loaded }
  }
  if (items.some((item) => item.state === 'waiting')) {
    return { phase: 'connecting', fraction: null, loaded, total: null }
  }
  if (items.every((item) => item.total !== undefined || item.state === 'done')) {
    const total = items.reduce((soma, item) => soma + (item.total ?? item.loaded), 0)
    return { phase: 'downloading', fraction: total > 0 ? Math.min(1, loaded / total) : 0, loaded, total }
  }
  const prontos = items.filter((item) => item.state === 'done').length
  return { phase: 'downloading', fraction: prontos / items.length, loaded, total: null }
}

/** Bytes em megabytes para ler: `12,4`. */
export function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1).replace('.', ',')
}
