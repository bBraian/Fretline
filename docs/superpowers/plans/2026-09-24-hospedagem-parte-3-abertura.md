# Hospedagem, parte 3 — a abertura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Antes do menu, uma tela de abertura baixa o que o jogo mostra (palco ativo, banda, props, animações, todos os personagens e guitarras, efeitos e o índice da biblioteca), com barra em MB e linha da biblioteca, e termina em "Pressione qualquer tecla" — o gesto que cria o áudio. Depois do menu, os previews das músicas descem em segundo plano, um por vez.

**Architecture:** `render/essentials.ts` junta as URLs que os módulos já declaram e baixa cada uma por um `FileLoader` do three (herda a reescrita de `assetBase.ts`). `net/retry.ts` tenta de novo o que é transitório. `audio/sfx.ts` passa a devolver promessa e progresso no `prefetch`. `ui/boot.ts` orquestra os downloads uma vez por página; `ui/bootView.ts` (puro) diz o que a tela mostra em cada estado; `ui/screens/BootScreen.tsx` desenha e espera o gesto. `ui/useBackgroundPreviews.ts` desce os previews depois.

**Tech Stack:** TypeScript, React 19 + zustand, three `FileLoader`, Fetch/Streams, vitest em Node, Playwright + CDP.

**Spec:** `docs/superpowers/specs/2026-09-22-hospedagem-e-loading-design.md` — seções *A abertura*, *O que a abertura baixa*, *Em segundo plano, depois do menu*, *Scripts de navegador*.

## Global Constraints

- **Sem commit.** O autor valida antes; tudo fica no `main` local, sem commit nem push.
- Node 22 (`export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"` no shell do agente).
- Camadas: `render/` e `audio/` não importam de `ui/`. `net/retry.ts` é neutro (sem three, sem React).
- Contrato visual (`docs/design/README.md`): `.wordmark` e `.wordmark-sub` são do menu e **não se redefinem**; o título partido leva `aria-label` (armadilha 3); `.loading-bar` é compartilhada — variação só por modificador (o `is-waiting` da parte 2). Rótulos no JSX em caixa normal; caixa alta por `text-transform`.
- "Baixar não é decodificar": a abertura enche o cache HTTP e descarta os bytes. `THREE.Cache` continua desligado.
- A abertura nunca é beco sem saída: cada arquivo tenta de novo duas vezes (0,5 s e 2 s), só em falha transitória (rede, 5xx, 408, 429); falhando de vez, segue sem ele e avisa.
- O gesto de sair é a tecla/botão **solto**, não apertado: o `keydown` dá ao navegador a ativação que libera o áudio, e sair no `keyup` evita que a mesma tecla (Espaço, botão A do controle) confirme o primeiro item do menu que acabou de montar.
- `StrictMode` monta duas vezes em desenvolvimento: a abertura começa uma vez por página (guarda no módulo).
- Mudança visual se confere olhando a captura.

## Review Focus

- A tecla que sai da abertura não vaza para o menu: Espaço ou A do controle não abrem "Carreira" sozinhos (Task 5; `npm run menus` passa a abertura com Enter e captura o menu; conferir à mão com Espaço).
- Um modelo que responde 404 → não é tentado de novo, a barra chega ao fim, e o "Pressione" vem com "1 arquivo não veio" (Task 1, teste de `isTransient`; Task 5, teste de `bootView`).
- Servidor sem índice da biblioteca → a abertura termina e o menu entra com a faixa de demonstração (Task 5, teste de `bootView` com biblioteca vazia).
- Durante a partida, nenhum preview é baixado em segundo plano; ao sair, retoma do ponto (Task 4, teste de `prefetchInOrder` pausado).
- Rede lenta (4 Mbps) → a barra anda em MB e nunca volta (Task 6, captura estrangulada `menu-abertura-baixando.png`).

---

### Task 1: Tentar de novo só o que é transitório

**Files:**
- Create: `src/net/retry.ts`, `src/net/retry.test.ts`
- Modify: `src/audio/download.ts` (`TrackLoadError` ganha `status`), `src/audio/download.test.ts` (asserção do status)

**Interfaces:**
- Produces:
  - `RETRY_DELAYS = [500, 2000]`
  - `isTransient(error: unknown): boolean`
  - `retry<T>(attempt: () => Promise<T>, options?: { delays?: number[]; wait?: (ms: number) => Promise<void> }): Promise<T>`
  - `TrackLoadError.status?: number`

- [ ] **Step 1: Testes que falham**

`src/net/retry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isTransient, retry } from './retry'

function falhaCom(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

describe('isTransient', () => {
  it('rede caída e 5xx são transitórios', () => {
    expect(isTransient(new TypeError('fetch failed'))).toBe(true)
    expect(isTransient(falhaCom(503))).toBe(true)
    expect(isTransient({ response: { status: 502 } })).toBe(true)
    expect(isTransient(falhaCom(429))).toBe(true)
  })

  it('4xx, cancelamento e JSON inválido não são', () => {
    expect(isTransient(falhaCom(404))).toBe(false)
    expect(isTransient({ response: { status: 403 } })).toBe(false)
    expect(isTransient(new DOMException('cancelado', 'AbortError'))).toBe(false)
    expect(isTransient(new SyntaxError('Unexpected token <'))).toBe(false)
  })
})

describe('retry', () => {
  const esperas: number[] = []
  const wait = async (ms: number) => {
    esperas.push(ms)
  }

  it('tenta de novo com as esperas da regra e devolve o que deu certo', async () => {
    esperas.length = 0
    let vezes = 0
    const valor = await retry(
      async () => {
        vezes++
        if (vezes < 3) throw new TypeError('fetch failed')
        return 'ok'
      },
      { wait },
    )
    expect(valor).toBe('ok')
    expect(vezes).toBe(3)
    expect(esperas).toEqual([500, 2000])
  })

  it('desiste depois de três tentativas, com o último erro', async () => {
    esperas.length = 0
    let vezes = 0
    const erro = await retry(
      async () => {
        vezes++
        throw new TypeError(`falha ${vezes}`)
      },
      { wait },
    ).catch((e) => e)
    expect(vezes).toBe(3)
    expect(erro.message).toBe('falha 3')
  })

  it('não insiste num 404', async () => {
    esperas.length = 0
    let vezes = 0
    const erro = await retry(
      async () => {
        vezes++
        throw falhaCom(404)
      },
      { wait },
    ).catch((e) => e)
    expect(vezes).toBe(1)
    expect(erro.status).toBe(404)
    expect(esperas).toEqual([])
  })
})
```

