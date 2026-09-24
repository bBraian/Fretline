/**
 * Onde está o índice da biblioteca, e de onde saem os arquivos dele.
 *
 * Duas origens, um formato. Na própria máquina, o plugin de
 * desenvolvimento serve `/library/index.json` e os arquivos em
 * `/library/file/`. Na versão hospedada, o índice é o `library.json` que
 * `npm run upload-assets` publica ao lado das músicas.
 */

export interface LibraryIndex {
  /**
   * Onde estão os arquivos, relativo à URL do próprio índice.
   *
   * O plugin não manda: os arquivos saem dele, em `/library/file/`. O índice
   * publicado manda `songs/`. Resolver contra a URL do índice é o que deixa
   * o índice sem saber em que domínio está — mudar de host é mudar só
   * `VITE_ASSETS_BASE`.
   */
  base?: string
  songs: Array<{ id: string; path: string; files: string[] }>
}

/** A URL do índice: a do host de assets, quando há um, ou a do plugin. */
export function libraryIndexUrl(assetsBase: string | undefined): string {
  const base = assetsBase?.trim().replace(/\/+$/, '')
  return base ? `${base}/library.json` : '/library/index.json'
}

/**
 * O prefixo dos arquivos de um índice, sem barra no fim.
 *
 * `page` só entra para resolver um índice de endereço relativo — o do
 * plugin, que mora no mesmo servidor da página.
 */
export function filePrefix(index: LibraryIndex, indexUrl: string, page: string): string {
  if (!index.base) return '/library/file'
  return new URL(index.base, new URL(indexUrl, page)).href.replace(/\/+$/, '')
}
