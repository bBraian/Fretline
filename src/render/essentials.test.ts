import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadModel, essentialModelUrls } from './essentials'
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

describe('downloadModel', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('um modelo que para de chegar é abandonado, em vez de segurar a abertura', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'ProgressEvent',
      class {
        constructor(_tipo: string, init: object) {
          Object.assign(this, init)
        }
      },
    )
    vi.stubGlobal(
      'fetch',
      (pedido: Request) =>
        new Promise((_, reject) => pedido.signal.addEventListener('abort', () => reject(pedido.signal.reason))),
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    let resultado: boolean | null = null
    void downloadModel('http://h/parado.glb', () => {}, { stallMs: 1000 }).then((r) => (resultado = r))
    // Três tentativas paradas, com as esperas de 0,5 s e 2 s entre elas.
    await vi.advanceTimersByTimeAsync(1000 + 500 + 1000 + 2000 + 1000)
    expect(resultado).toBe(false)
  })
})