Em `src/audio/download.test.ts`, no teste `um status de erro é falha de rede`, acrescentar depois de `expect(erro.message).toContain('404')`:

```ts
    expect(erro.status).toBe(404)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/net/retry.test.ts src/audio/download.test.ts`
Expected: FAIL — `./retry` não existe; e `expected undefined to be 404`.

- [ ] **Step 3: Implementar**

`src/net/retry.ts`:

```ts
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
```

Em `src/audio/download.ts`, a classe passa a guardar o status:

```ts
export class TrackLoadError extends Error {
  readonly kind: 'network' | 'decode'
  /** O status HTTP, quando a falha foi uma resposta de erro. */
  readonly status?: number

  constructor(
    kind: 'network' | 'decode',
    message: string,
    options?: ErrorOptions & { status?: number },
  ) {
    super(message, options)
    this.name = 'TrackLoadError'
    this.kind = kind
    this.status = options?.status
  }
}
```

e a linha do `!response.ok`:

```ts
    if (!response.ok) {
      throw new TrackLoadError('network', `${url} respondeu ${response.status}`, {
        status: response.status,
      })
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/net/retry.test.ts src/audio/download.test.ts` → PASS (5 + 7).
Run: `npm test` → PASS, todos.

---

### Task 2: O que a abertura baixa

**Files:**
- Create: `src/render/essentials.ts`, `src/render/essentials.test.ts`

**Interfaces:**
- Consumes: `retry` (Task 1); `activeStageModel`, `STAGE_MODELS` (`render/stage/stageModel.ts`); `BAND` (`render/character/bandMember.ts`); `STAGE_PROPS` (`render/props.ts`); `CLIPS` (`render/character/animationClips.ts`); `CHARACTERS` (`content/characters.ts`); `GUITARS` (`content/guitars.ts`).
- Produces:
  - `essentialModelUrls(): string[]`
  - `downloadModel(url: string, onProgress: (p: { state: 'receiving' | 'done'; loaded: number; total?: number }) => void): Promise<boolean>` — `true` se chegou, `false` se desistiu.

- [ ] **Step 1: Testes que falham**

`src/render/essentials.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { essentialModelUrls } from './essentials'
import { STAGE_MODELS, activeStageModel } from './stage/stageModel'
import { BAND } from './character/bandMember'
import { STAGE_PROPS } from './props'
import { CLIPS } from './character/animationClips'
import { CHARACTERS } from '../content/characters'
import { GUITARS } from '../content/guitars'

describe('essentialModelUrls', () => {
  const urls = essentialModelUrls()

  it('tem o palco ativo, a banda, as props e as animações', () => {
    const esperadas = [
      activeStageModel()!.url,
      ...Object.values(BAND),
      ...Object.values(STAGE_PROPS),
      ...Object.values(CLIPS),
    ]
    for (const url of esperadas) expect(urls).toContain(url)
  })

  it('tem todo personagem e toda guitarra com modelo', () => {
    const comModelo = [...CHARACTERS, ...GUITARS].flatMap((item) => (item.model ? [item.model] : []))
    expect(comModelo.length).toBeGreaterThan(0)
    for (const url of comModelo) expect(urls).toContain(url)
  })

  it('não tem cenário que o jogo não usa', () => {
    const ativo = activeStageModel()!.url
    for (const cenario of STAGE_MODELS) {
      if (cenario.url !== ativo) expect(urls).not.toContain(cenario.url)
    }
  })

  it('não repete URL', () => {
    expect(new Set(urls).size).toBe(urls.length)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/render/essentials.test.ts`
Expected: FAIL — `./essentials` não existe.

- [ ] **Step 3: Implementar**

`src/render/essentials.ts`:

```ts
/**
 * O que a abertura baixa, e como.
 *
 * As URLs saem dos módulos que já as declaram — nenhuma lista paralela
 * para dessincronizar. Ficam de fora os cenários que o jogo não usa: eles
 * só entram com `?stage=`, e são 55 MB.
 *
 * Baixar aqui não é carregar: os bytes vão para o cache HTTP do navegador
 * e são descartados. Quem monta o modelo depois é o `GLTFLoader` de
 * sempre, que acha o arquivo local. O `FileLoader` é o do three, com o
 * gerente padrão, para herdar a reescrita de URL de `assetBase.ts`.
 */

import { DefaultLoadingManager, FileLoader } from 'three'
import { retry } from '../net/retry'
import { activeStageModel } from './stage/stageModel'
import { BAND } from './character/bandMember'
import { STAGE_PROPS } from './props'
import { CLIPS } from './character/animationClips'
import { CHARACTERS } from '../content/characters'
import { GUITARS } from '../content/guitars'

export function essentialModelUrls(): string[] {
  const urls = [
    activeStageModel()?.url,
    ...Object.values(BAND),
    ...Object.values(STAGE_PROPS),
    ...Object.values(CLIPS),
    ...CHARACTERS.map((character) => character.model),
    ...GUITARS.map((guitar) => guitar.model),
  ]
  return [...new Set(urls.filter((url): url is string => Boolean(url)))]
}

const loader = new FileLoader(DefaultLoadingManager)
loader.setResponseType('arraybuffer')

type ModelProgress = { state: 'receiving' | 'done'; loaded: number; total?: number }

function baixarUmaVez(url: string, onProgress: (p: ModelProgress) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (data) => resolve((data as ArrayBuffer).byteLength),
      (event) =>
        onProgress({
          state: 'receiving',
          loaded: event.loaded,
          total: event.lengthComputable ? event.total : undefined,
        }),
      reject,
    )
  })
}

/** Baixa um modelo para o cache. `false` quando desistiu — ele vem sob demanda depois. */
export async function downloadModel(
  url: string,
  onProgress: (p: ModelProgress) => void,
): Promise<boolean> {
  try {
    const bytes = await retry(() => baixarUmaVez(url, onProgress))
    onProgress({ state: 'done', loaded: bytes, total: bytes })
    return true
  } catch (error) {
    console.warn(`A abertura não trouxe ${url}; ele carrega quando precisar.`, error)
    return false
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/render/essentials.test.ts` → PASS, 4 testes.
Run: `npm test` → PASS, todos.

