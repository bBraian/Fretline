# Hospedagem, parte 2 — Afinando com progresso de verdade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tela "Afinando" mostra nome e artista, uma barra em MB do download da música, a fase (baixando → decodificando → montando o palco), deixa cancelar com Esc ou "Voltar", e no erro oferece "Tentar de novo" dizendo se foi rede ou decodificação.

**Architecture:** `src/audio/download.ts` baixa uma faixa lendo o corpo aos pedaços contra o `Content-Length`, com `AbortSignal`, e classifica a falha (rede ou decodificação). `src/ui/downloadProgress.ts` soma o progresso de vários itens numa fase e numa fração que nunca volta — a mesma função que a abertura (parte 3) vai usar. `SongPlayer.load` ganha `{ signal, onProgress }`; `PlayScreen` desenha o painel e aborta ao sair.

**Tech Stack:** TypeScript, React 19, Web Audio, Fetch/Streams, vitest em Node, Playwright (CDP para estrangular a rede).

**Spec:** `docs/superpowers/specs/2026-09-22-hospedagem-e-loading-design.md`, seção *Afinando — `ui/PlayScreen.tsx` e `audio/songPlayer.ts`*, e *A abertura* só no que diz de `ui/downloadProgress.ts`.

## Global Constraints

- **Sem commit.** O autor valida antes; o trabalho fica no `main` local, sem commit e sem push.
- Node 22 (`export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"` no shell do agente).
- Camadas: `audio/` não importa de `ui/`. O tipo do progresso de faixa é declarado em `audio/download.ts`; `ui/downloadProgress.ts` declara o seu, estruturalmente igual — o TypeScript confere a compatibilidade onde os dois se encontram (`PlayScreen`).
- `.loading-bar` é compartilhada (`PlayScreen`, `CharactersScreen`): nada de redefini-la; variação vai em classe modificadora.
- Rótulos no JSX em caixa normal; os scripts acham por regex case-sensitive. O título "Afinando" continua: seis scripts esperam ele sumir.
- MB com vírgula e uma casa (`12,4`), em mebibytes.
- Mudança visual se confere olhando a captura (`CLAUDE.md`).
- Estilo: comentários em português, na densidade dos vizinhos.

## Review Focus

- Esc apertado durante o download → volta à tela de origem, o download para de verdade (nada continua baixando na aba), e nenhum painel de erro pisca antes de sair (Task 3, captura com rede estrangulada + Esc no `menus.mjs`).
- Servidor sem `Content-Length` numa das faixas → a barra conta por faixa em vez de travar em "conectando" (Task 2, teste de `downloadProgress`).
- Uma faixa de sete que falha (404) → painel de erro de rede com "Tentar de novo", e tentar de novo remonta e carrega (Task 3, rota abortada no `menus.mjs`).
- A faixa de demonstração (sintetizada, sem download) → painel sem barra de MB presa em zero (Task 3, `npm run smoke`, que toca a demo).
- Voltar ao menu e escolher outra música logo depois de cancelar → o `AudioContext` do tocador cancelado é fechado (Task 3, `dispose` no caminho do cancelamento).

---

### Task 1: Baixar uma faixa com progresso, cancelamento e falha classificada

**Files:**
- Create: `src/audio/download.ts`
- Create: `src/audio/download.test.ts`

**Interfaces:**
- Produces:
  - `interface TrackProgress { state: 'waiting' | 'receiving' | 'done'; loaded: number; total?: number }`
  - `class TrackLoadError extends Error { readonly kind: 'network' | 'decode' }`
  - `loadTrack<T>(url: string, decode: (data: ArrayBuffer) => Promise<T>, options?: { signal?: AbortSignal; onProgress?: (p: TrackProgress) => void }): Promise<T>` — cancelado, rejeita com o `AbortError` do sinal, **não** com `TrackLoadError`.

- [ ] **Step 1: Testes que falham**

