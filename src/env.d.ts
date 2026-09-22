/** Versão do `package.json`, injetada pelo Vite em tempo de build. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /**
   * Prefixo do storage de onde saem músicas e modelos na versão hospedada.
   *
   * Vazio rodando na própria máquina, onde a pasta `songs/` é servida pelo
   * plugin e `public/models/` sai do próprio servidor. Ver
   * `tools/upload-assets.mjs`.
   */
  readonly VITE_ASSETS_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