---

### Task 3: Efeitos e biblioteca relatam progresso

**Files:**
- Modify: `src/audio/sfx.ts` (`SampleBank.prefetch`, `fetchBytes`)
- Modify: `src/audio/sfx.test.ts` (novo `describe`)
- Modify: `src/audio/mixer.ts` (`warm`)
- Modify: `src/songs/library.ts` (`fetchLibraryIndex` com `retry`)
- Modify: `src/ui/store.ts` (`refreshLocalLibrary(onProgress?)`)

**Interfaces:**
- Consumes: `loadTrack`, `TrackProgress` (parte 2); `retry` (Task 1).
- Produces:
  - `SampleBank.prefetch(onProgress?: (items: TrackProgress[]) => void): Promise<void>` — resolve quando todo efeito chegou ou desistiu; o último relato tem todos `done`.
  - `mixer.warm(onProgress?): Promise<void>`
  - `refreshLocalLibrary(onProgress?: (done: number, total: number) => void): Promise<number>`

- [ ] **Step 1: Teste que falha**

Em `src/audio/sfx.test.ts`, trocar o import de `./sfx` para incluir `SAMPLE_NAMES` e `SampleBank`, acrescentar `vi`/`afterEach` ao import do vitest, importar `type TrackProgress` de `./download`, e no fim do arquivo:

```ts
describe('SampleBank.prefetch', () => {
  afterEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('termina com todos os efeitos prontos, até o que falta, sem insistir num 404', async () => {
    const pedidos: string[] = []
    let primeiro: string | null = null
    vi.stubGlobal('fetch', async (url: string) => {
      pedidos.push(url)
      primeiro ??= url
      return url === primeiro ? new Response(null, { status: 404 }) : new Response(new Uint8Array(10))
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    let ultimo: TrackProgress[] = []
    await new SampleBank().prefetch((itens) => {
      ultimo = itens
    })

    expect(ultimo).toHaveLength(SAMPLE_NAMES.length)
    expect(ultimo.every((item) => item.state === 'done')).toBe(true)
    expect(pedidos.filter((url) => url === primeiro)).toHaveLength(1)
  })

  it('chamado de novo, não pede de novo e ainda termina', async () => {
    const pedir = vi.fn(async () => new Response(new Uint8Array(10)))
    vi.stubGlobal('fetch', pedir)
    const bank = new SampleBank()
    await bank.prefetch()
    let ultimo: TrackProgress[] = []
    await bank.prefetch((itens) => {
      ultimo = itens
    })
    expect(pedir).toHaveBeenCalledTimes(SAMPLE_NAMES.length)
    expect(ultimo.every((item) => item.state === 'done')).toBe(true)
  })
})
```

Run: `npx vitest run src/audio/sfx.test.ts`
Expected: FAIL — `prefetch` devolve `undefined` e não relata (`ultimo` fica vazio).

- [ ] **Step 2: Implementar `prefetch` e `fetchBytes`**

Em `src/audio/sfx.ts`, importar:

```ts
import { loadTrack, type TrackProgress } from './download'
import { retry } from '../net/retry'
```

Trocar `prefetch` e `fetchBytes` por:

```ts
  /**
   * Começa a baixar tudo. Não precisa de contexto nem de gesto — é só rede,
   * e são menos de dois megabytes no total.
   *
   * Resolve quando todo efeito chegou ou desistiu, e relata um item por
   * efeito — é o que a abertura soma na barra. Chamado de novo, reaproveita
   * os pedidos em andamento e só relata o fim de cada um.
   */
  prefetch(onProgress?: (items: TrackProgress[]) => void): Promise<void> {
    const itens: TrackProgress[] = SAMPLE_NAMES.map(() => ({ state: 'waiting', loaded: 0 }))
    const relatar = () => onProgress?.(itens.map((item) => ({ ...item })))
    relatar()

    return Promise.all(
      SAMPLE_NAMES.map(async (name, index) => {
        const bytes = await this.fetchBytes(name, (progresso) => {
          itens[index] = progresso
          relatar()
        })
        // Chegou ou desistiu: nos dois casos, este não segura mais a barra.
        const atual = itens[index]
        itens[index] = { state: 'done', loaded: bytes?.byteLength ?? atual.loaded, total: atual.total }
        relatar()
      }),
    ).then(() => undefined)
  }

  private fetchBytes(
    name: SampleName,
    onProgress?: (progress: TrackProgress) => void,
  ): Promise<ArrayBuffer | null> {
    const existente = this.bytes.get(name)
    if (existente) return existente

    const url = BASE + FILES[name]
    const pedido = retry(() => loadTrack(url, async (data) => data, { onProgress })).catch((erro) => {
      // Um efeito que falta não pode derrubar o jogo. Ele simplesmente
      // não toca, e o console diz qual foi.
      console.warn(`Efeito sonoro ausente: ${FILES[name]}`, erro)
      return null
    })

    this.bytes.set(name, pedido)
    return pedido
  }
```