`src/audio/download.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrackLoadError, loadTrack, type TrackProgress } from './download'

/** Uma resposta com o corpo em pedaços, como a rede entrega. */
function resposta(pedacos: number[], { comTamanho = true, status = 200 } = {}) {
  const total = pedacos.reduce((a, b) => a + b, 0)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const n of pedacos) controller.enqueue(new Uint8Array(n))
      controller.close()
    },
  })
  const headers: Record<string, string> = comTamanho ? { 'Content-Length': String(total) } : {}
  return new Response(body, { status, headers })
}

const tamanho = async (data: ArrayBuffer) => data.byteLength

afterEach(() => vi.unstubAllGlobals())

describe('loadTrack', () => {
  it('relata os bytes recebidos contra o Content-Length', async () => {
    vi.stubGlobal('fetch', async () => resposta([100, 200, 300]))
    const vistos: TrackProgress[] = []
    const bytes = await loadTrack('a.opus', tamanho, { onProgress: (p) => vistos.push(p) })

    expect(bytes).toBe(600)
    expect(vistos[0]).toEqual({ state: 'receiving', loaded: 0, total: 600 })
    expect(vistos.at(-1)).toEqual({ state: 'done', loaded: 600, total: 600 })
    expect(vistos.some((p) => p.loaded > 0 && p.loaded < 600)).toBe(true)
    const carregados = vistos.map((p) => p.loaded)
    expect(carregados).toEqual([...carregados].sort((a, b) => a - b))
  })

  it('sem Content-Length, o total fica desconhecido', async () => {
    vi.stubGlobal('fetch', async () => resposta([100, 200], { comTamanho: false }))
    const vistos: TrackProgress[] = []
    await loadTrack('a.opus', tamanho, { onProgress: (p) => vistos.push(p) })
    expect(vistos[0].total).toBeUndefined()
    expect(vistos.at(-1)).toEqual({ state: 'done', loaded: 300, total: undefined })
  })

  it('um status de erro é falha de rede', async () => {
    vi.stubGlobal('fetch', async () => resposta([10], { status: 404 }))
    const erro = await loadTrack('a.opus', tamanho).catch((e) => e)
    expect(erro).toBeInstanceOf(TrackLoadError)
    expect(erro.kind).toBe('network')
    expect(erro.message).toContain('404')
  })

  it('um fetch que rejeita é falha de rede', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    const erro = await loadTrack('a.opus', tamanho).catch((e) => e)
    expect(erro).toBeInstanceOf(TrackLoadError)
    expect(erro.kind).toBe('network')
  })

  it('um áudio que não decodifica é falha de decodificação', async () => {
    vi.stubGlobal('fetch', async () => resposta([10]))
    const erro = await loadTrack('a.opus', async () => {
      throw new DOMException('Unable to decode audio data', 'EncodingError')
    }).catch((e) => e)
    expect(erro).toBeInstanceOf(TrackLoadError)
    expect(erro.kind).toBe('decode')
  })

  it('cancelar no meio rejeita com AbortError, e não como falha', async () => {
    vi.stubGlobal('fetch', async () => resposta([100, 100, 100]))
    const controller = new AbortController()
    const erro = await loadTrack('a.opus', tamanho, {
      signal: controller.signal,
      onProgress: (p) => {
        if (p.loaded > 0) controller.abort()
      },
    }).catch((e) => e)
    expect(erro).not.toBeInstanceOf(TrackLoadError)
    expect(erro.name).toBe('AbortError')
  })

  it('já cancelado, nem pede', async () => {
    const pedir = vi.fn(async () => resposta([10]))
    vi.stubGlobal('fetch', pedir)
    const controller = new AbortController()
    controller.abort()
    const erro = await loadTrack('a.opus', tamanho, { signal: controller.signal }).catch((e) => e)
    expect(erro.name).toBe('AbortError')
    expect(pedir).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/audio/download.test.ts`
Expected: FAIL — `Cannot find module './download'`.

- [ ] **Step 3: Implementar**

`src/audio/download.ts`:

```ts
/**
 * Baixar uma faixa sabendo quanto falta.
 *
 * `response.arrayBuffer()` só responde no fim: com 31 MB numa conexão
 * lenta, a tela ficava meio minuto sem dizer nada. Lendo o corpo aos
 * pedaços contra o `Content-Length`, cada pedaço vira progresso.
 *
 * A falha vem classificada, porque o que o jogador pode fazer muda: rede
 * se tenta de novo; um arquivo que não decodifica, não adianta. Cancelar
 * não é falha — rejeita com o `AbortError` do próprio sinal, para quem
 * chama sair calado.
 */

export interface TrackProgress {
  state: 'waiting' | 'receiving' | 'done'
  loaded: number
  /** Do `Content-Length`; ausente quando o servidor não informa. */
  total?: number
}

export class TrackLoadError extends Error {
  readonly kind: 'network' | 'decode'

  constructor(kind: 'network' | 'decode', message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'TrackLoadError'
    this.kind = kind
  }
}

interface LoadOptions {
  signal?: AbortSignal
  onProgress?: (progress: TrackProgress) => void
}

export async function loadTrack<T>(
  url: string,
  decode: (data: ArrayBuffer) => Promise<T>,
  { signal, onProgress }: LoadOptions = {},
): Promise<T> {
  const data = await download(url, signal, onProgress)
  try {
    return await decode(data)
  } catch (error) {
    if (signal?.aborted) throw signal.reason
    throw new TrackLoadError('decode', `Não consegui decodificar ${url}`, { cause: error })
  }
}

async function download(
  url: string,
  signal: AbortSignal | undefined,
  onProgress: LoadOptions['onProgress'],
): Promise<ArrayBuffer> {
  try {
    signal?.throwIfAborted()
    const response = await fetch(url, { signal })
    if (!response.ok) throw new TrackLoadError('network', `${url} respondeu ${response.status}`)

    const header = Number(response.headers.get('Content-Length'))
    const total = header > 0 ? header : undefined
    onProgress?.({ state: 'receiving', loaded: 0, total })

    if (!response.body) {
      const data = await response.arrayBuffer()
      onProgress?.({ state: 'done', loaded: data.byteLength, total })
      return data
    }

    const reader = response.body.getReader()
    const pedacos: Uint8Array[] = []
    let loaded = 0
    for (;;) {
      signal?.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      pedacos.push(value)
      loaded += value.byteLength
      onProgress?.({ state: 'receiving', loaded, total })
    }

    const data = new Uint8Array(loaded)
    let offset = 0
    for (const pedaco of pedacos) {
      data.set(pedaco, offset)
      offset += pedaco.byteLength
    }
    onProgress?.({ state: 'done', loaded, total })
    return data.buffer
  } catch (error) {
    if (signal?.aborted) throw signal.reason
    if (error instanceof TrackLoadError) throw error
    throw new TrackLoadError('network', `Não consegui baixar ${url}`, { cause: error })
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/audio/download.test.ts` → PASS, 7 testes.
Run: `npm test` → PASS, todos.

---

### Task 2: Somar o progresso de vários downloads

**Files:**
- Create: `src/ui/downloadProgress.ts`
- Create: `src/ui/downloadProgress.test.ts`

**Interfaces:**
- Produces:
  - `interface DownloadItem { state: 'waiting' | 'receiving' | 'done'; loaded: number; total?: number }` (estruturalmente igual a `TrackProgress`)
  - `interface DownloadProgress { phase: 'connecting' | 'downloading' | 'done'; fraction: number | null; loaded: number; total: number | null }`
  - `downloadProgress(items: readonly DownloadItem[]): DownloadProgress`
  - `mb(bytes: number): string`
- A parte 3 (abertura) consome as duas funções.

- [ ] **Step 1: Testes que falham**

