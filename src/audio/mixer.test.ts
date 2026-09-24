/**
 * A mesa antes do primeiro gesto.
 *
 * Criar o áudio antes de um gesto faz a trilha do menu ter o `play()` de
 * cada faixa recusado pelo navegador, até desistir da biblioteca inteira e
 * cair no laço sintetizado. A mesa só pode nascer depois do gesto.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

describe('mixer antes do gesto', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ligar a música de menu não cria o áudio', async () => {
    let criados = 0
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          criados++
          throw new Error('o contexto de áudio nasceu antes de um gesto')
        }
      },
    )
    const { mixer } = await import('./mixer')

    expect(() => mixer.setMenuMusicEnabled(true)).not.toThrow()
    expect(criados).toBe(0)
  })

  it('recusada por falta de gesto, a música volta no primeiro gesto de verdade', async () => {
    vi.resetModules()
    vi.useFakeTimers()
    const tocadas: string[] = []
    let recusar = true

    class AudioFalso {
      preload = ''
      crossOrigin = ''
      loop = false
      readyState = 1
      duration = Infinity
      currentTime = 0
      onended: (() => void) | null = null
      private url = ''
      set src(url: string) {
        this.url = url
      }
      get src() {
        return this.url
      }
      load() {}
      pause() {}
      removeAttribute() {}
      play() {
        tocadas.push(this.url)
        return recusar
          ? Promise.reject(new DOMException('sem gesto', 'NotAllowedError'))
          : Promise.resolve()
      }
    }
    class ContextoFalso {
      state = 'running'
      currentTime = 0
      destination = {}
      createGain() {
        const gain = {
          value: 0,
          setTargetAtTime() {},
          cancelScheduledValues() {},
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
          linearRampToValueAtTime() {},
        }
        return { gain, connect() {}, disconnect() {}, context: this }
      }
      createMediaElementSource() {
        return { connect() {} }
      }
      resume() {
        return Promise.resolve()
      }
    }
    const janela = Object.assign(new EventTarget(), {
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id),
    })
    vi.stubGlobal('window', janela)
    vi.stubGlobal('location', { search: '' })
    vi.stubGlobal('Audio', AudioFalso)
    vi.stubGlobal('AudioContext', ContextoFalso)
    vi.stubGlobal('fetch', async () => new Response(null, { status: 404 }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const { mixer } = await import('./mixer')
      mixer.setMenuTracks([
        { id: 'a', url: 'a/preview.opus', startAt: 0 },
        { id: 'b', url: 'b/preview.opus', startAt: 0 },
      ])
      mixer.startMenuMusic()
      await vi.advanceTimersByTimeAsync(20)
      expect(tocadas).toHaveLength(1)

      // O primeiro gesto de verdade: tecla ou clique.
      recusar = false
      janela.dispatchEvent(new Event('keydown'))
      await vi.advanceTimersByTimeAsync(20)
      expect(tocadas).toHaveLength(2)
    } finally {
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  })
})