Em `src/audio/mixer.ts`, `warm` passa a repassar e devolver:

```ts
  warm(onProgress?: (items: TrackProgress[]) => void): Promise<void> {
    return this.bank.prefetch(onProgress)
  }
```

(com `import type { TrackProgress } from './download'`).

Run: `npx vitest run src/audio/sfx.test.ts` → PASS.

- [ ] **Step 3: Índice da biblioteca com `retry`, e o progresso até o store**

Em `src/songs/library.ts`, importar `import { retry } from '../net/retry'` e trocar o corpo de `fetchLibraryIndex`:

```ts
async function fetchLibraryIndex(): Promise<{ index: LibraryIndex; url: string } | null> {
  const url = libraryIndexUrl(import.meta.env.VITE_ASSETS_BASE)
  try {
    // O índice é o arquivo que decide se há biblioteca: vale a mesma
    // insistência dos modelos da abertura. Um 404 não insiste.
    const index = await retry(async () => {
      const response = await fetch(url)
      if (!response.ok) {
        throw Object.assign(new Error(`${url} respondeu ${response.status}`), {
          status: response.status,
        })
      }
      return (await response.json()) as LibraryIndex
    })
    return { index, url }
  } catch {
    return null
  }
}
```

Em `src/ui/store.ts`, na interface `State`:

```ts
  refreshLocalLibrary: (onProgress?: (done: number, total: number) => void) => Promise<number>
```

e na implementação:

```ts
  /** Relê a pasta `songs/` e devolve quantas músicas novas entraram. */
  refreshLocalLibrary: async (onProgress) => {
    set({ loadingLibrary: true })
    try {
      const entries = await loadLocalLibrary(onProgress)
```

(o resto igual).

- [ ] **Step 4: Conferir**

Run: `npm test` → PASS, todos.
Run: `npm run build` → sem erro.

---

### Task 4: Previews em segundo plano

**Files:**
- Create: `src/ui/useBackgroundPreviews.ts`, `src/ui/useBackgroundPreviews.test.ts`

**Interfaces:**
- Consumes: `useGame` (`screen`, `library`).
- Produces:
  - `prefetchInOrder(urls: readonly string[], options: { load: (url: string) => Promise<unknown>; waitWhilePaused: () => Promise<void>; signal?: AbortSignal }): Promise<void>`
  - `useBackgroundPreviews(): void` — chamado uma vez, no `App`.

- [ ] **Step 1: Testes que falham**

`src/ui/useBackgroundPreviews.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { prefetchInOrder } from './useBackgroundPreviews'

const livre = async () => {}

describe('prefetchInOrder', () => {
  it('pede um de cada vez, na ordem', async () => {
    const eventos: string[] = []
    let noAr = 0
    let pico = 0
    await prefetchInOrder(['a', 'b', 'c'], {
      waitWhilePaused: livre,
      load: async (url) => {
        pico = Math.max(pico, ++noAr)
        eventos.push(url)
        await new Promise((resolve) => setTimeout(resolve, 2))
        noAr--
      },
    })
    expect(eventos).toEqual(['a', 'b', 'c'])
    expect(pico).toBe(1)
  })

  it('segue depois de um que falha', async () => {
    const pedidos: string[] = []
    await prefetchInOrder(['a', 'b'], {
      waitWhilePaused: livre,
      load: async (url) => {
        pedidos.push(url)
        if (url === 'a') throw new Error('rede')
      },
    })
    expect(pedidos).toEqual(['a', 'b'])
  })

  it('não pede nada enquanto está pausado', async () => {
    const pedidos: string[] = []
    let soltar!: () => void
    const pausa = new Promise<void>((resolve) => (soltar = resolve))
    const fim = prefetchInOrder(['a'], {
      waitWhilePaused: () => pausa,
      load: async (url) => {
        pedidos.push(url)
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(pedidos).toEqual([])
    soltar()
    await fim
    expect(pedidos).toEqual(['a'])
  })

  it('cancelado, para — mesmo esperando uma pausa', async () => {
    const pedidos: string[] = []
    const controller = new AbortController()
    const fim = prefetchInOrder(['a', 'b'], {
      signal: controller.signal,
      waitWhilePaused: () => new Promise<void>(() => {}),
      load: async (url) => {
        pedidos.push(url)
      },
    })
    controller.abort()
    await fim
    expect(pedidos).toEqual([])
  })
})
```

Run: `npx vitest run src/ui/useBackgroundPreviews.test.ts`
Expected: FAIL — o módulo não existe.

- [ ] **Step 2: Implementar**

`src/ui/useBackgroundPreviews.ts`:

```ts
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
    if (!signal || signal.aborted) return resolve()
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
```

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run src/ui/useBackgroundPreviews.test.ts` → PASS, 4 testes.
Run: `npm test` → PASS, todos. (O hook entra no `App` na Task 5.)

---

### Task 5: A tela de abertura

**Files:**
- Create: `src/ui/bootView.ts`, `src/ui/bootView.test.ts`
- Create: `src/ui/boot.ts`
- Create: `src/ui/screens/BootScreen.tsx`
- Modify: `src/ui/store.ts` (`Screen` ganha `'boot'`; tela inicial `'boot'`)
- Modify: `src/App.tsx` (rota, fim do `warm`/`refresh`/`acordar` no `App`, sem música na abertura, `useBackgroundPreviews`)
- Modify: `src/ui/theme.css` (bloco novo "abertura")

**Interfaces:**
- Consumes: `downloadProgress`, `mb`, `DownloadItem` (parte 2); `essentialModelUrls`, `downloadModel` (Task 2); `mixer.warm` (Task 3); `refreshLocalLibrary(onProgress)` (Task 3); `useBackgroundPreviews` (Task 4).
- Produces:
  - `interface BootState { itens: DownloadItem[]; biblioteca: { done: number; total: number | null; pronta: boolean }; falhas: number }`
  - `bootView(state: BootState): { bar: number | null; line: string; library: string; ready: boolean; failures: string | null }`
  - `startBoot(refreshLibrary): void`, `getBootState(): BootState`

- [ ] **Step 1: Testes que falham — `bootView`**

`src/ui/bootView.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bootView, type BootState } from './bootView'