`src/ui/downloadProgress.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { downloadProgress, mb, type DownloadItem } from './downloadProgress'

describe('downloadProgress', () => {
  it('enquanto alguém não respondeu, está conectando e sem fração', () => {
    expect(
      downloadProgress([
        { state: 'receiving', loaded: 10, total: 100 },
        { state: 'waiting', loaded: 0 },
      ]),
    ).toEqual({ phase: 'connecting', fraction: null, loaded: 10, total: null })
  })

  it('com todos os tamanhos conhecidos, conta por bytes', () => {
    expect(
      downloadProgress([
        { state: 'receiving', loaded: 25, total: 100 },
        { state: 'done', loaded: 300, total: 300 },
      ]),
    ).toEqual({ phase: 'downloading', fraction: 325 / 400, loaded: 325, total: 400 })
  })

  it('sem Content-Length em algum, conta por arquivo', () => {
    expect(
      downloadProgress([
        { state: 'receiving', loaded: 25 },
        { state: 'done', loaded: 300, total: 300 },
        { state: 'receiving', loaded: 5, total: 50 },
      ]),
    ).toEqual({ phase: 'downloading', fraction: 1 / 3, loaded: 330, total: null })
  })

  it('um arquivo pronto sem Content-Length conta o que chegou como total', () => {
    const p = downloadProgress([
      { state: 'done', loaded: 80 },
      { state: 'receiving', loaded: 10, total: 20 },
    ])
    expect(p).toEqual({ phase: 'downloading', fraction: 90 / 100, loaded: 90, total: 100 })
  })

  it('tudo chegado é pronto, e lista vazia também', () => {
    expect(downloadProgress([{ state: 'done', loaded: 100, total: 100 }])).toEqual({
      phase: 'done',
      fraction: 1,
      loaded: 100,
      total: 100,
    })
    expect(downloadProgress([])).toEqual({ phase: 'done', fraction: 1, loaded: 0, total: 0 })
  })

  it('a fração nunca diminui ao longo de um download', () => {
    const passos: DownloadItem[][] = [
      [{ state: 'waiting', loaded: 0 }, { state: 'waiting', loaded: 0 }],
      [{ state: 'receiving', loaded: 0, total: 100 }, { state: 'waiting', loaded: 0 }],
      [{ state: 'receiving', loaded: 0, total: 100 }, { state: 'receiving', loaded: 0, total: 300 }],
      [{ state: 'receiving', loaded: 50, total: 100 }, { state: 'receiving', loaded: 0, total: 300 }],
      [{ state: 'receiving', loaded: 50, total: 100 }, { state: 'receiving', loaded: 150, total: 300 }],
      [{ state: 'done', loaded: 100, total: 100 }, { state: 'receiving', loaded: 150, total: 300 }],
      [{ state: 'done', loaded: 100, total: 100 }, { state: 'done', loaded: 300, total: 300 }],
    ]
    const fracoes = passos
      .map((itens) => downloadProgress(itens).fraction)
      .filter((f): f is number => f !== null)
    expect(fracoes).toEqual([...fracoes].sort((a, b) => a - b))
    expect(fracoes.at(-1)).toBe(1)
  })
})

describe('mb', () => {
  it('em megabytes, com vírgula e uma casa', () => {
    expect(mb(13 * 1024 * 1024)).toBe('13,0')
    expect(mb(12.44 * 1024 * 1024)).toBe('12,4')
    expect(mb(0)).toBe('0,0')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/ui/downloadProgress.test.ts`
Expected: FAIL — `Cannot find module './downloadProgress'`.

- [ ] **Step 3: Implementar**

`src/ui/downloadProgress.ts`:

```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/ui/downloadProgress.test.ts` → PASS, 7 testes.
Run: `npm test` → PASS, todos.

---

### Task 3: O tocador relata o download; o Afinando mostra, cancela e tenta de novo

**Files:**
- Modify: `src/audio/songPlayer.ts` (`load`)
- Modify: `src/ui/PlayScreen.tsx` (estado, efeito de montagem, Esc, painéis de carregamento e de erro)
- Modify: `src/ui/theme.css` (bloco "tela de espera antes do palco": modificador `.loading-bar.is-waiting`)
- Modify: `scripts/menus.mjs` (capturas do Afinando e do erro; Esc e "Tentar de novo" conferidos)

**Interfaces:**
- Consumes: `loadTrack`, `TrackLoadError`, `TrackProgress` (Task 1); `downloadProgress`, `mb` (Task 2).
- Produces: `SongPlayer.load(tracks, options?: { signal?: AbortSignal; onProgress?: (items: TrackProgress[]) => void })`.

- [ ] **Step 1: `SongPlayer.load` com progresso e sinal**

Em `src/audio/songPlayer.ts`, importar:

```ts
import { loadTrack, type TrackProgress } from './download'
```

E trocar a assinatura e o `Promise.all` de `load` (o resto do método — `groupStems`, `mixdown`, `routeStems` — não muda):

```ts
  async load(
    tracks: Array<{ url: string; role: StemRole }>,
    {
      signal,
      onProgress,
    }: { signal?: AbortSignal; onProgress?: (items: TrackProgress[]) => void } = {},
  ) {
    this.disconnectStems()

    // Um item por faixa, na ordem delas. Cada faixa decodifica assim que
    // chega, sem esperar as outras — é a ordem de antes, agora com o
    // progresso de cada uma à vista.
    const itens: TrackProgress[] = tracks.map(() => ({ state: 'waiting', loaded: 0 }))
    const relatar = () => onProgress?.(itens.map((item) => ({ ...item })))
    relatar()

    const decoded = await Promise.all(
      tracks.map(async ({ url, role }, index) => {
        const buffer = await loadTrack(url, (data) => this.ctx.decodeAudioData(data), {
          signal,
          onProgress: (progresso) => {
            itens[index] = progresso
            relatar()
          },
        })
        return { role, buffer }
      }),
    )
```

