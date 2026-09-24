/**
 * Os previews das músicas, baixados depois que o menu abre.
 *
 * Ficam fora da abertura de propósito: são 25 arquivos de uns 250 KB que
 * ninguém precisa para ver o menu. Um por vez e com prioridade baixa, para
 * não disputar com o que o jogador pede de verdade; parados durante a
 * partida, que baixa a música inteira; e nada disso com economia de dados
 * ligada. Um preview pedido antes de chegar continua funcionando — o
 * `<audio>` transmite.
 */

import { useEffect, useRef } from 'react'
import { useGame } from './store'

interface PrefetchOptions {
  load: (url: string) => Promise<unknown>
  waitWhilePaused: () => Promise<void>
  signal?: AbortSignal
}

function cancelado(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (!signal) return
    if (signal.aborted) return resolve()
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

export async function prefetchInOrder(
  urls: readonly string[],
  { load, waitWhilePaused, signal }: PrefetchOptions,
): Promise<void> {
  for (const url of urls) {
    if (signal?.aborted) return
    await Promise.race([waitWhilePaused(), cancelado(signal)])
    if (signal?.aborted) return
    try {
      await load(url)
    } catch {
      // Um preview que não veio agora vem quando o jogador parar na música.
    }
  }
}

export function useBackgroundPreviews() {
  const screen = useGame((s) => s.screen)
  const library = useGame((s) => s.library)
  const passouDaAbertura = screen !== 'boot'

  // A partida pausa a fila; sair dela solta quem estiver esperando.
  const tocando = useRef(false)
  const retomar = useRef<(() => void) | null>(null)
  useEffect(() => {
    tocando.current = screen === 'play'
    if (!tocando.current) {
      retomar.current?.()
      retomar.current = null
    }
  }, [screen])

  useEffect(() => {
    if (!passouDaAbertura) return
    const conexao = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (conexao?.saveData) return

    const urls = library.flatMap((entry) => (entry.preview && !entry.synthesized ? [entry.preview] : []))
    if (urls.length === 0) return

    const controller = new AbortController()
    void prefetchInOrder(urls, {
      signal: controller.signal,
      waitWhilePaused: () =>
        tocando.current
          ? new Promise<void>((resolve) => {
              retomar.current = resolve
            })
          : Promise.resolve(),
      load: async (url) => {
        const response = await fetch(url, { priority: 'low', signal: controller.signal })
        await response.arrayBuffer()
      },
    })
    return () => controller.abort()
  }, [passouDaAbertura, library])
}