const MB = 1024 * 1024
const biblioteca = (done: number, total: number | null, pronta = false) => ({ done, total, pronta })

function estado(parcial: Partial<BootState>): BootState {
  return { itens: [], biblioteca: biblioteca(0, null), falhas: 0, ...parcial }
}

describe('bootView', () => {
  it('conectando: barra indeterminada', () => {
    const v = bootView(estado({ itens: [{ state: 'waiting', loaded: 0 }] }))
    expect(v).toMatchObject({ bar: null, line: 'Conectando…', ready: false })
  })

  it('baixando: barra e contador em MB', () => {
    const v = bootView(
      estado({
        itens: [
          { state: 'receiving', loaded: 10 * MB, total: 20 * MB },
          { state: 'done', loaded: 11.6 * MB, total: 15.2 * MB },
        ],
      }),
    )
    expect(v.bar).toBeCloseTo(21.6 / 35.2, 5)
    expect(v.line).toBe('21,6 / 35,2 MB')
    expect(v.ready).toBe(false)
  })

  it('arquivos prontos, biblioteca não: barra cheia, esperando a biblioteca', () => {
    const v = bootView(
      estado({ itens: [{ state: 'done', loaded: MB, total: MB }], biblioteca: biblioteca(12, 25) }),
    )
    expect(v).toMatchObject({ bar: 1, line: 'Lendo a biblioteca…', library: 'Biblioteca 12/25', ready: false })
  })

  it('tudo pronto: pressione, com o tamanho da biblioteca', () => {
    const v = bootView(
      estado({ itens: [{ state: 'done', loaded: MB, total: MB }], biblioteca: biblioteca(25, 25, true) }),
    )
    expect(v).toMatchObject({ ready: true, library: '25 músicas', failures: null })
  })

  it('biblioteca que não veio: entra a demonstração', () => {
    const v = bootView(
      estado({ itens: [{ state: 'done', loaded: MB, total: MB }], biblioteca: biblioteca(0, null, true) }),
    )
    expect(v.ready).toBe(true)
    expect(v.library).toBe('Sem biblioteca — entra a faixa de demonstração')
  })

  it('biblioteca ainda sem índice', () => {
    expect(bootView(estado({ itens: [{ state: 'waiting', loaded: 0 }] })).library).toBe('Biblioteca…')
  })

  it('avisa o que não veio, no singular e no plural', () => {
    const pronto = { itens: [{ state: 'done' as const, loaded: MB, total: MB }], biblioteca: biblioteca(1, 1, true) }
    expect(bootView(estado({ ...pronto, falhas: 1 })).failures).toBe(
      '1 arquivo não veio — carrega quando precisar',
    )
    expect(bootView(estado({ ...pronto, falhas: 3 })).failures).toBe(
      '3 arquivos não vieram — carregam quando precisar',
    )
  })

  it('antes de qualquer item, não está pronta', () => {
    expect(bootView(estado({ biblioteca: biblioteca(0, null, true) })).ready).toBe(false)
  })
})
```

Run: `npx vitest run src/ui/bootView.test.ts`
Expected: FAIL — o módulo não existe.

- [ ] **Step 2: Implementar `bootView.ts`**

```ts
/**
 * O que a abertura diz em cada momento. Puro, para ser conferido em Node.
 *
 * A barra soma modelos e efeitos em bytes (ver `downloadProgress`); a
 * biblioteca tem linha própria, contada por pasta, porque são dezenas de
 * arquivos pequenos cujo tamanho não se sabe de antemão. As duas coisas
 * precisam terminar para o "Pressione qualquer tecla".
 */

import { downloadProgress, mb, type DownloadItem } from './downloadProgress'

export interface BootState {
  /** Modelos e efeitos. Vazio só antes de a abertura começar. */
  itens: DownloadItem[]
  biblioteca: { done: number; total: number | null; pronta: boolean }
  /** Arquivos que desistiram depois das novas tentativas. */
  falhas: number
}

export interface BootView {
  bar: number | null
  line: string
  library: string
  ready: boolean
  failures: string | null
}

export function bootView({ itens, biblioteca, falhas }: BootState): BootView {
  const baixado = downloadProgress(itens)
  const arquivosProntos = itens.length > 0 && baixado.phase === 'done'
  const ready = arquivosProntos && biblioteca.pronta

  let bar: number | null
  let line: string
  if (baixado.phase === 'connecting' || itens.length === 0) {
    bar = null
    line = 'Conectando…'
  } else if (baixado.phase === 'downloading') {
    bar = baixado.fraction
    line =
      baixado.total !== null
        ? `${mb(baixado.loaded)} / ${mb(baixado.total)} MB`
        : `${Math.round((baixado.fraction ?? 0) * itens.length)}/${itens.length} arquivos`
  } else {
    bar = 1
    line = 'Lendo a biblioteca…'
  }

  let library: string
  if (biblioteca.pronta && !biblioteca.total) library = 'Sem biblioteca — entra a faixa de demonstração'
  else if (biblioteca.pronta) library = `${biblioteca.total} música${biblioteca.total === 1 ? '' : 's'}`
  else if (biblioteca.total === null) library = 'Biblioteca…'
  else library = `Biblioteca ${biblioteca.done}/${biblioteca.total}`

  const failures =
    falhas === 0
      ? null
      : falhas === 1
        ? '1 arquivo não veio — carrega quando precisar'
        : `${falhas} arquivos não vieram — carregam quando precisar`

  return { bar, line, library, ready, failures }
}
```

Run: `npx vitest run src/ui/bootView.test.ts` → PASS, 8 testes.

- [ ] **Step 3: `boot.ts` — os downloads, uma vez por página**

`src/ui/boot.ts`:

```ts
/**
 * Os downloads da abertura, uma vez por página.
 *
 * Fica fora do componente porque o `StrictMode` monta a tela duas vezes em
 * desenvolvimento, e a abertura não pode pedir 35 MB em dobro. A tela lê o
 * estado a cada 120 ms, como o Afinando lê o dele.
 */