- [ ] **Step 2: O modificador da barra indeterminada**

Em `src/ui/theme.css`, logo depois da regra `.loading-bar i { … }`:

```css
/* Sem total ainda (conectando, ou a demo sintetizando): um trecho que vai e
   volta, em vez de uma barra parada em zero que parece travada. */
.loading-bar.is-waiting i {
  width: 30%;
  animation: loading-wait 1.1s ease-in-out infinite alternate;
}

@keyframes loading-wait {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(233%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-bar.is-waiting i {
    width: 100%;
    opacity: 0.35;
    animation: none;
  }
}
```

- [ ] **Step 3: `PlayScreen` — imports e estado**

Imports novos:

```ts
import { TrackLoadError, type TrackProgress } from '../audio/download'
import { downloadProgress, mb } from './downloadProgress'
```

Junto dos outros `useState`:

```ts
  /** O download das faixas, faixa a faixa; vazio na demo. */
  const [download, setDownload] = useState<TrackProgress[]>([])
  /** Em que parte da espera está: o áudio, ou o palco depois dele. */
  const [loadStep, setLoadStep] = useState<'audio' | 'stage'>('audio')
  /** O erro veio de um carregamento, e tentar de novo faz sentido. */
  const [retryable, setRetryable] = useState(false)
```

- [ ] **Step 4: `PlayScreen` — o efeito de montagem**

No efeito de montagem, logo depois de `finishedRef.current = false`:

```ts
    // Sair da tela no meio do download cancela o download. Com 31 MB numa
    // conexão lenta, deixar correndo seria gastar a banda do jogador numa
    // música que ele já desistiu de tocar.
    const controller = new AbortController()
```

Dentro de `boot`, trocar o bloco `try { … } catch (loadError) { … }` do áudio por:

```ts
      // O progresso chega a cada pedaço; a tela lê a cada 120 ms, como
      // faz com os itens do palco logo abaixo.
      let recebido: TrackProgress[] = []
      const relatorioAudio = window.setInterval(() => setDownload(recebido), 120)

      try {
        if (entry.synthesized) {
          player.useBuffers([await renderDemoTrack(player.context.sampleRate)])
        } else if (entry.tracks.length > 0) {
          await player.load(entry.tracks, {
            signal: controller.signal,
            onProgress: (itens) => {
              recebido = itens
            },
          })
        }
      } catch (loadError) {
        // Cancelado é a tela saindo: nada de painel de erro no caminho.
        if (!cancelled) {
          console.error(loadError)
          setError(
            loadError instanceof TrackLoadError && loadError.kind === 'network'
              ? 'Não consegui baixar a música. Confira a conexão e tente de novo.'
              : 'Não consegui decodificar o áudio dessa música.',
          )
          setRetryable(true)
          setPhase('error')
        }
        await player.dispose()
        return
      } finally {
        window.clearInterval(relatorioAudio)
        if (!cancelled) setDownload(recebido)
      }

      if (cancelled) {
        await player.dispose()
        return
      }
      setLoadStep('stage')
```

(O `if (cancelled) { await player.dispose(); return }` que já existia logo depois do `catch` é o mesmo — não duplicar; o `setLoadStep('stage')` entra depois dele.)

No `return () => { … }` do efeito, como primeira linha:

```ts
      controller.abort()
```

- [ ] **Step 5: `PlayScreen` — Esc cancela durante o carregamento**

No efeito do teclado, trocar o corpo do `onKey`:

```ts
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return
      event.preventDefault()
      // Esperando o palco, Esc é desistir: sai, e a desmontagem aborta o
      // download. Não há o que pausar ainda.
      if (phase === 'loading') quit()
      else if (phase === 'paused') resume()
      else pause()
    }
```

- [ ] **Step 6: `PlayScreen` — o que o painel diz**

Logo antes do `return (` do componente:

```ts
  // A linha de fase e a barra do Afinando. A barra mede o download do
  // áudio, em bytes; depois dele fica cheia, e o que falta do palco aparece
  // na lista, item a item.
  const baixado = downloadProgress(download)
  let barra: number | null
  let fase: string
  if (loadStep === 'stage') {
    barra = 1
    fase =
      assets.total && assets.done >= assets.total
        ? 'Preparando o palco…'
        : `Montando o palco (${assets.done}/${assets.total || '…'})`
  } else if (entry?.synthesized) {
    barra = null
    fase = 'Sintetizando a faixa de demonstração…'
  } else if (baixado.phase === 'connecting') {
    barra = null
    fase = 'Conectando…'
  } else if (baixado.phase === 'downloading') {
    barra = baixado.fraction
    fase =
      baixado.total !== null
        ? `Baixando a música ${mb(baixado.loaded)} / ${mb(baixado.total)} MB`
        : `Baixando a música (${Math.round((baixado.fraction ?? 0) * download.length)}/${download.length} faixas)`
  } else {
    barra = 1
    fase = 'Decodificando o áudio…'
  }
```

- [ ] **Step 7: `PlayScreen` — os painéis**

Trocar o bloco `{phase === 'loading' && ( … )}` inteiro por:

```tsx
      {phase === 'loading' && (
        <div className="overlay">
          <div className="overlay-panel loading-panel">
            <h2>Afinando</h2>
            {entry && (
              <p className="screen-subtitle">
                <b>{entry.song.meta.name}</b>
                {entry.song.meta.artist ? ` — ${entry.song.meta.artist}` : ''}
              </p>
            )}

            <div className={barra === null ? 'loading-bar is-waiting' : 'loading-bar'}>
              <i style={barra === null ? undefined : { width: `${barra * 100}%` }} />
            </div>
            <p className="screen-subtitle">{fase}</p>

            {/* Progresso de verdade: cada linha é um arquivo que o palco
                está esperando, e some da lista só quando chega. */}
            {loadStep === 'stage' && assets.total > 0 && (
              <ul className="loading-list">
                {assets.itens.map((item) => (
                  <li key={item.label} data-done={item.done}>
                    <span>{item.label}</span>
                    <b>{item.done ? '✓' : '…'}</b>
                  </li>
                ))}
              </ul>
            )}

            <button className="btn btn-ghost" onClick={quit}>
              Voltar
            </button>
          </div>
        </div>
      )}
```

E o painel de erro:

```tsx
      {phase === 'error' && (
        <div className="overlay">
          <div className="overlay-panel">
            <h2>Não deu</h2>
            <p className="screen-subtitle">{error}</p>
            {retryable && (
              <button className="btn btn-primary" onClick={restart}>
                Tentar de novo
              </button>
            )}
            <button className={retryable ? 'btn btn-ghost' : 'btn btn-primary'} onClick={quit}>
              Voltar
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 8: Tipos e testes**

Run: `npm run build` → sem erro (confere que `TrackProgress[]` entra em `downloadProgress` sem conversão).
Run: `npm test` → PASS, todos.

- [ ] **Step 9: `menus.mjs` confere o Afinando, o cancelamento e o erro**

Em `scripts/menus.mjs`, depois do laço das telas e antes de `await browser.close()`:

```js
// A espera antes do palco, com a rede estrangulada para ela durar o
// bastante para ser vista — e o que ela promete: Esc desiste.
await page.getByRole('button', { name: /Tocar/ }).first().click()
await page.getByRole('heading', { name: 'Escolha a música' }).waitFor()
const cdp = await page.context().newCDPSession(page)
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 40,
  downloadThroughput: (4 * 1024 * 1024) / 8,
  uploadThroughput: (1024 * 1024) / 8,
})
await page.getByRole('button', { name: /^Tocar em/ }).click()
await page.getByText(/Baixando a música \d/).waitFor({ timeout: 20000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'scripts/menu-afinando.png' })
console.log('  afinando')

await page.keyboard.press('Escape')
await page.getByRole('heading', { name: 'Escolha a música' }).waitFor({ timeout: 5000 })
if (await page.getByText('Não deu').count()) throw new Error('cancelar mostrou o painel de erro')
console.log('  Esc cancela o carregamento')
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
})

