/**
 * Sobe o build de produção num servidor efêmero para os scripts de
 * navegador. Cada script cuida do próprio servidor para que rodar um deles
 * seja um comando só, sem um terminal separado ligado ao lado.
 */

import { build, preview } from 'vite'

export async function serve() {
  await build({ logLevel: 'error' })
  const server = await preview({ preview: { port: 0 }, logLevel: 'error' })

  const url = server.resolvedUrls?.local?.[0]
  if (!url) throw new Error('o servidor de preview não informou uma URL')

  return {
    url: url.replace(/\/$/, ''),
    async close() {
      await server.close()
    },
  }
}
