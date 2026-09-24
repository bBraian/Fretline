/** Versão do `package.json`, injetada pelo Vite em tempo de build. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /**
   * Endereço do host de assets da versão hospedada, sem barra no fim —
   * `https://fretline-assets.<subdominio>.workers.dev`.
   *
   * Com ela, a biblioteca vem do `library.json` publicado lá e os modelos
   * saem de `<base>/models/`. Vazia rodando na própria máquina, onde a pasta
   * `songs/` é servida pelo plugin e `public/models/` sai do próprio
   * servidor. Não vai no `.env` — ver a seção *Hospedagem* do `CLAUDE.md`.
   */
  readonly VITE_ASSETS_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