import { mixer } from '../audio/mixer'
import { downloadModel, essentialModelUrls } from '../render/essentials'
import type { DownloadItem } from './downloadProgress'
import type { BootState } from './bootView'

let estado: BootState = { itens: [], biblioteca: { done: 0, total: null, pronta: false }, falhas: 0 }
let comecou = false

export function getBootState(): BootState {
  return estado
}

function publicar(patch: Partial<BootState>) {
  estado = { ...estado, ...patch }
}

export function startBoot(
  refreshLibrary: (onProgress: (done: number, total: number) => void) => Promise<unknown>,
) {
  if (comecou) return
  comecou = true

  // Todos os pedidos saem juntos: o host fala HTTP/2, e a barra só vira
  // bytes quando cada resposta tiver dito o próprio tamanho.
  const modelos = essentialModelUrls()
  const itensModelos: DownloadItem[] = modelos.map(() => ({ state: 'waiting', loaded: 0 }))
  let itensEfeitos: DownloadItem[] = []
  const relatarItens = () => publicar({ itens: [...itensModelos, ...itensEfeitos] })
  relatarItens()

  modelos.forEach((url, index) => {
    void downloadModel(url, (progresso) => {
      itensModelos[index] = progresso
      relatarItens()
    }).then((chegou) => {
      itensModelos[index] = { ...itensModelos[index], state: 'done' }
      if (!chegou) publicar({ falhas: estado.falhas + 1 })
      relatarItens()
    })
  })

  void mixer.warm((itens) => {
    itensEfeitos = itens
    relatarItens()
  })

  void refreshLibrary((done, total) => publicar({ biblioteca: { done, total, pronta: false } }))
    .catch(() => 0)
    .finally(() => publicar({ biblioteca: { ...estado.biblioteca, pronta: true } }))
}
```

- [ ] **Step 4: `BootScreen.tsx`**

`src/ui/screens/BootScreen.tsx`:

```tsx
/**
 * A abertura: o que o jogo mostra desce antes do menu, e ela termina em
 * "Pressione qualquer tecla".
 *
 * O gesto é o que cria o áudio: navegador nenhum deixa tocar antes de um,
 * e antes o menu abria mudo até o primeiro clique. Sai-se ao **soltar** a
 * tecla, não ao apertar — o `keydown` já deu ao navegador a ativação que
 * libera o som, e sair nele deixaria o `keyup` do Espaço (ou o botão ainda
 * apertado do controle) confirmar o primeiro item do menu recém-montado.
 */

import { useEffect, useState } from 'react'
import { Backdrop } from '../Backdrop'
import { useGame } from '../store'
import { getBootState, startBoot } from '../boot'
import { bootView } from '../bootView'