// Uma faixa que não chega: o erro de rede, e "Tentar de novo" carregando.
const audio = /\.(opus|ogg|mp3)(\?|$)/
await page.route(audio, (route) => route.abort())
await page.getByRole('button', { name: /^Tocar em/ }).click()
await page.getByRole('button', { name: 'Tentar de novo' }).waitFor({ timeout: 20000 })
await page.screenshot({ path: 'scripts/menu-afinando-erro.png' })
console.log('  afinando-erro')
await page.unroute(audio)
await page.getByRole('button', { name: 'Tentar de novo' }).click()
await page.waitForFunction(
  () => !document.body.innerText.includes('Afinando') && !document.body.innerText.includes('Não deu'),
  null,
  { timeout: 60000 },
)
console.log('  tentar de novo carrega')
```

- [ ] **Step 10: Rodar e olhar**

Run: `npm run menus`
Expected: além das telas de sempre, `afinando`, `Esc cancela o carregamento`, `afinando-erro`, `tentar de novo carrega`; saída 0.

Abrir `scripts/menu-afinando.png`: título "Afinando", nome e artista, barra parcial, linha `Baixando a música X / Y MB`, botão "Voltar". Abrir `scripts/menu-afinando-erro.png`: "Não deu", a mensagem de rede, "Tentar de novo" em destaque e "Voltar".

Run: `npm run smoke` → saída 0 (a demo passa pelo painel com a barra indeterminada e toca).
Run: `npm run hosted` → saída 0 (o mesmo contra o host local, com CORS).

---

### Task 4: Documentação

**Files:**
- Modify: `docs/design/README.md` (seção nova depois de 6d)
- Modify: `docs/superpowers/specs/2026-09-22-hospedagem-e-loading-design.md` (seção *Estado*)

- [ ] **Step 1: `docs/design/README.md`**

Depois da seção `## 6d. O letreiro "You rock!"` (antes de `## 7. Navegação`):

```markdown
## 6e. A espera antes do palco ("Afinando")

`src/ui/PlayScreen.tsx`, fase `loading`. Painel sobre o palco ainda vazio,
na linguagem de cartaz dos menus.

- **Nome e artista** logo abaixo do título: quem escolheu a música confere
  que é a certa enquanto espera.
- **A barra mede o download do áudio em MB**, lendo o corpo das faixas aos
  pedaços. Sem total ainda (conectando, ou a demo sintetizando) ela vira um
  trecho que vai e volta — `.loading-bar.is-waiting`, modificador sobre a
  classe compartilhada, que não se redefine. Movimento reduzido: barra cheia
  e apagada, parada.
- **Uma linha de fase** embaixo: `Conectando…` → `Baixando a música
  12,4 / 31,0 MB` → `Decodificando o áudio…` → `Montando o palco (3/7)`. Sem
  `Content-Length`, conta faixas em vez de MB.
- **A lista do palco** só aparece depois do áudio: um item por arquivo, com
  ✓ quando chega. A barra fica cheia nesse trecho; é a lista que anda.
- **Voltar, ou Esc, desiste**: a tela desmonta e o download é abortado.
- **No erro**, "Tentar de novo" em destaque e "Voltar" ao lado, com a
  mensagem dizendo se foi rede ou decodificação — tentar de novo só adianta
  na primeira.
```

- [ ] **Step 2: Spec**

Na seção *Estado*, acrescentar à lista **Feito** (logo depois do item da parte 1):

```markdown
- **Parte 2 (2026-09-24):** Afinando com nome e artista, barra em MB do
  download (`audio/download.ts`, `ui/downloadProgress.ts`), fase por
  extenso, Esc/Voltar cancelando o download, erro com "Tentar de novo" e
  distinção entre rede e decodificação. A barra mede só o áudio; o palco
  continua na lista de itens (ver *Mudou na implementação* abaixo). Plano:
  `docs/superpowers/plans/2026-09-24-hospedagem-parte-2-afinando.md`.
```

Trocar `**Falta implementar:** o progresso e o cancelamento do Afinando, a abertura (com os previews baixados em segundo plano) e os créditos.` por `**Falta implementar:** a abertura (com os previews baixados em segundo plano) e os créditos.`, e na **Ordem sugerida** riscar o Afinando: `~~publicação com previews~~ (feita) → ~~Afinando~~ (feito) → abertura → créditos.`

Na seção *Afinando*, depois do item que começa em `- O painel mostra nome e artista`, acrescentar:

```markdown
  *Mudou na implementação:* a barra mede só o áudio. Os itens do palco não
  têm tamanho à vista sem mexer nos loaders do `render/`, e com a abertura
  eles vêm do cache em fração de segundo; a lista de itens com ✓ continua
  mostrando o que falta deles.
```