/** Teclas que não contam como "qualquer tecla": foco, janela e modificadores. */
const IGNORADAS = new Set(['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'F11', 'F12'])

export function BootScreen() {
  const setScreen = useGame((s) => s.setScreen)
  const refreshLocalLibrary = useGame((s) => s.refreshLocalLibrary)
  const [estado, setEstado] = useState(getBootState)

  useEffect(() => {
    startBoot(refreshLocalLibrary)
    const leitura = window.setInterval(() => setEstado(getBootState()), 120)
    return () => window.clearInterval(leitura)
  }, [refreshLocalLibrary])

  const view = bootView(estado)

  useEffect(() => {
    if (!view.ready) return
    const entrar = () => setScreen('menu')

    let tecla: string | null = null
    const apertou = (event: KeyboardEvent) => {
      if (!IGNORADAS.has(event.key)) tecla = event.code
    }
    const soltou = (event: KeyboardEvent) => {
      if (event.code !== tecla) return
      event.preventDefault()
      entrar()
    }
    const clicou = (event: MouseEvent) => {
      // O botão de tela cheia continua sendo só o botão de tela cheia.
      if ((event.target as Element | null)?.closest('button')) return
      entrar()
    }
    window.addEventListener('keydown', apertou)
    window.addEventListener('keyup', soltou)
    window.addEventListener('click', clicou)

    // Controle: sondagem, porque a API não tem evento de botão. Sai quando
    // um botão apertado é solto.
    let quadro = 0
    let segurando = false
    const sondar = () => {
      quadro = requestAnimationFrame(sondar)
      const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected)
      const algum = Boolean(pad?.buttons.some((botao) => botao.pressed))
      if (segurando && !algum) entrar()
      segurando = algum
    }
    quadro = requestAnimationFrame(sondar)

    return () => {
      window.removeEventListener('keydown', apertou)
      window.removeEventListener('keyup', soltou)
      window.removeEventListener('click', clicou)
      cancelAnimationFrame(quadro)
    }
  }, [view.ready, setScreen])

  return (
    <div className="screen boot-screen">
      <Backdrop />

      <div className="boot">
        <div className="boot-brand">
          {/* Título partido: o nome acessível vem do `aria-label` — armadilha 3
              do contrato de design. */}
          <h1 className="wordmark" aria-label="Fretline">
            <span className="wordmark-line" aria-hidden>
              Fret
            </span>
            <span className="wordmark-line wordmark-line-2" aria-hidden>
              line
            </span>
          </h1>
          <p className="wordmark-sub">Cinco trastes, sem palhetada</p>
        </div>

        <div className="boot-status" aria-live="polite">
          {view.ready ? (
            <>
              <p className="boot-press">Pressione qualquer tecla</p>
              <p className="boot-line boot-line-dim">{view.library}</p>
              {view.failures && <p className="boot-line boot-line-dim">{view.failures}</p>}
            </>
          ) : (
            <>
              <div className={view.bar === null ? 'loading-bar is-waiting' : 'loading-bar'}>
                <i style={view.bar === null ? undefined : { width: `${view.bar * 100}%` }} />
              </div>
              <p className="boot-line">{view.line}</p>
              <p className="boot-line boot-line-dim">{view.library}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: CSS da abertura**

Em `src/ui/theme.css`, logo antes do bloco `/* --- tela de espera antes do palco --- */`:

```css
/* --- abertura ------------------------------------------------------------ */

/* O logo do menu, sozinho no meio do cartaz, e embaixo dele o que falta.
   As medidas verticais em `vh`: numa janela baixa (480×270) o logo e a
   barra precisam caber juntos — armadilha 2. */
.boot {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(14px, 7vh, 64px);
  padding: 16px;
  text-align: center;
}

.boot-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.boot-status {
  width: min(420px, 80vw);
  min-height: clamp(56px, 16vh, 96px);
}

.boot-line {
  margin: 2px 0 0;
  font-size: 13px;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
  color: var(--gh-ochre);
  text-shadow: 0 1px 3px rgba(20, 12, 5, 0.9);
}

.boot-line-dim {
  color: var(--gh-ochre-dim);
}

.boot-press {
  margin: 0 0 10px;
  font-family: var(--gh-display);
  font-size: clamp(18px, 2.6vw, 30px);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--gh-bone);
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.85);
  animation: boot-press 1.4s ease-in-out infinite;
}

@keyframes boot-press {
  50% {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .boot-press {
    animation: none;
  }
}
```

- [ ] **Step 6: Store — a abertura é a primeira tela**

Em `src/ui/store.ts`: `Screen` ganha `| 'boot'` (primeira linha da união), e `screen: 'menu',` vira `screen: 'boot',` no estado inicial.

- [ ] **Step 7: `App.tsx`**

1. Imports: `import { BootScreen } from './ui/screens/BootScreen'` e `import { useBackgroundPreviews } from './ui/useBackgroundPreviews'`.
2. Apagar o efeito do `refreshLocalLibrary()` e o do `mixer.warm()` (e o seletor `refreshLocalLibrary` do topo, que fica sem uso) — os dois passaram para a abertura. No lugar deles:

```ts
  // A biblioteca e os efeitos descem na abertura (`ui/boot.ts`); os
  // previews, depois dela, um por vez.
  useBackgroundPreviews()
```

3. O efeito da música de fundo:

```ts
  useEffect(() => {
    // Na abertura ainda não houve gesto: tocar agora só faria a trilha ter
    // o `play()` recusado faixa por faixa. Quem a liga é a saída dela.
    if (screen === 'boot') return
    if (screen === 'play') mixer.stopMenuMusic()
    else mixer.startMenuMusic()
  }, [screen])
```

4. Apagar o efeito `acordar` (o do "primeiro clique ou tecla acorda a mesa"): o gesto agora é o da abertura, e acordar a mesa no `keydown` tocaria a música ainda sobre ela.
5. No comentário do efeito do som de abrir menu, trocar "a primeira tela não *abriu*, ela já estava lá" por "a abertura não *abriu*, ela já estava lá — e sair dela toca, porque é o primeiro som que o gesto libera".
6. Em `renderScreen`, antes de `case 'career':`:

```ts
    case 'boot':
      return <BootScreen />
```

- [ ] **Step 8: Conferir**

Run: `npm test` → PASS, todos.
Run: `npm run build` → sem erro.
(A conferência no navegador é a Task 6: sem `passarAbertura`, os scripts param na abertura.)

---

### Task 6: Scripts de navegador atravessam a abertura

**Files:**
- Create: `scripts/abertura.mjs`
- Modify: `scripts/smoke.mjs`, `menus.mjs`, `sfx.mjs`, `shots.mjs`, `gallery.mjs`, `library.mjs`, `shop.mjs`, `capture.mjs`, `check-song.mjs`

- [ ] **Step 1: `scripts/abertura.mjs`**

```js
/**
 * A abertura fica entre o carregamento da página e o menu: baixa o que o
 * jogo mostra e espera um gesto. Todo script que abre o jogo passa por ela.
 *
 * Enter, e não um clique: é o gesto mais curto que o jogo aceita, e sai no
 * `keyup` — o menu que monta depois não recebe nada.
 */
export async function passarAbertura(page, timeout = 120_000) {
  await page.getByText(/Pressione/).waitFor({ timeout })
  await page.keyboard.press('Enter')
  await page.getByText(/Pressione/).waitFor({ state: 'detached', timeout: 10_000 })
}
```

- [ ] **Step 2: Chamar depois de cada `goto`**

Em cada script, `import { passarAbertura } from './abertura.mjs'` junto dos outros imports, e logo depois de **cada** linha `await <página>.goto(…)` a linha `await passarAbertura(<página>)` com a mesma página:

- `check-song.mjs:26`, `capture.mjs:40`, `gallery.mjs:39`, `library.mjs:29`, `shop.mjs:16`, `shots.mjs:46`, `smoke.mjs:44` — uma cada (`page`).
- `sfx.mjs` — as onze: linhas 125, 198, 247, 310, 382, 432, 511, 562, 629, 689 (`page`) e 225 (`pobre`).
- `menus.mjs:27` — ver o Step 3, que captura a abertura antes de passar.

No `sfx.mjs`, o comentário `// O primeiro gesto é o que acorda o áudio no navegador.` (linha ~249) vira `// O gesto da abertura já acordou o áudio; o clique fica como garantia.`

- [ ] **Step 3: `menus.mjs` captura a abertura**

Trocar a linha do `goto` inicial por:

```js
await page.goto(BASE, { waitUntil: 'networkidle' })

// A abertura pronta, antes de passar por ela.
await page.getByText(/Pressione/).waitFor({ timeout: 120000 })
await page.screenshot({ path: 'scripts/menu-abertura.png' })
console.log('  abertura')
await passarAbertura(page)
```

E, no fim do arquivo, antes de `await browser.close()`:

```js
// A abertura no meio da barra: sem cache e com a rede estrangulada, para
// os modelos descerem devagar o bastante para serem vistos.
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 40,
  downloadThroughput: (8 * 1024 * 1024) / 8,
  uploadThroughput: (1024 * 1024) / 8,
})
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.getByText(/\d+,\d \/ \d+,\d MB/).waitFor({ timeout: 30000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'scripts/menu-abertura-baixando.png' })
console.log('  abertura-baixando')
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
})
await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
await passarAbertura(page)
```

(O `cdp` é o da captura do Afinando, criado mais acima pela parte 2.)

- [ ] **Step 4: Rodar tudo e olhar**

Run, um por vez, cada um com saída 0 e sem `console:`/`exceção` nos problemas:
`npm run smoke`, `npm run menus`, `npm run library`, `npm run hosted`, `npm run sfx`, `npm run shots`, `npm run gallery`, `node scripts/shop.mjs`, `npm run capture`, e `node scripts/check-song.mjs` com o argumento que ele pede (ver o cabeçalho do arquivo).

Abrir `scripts/menu-abertura.png` (logo, "Pressione qualquer tecla", "N músicas"), `scripts/menu-abertura-baixando.png` (barra parcial, `X / Y MB`, linha da biblioteca) e `scripts/menu-menu.png` (o menu depois da abertura, sem item acionado).

Conferir à mão o Review Focus 1: no `npm run dev`, abrir, esperar o "Pressione", apertar **Espaço** — o menu aparece com o seletor no primeiro item, sem abrir "Carreira".

---

### Task 7: Documentação

**Files:**
- Modify: `docs/design/README.md` (seção 6f), `CLAUDE.md`, `docs/superpowers/specs/2026-09-22-hospedagem-e-loading-design.md`

- [ ] **Step 1: `docs/design/README.md`, depois da 6e**

```markdown
## 6f. A abertura

`src/ui/screens/BootScreen.tsx`, a primeira tela. O fundo `poster` e o
mesmo wordmark do menu — as classes `.wordmark`/`.wordmark-sub` são as dele,
reaproveitadas sem redefinir, e o título partido leva `aria-label`
(armadilha 3).

- **Embaixo do logo, o que falta**: a `.loading-bar` compartilhada (com o
  `is-waiting` enquanto nem todo arquivo disse o próprio tamanho), a linha
  `21,6 / 35,2 MB` e a linha da biblioteca, `Biblioteca 12/25`, mais
  apagada.
- **Pronta, vira "Pressione qualquer tecla"**, piscando devagar (parado com
  movimento reduzido), com o tamanho da biblioteca embaixo — e, se algo não
  veio, `N arquivos não vieram — carregam quando precisar`.
- **Sai ao soltar**, não ao apertar: tecla, clique fora de botão, ou botão
  do controle. O gesto cria o áudio, e o menu entra já com música e com o
  som de abrir.
- As medidas verticais são em `vh`: a 480×270 do teste de fumaça, logo e
  barra cabem juntos.

`npm run menus` captura a abertura pronta (`menu-abertura.png`) e, com a
rede estrangulada e sem cache, no meio da barra (`menu-abertura-baixando.png`).
```

- [ ] **Step 2: `CLAUDE.md`**

Na seção *Capturas de tela como verificação*, acrescentar um parágrafo:

```markdown
**Todo script de navegador passa pela abertura.** Depois do `page.goto`,
`passarAbertura(page)` (`scripts/abertura.mjs`) espera o "Pressione" e
aperta Enter. Script novo que abra o jogo precisa da mesma linha, senão
para na primeira tela.
```

Na seção *Som*, depois do parágrafo dos três contextos (ou onde se fala do gesto), acrescentar:

```markdown
**O gesto que libera o áudio é o da abertura.** O contexto da mesa nasce ao
sair dela, e a música de menu não tenta tocar antes — sem gesto, o `play()`
de cada faixa seria recusado, e a trilha passaria pelas 25 trocando o
`src`.
```

- [ ] **Step 3: Spec**

Na seção *Estado*: acrescentar à lista **Feito**, depois do item da parte 2:

```markdown
- **Parte 3 (2026-09-24):** abertura (`ui/screens/BootScreen.tsx`,
  `ui/boot.ts`, `ui/bootView.ts`) baixando palco ativo, banda, props,
  animações, personagens, guitarras e efeitos com barra em MB, linha da
  biblioteca, novas tentativas (`net/retry.ts`) e "Pressione qualquer
  tecla"; previews em segundo plano (`ui/useBackgroundPreviews.ts`);
  `passarAbertura` nos scripts. Plano:
  `docs/superpowers/plans/2026-09-24-hospedagem-parte-3-abertura.md`.
```

Trocar `**Falta implementar:** a abertura (com os previews baixados em segundo\nplano) e os créditos.` por `**Falta implementar:** os créditos.`, e na **Ordem sugerida** riscar a abertura.

Na seção *A abertura*, no item **Nunca é beco sem saída**, acrescentar ao fim: `*Na implementação:* só falha transitória tenta de novo (rede, 5xx, 408, 429) — um 404 não muda com a espera.` E no item **pronto**: `*Na implementação:* sai-se ao soltar a tecla ou o botão, para o mesmo gesto não acionar o primeiro item do menu.`
