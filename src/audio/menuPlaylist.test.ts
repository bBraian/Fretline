/**
 * A troca de faixa da trilha do menu.
 *
 * Roda em Node com dublês do `<audio>` e do contexto: o que se confere é
 * quando a playlist passa para a próxima faixa, não o som.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MenuPlaylist } from './menuPlaylist'

/** Um `<audio>` que responde já com metadados e registra cada `src`. */
class AudioFalso {
  static criados: AudioFalso[] = []
  /** O navegador recusando o `play()` por falta de gesto. */
  static recusar = false
  srcs: string[] = []
  readyState = 1
  // Sem byte range, o navegador não sabe a duração de um `.opus` transmitido.
  duration = Infinity
  currentTime = 0
  preload = ''
  crossOrigin = ''
  loop = false
  onended: (() => void) | null = null

  constructor() {
    AudioFalso.criados.push(this)
  }
  set src(url: string) {
    this.srcs.push(url)
  }
  load() {}
  play() {
    return AudioFalso.recusar
      ? Promise.reject(new DOMException('sem gesto', 'NotAllowedError'))
      : Promise.resolve()
  }
  pause() {}
  removeAttribute() {}
}

function contextoFalso() {
  const param = {
    value: 0,
    cancelScheduledValues() {},
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {},
  }
  const ctx = {
    currentTime: 0,
    createGain: () => ({ gain: param, connect() {}, disconnect() {}, context: ctx }),
    createMediaElementSource: () => ({ connect() {} }),
  }
  return ctx as unknown as AudioContext
}

describe('MenuPlaylist', () => {
  beforeEach(() => {
    AudioFalso.criados = []
    AudioFalso.recusar = false
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('Audio', AudioFalso)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('passa para a próxima faixa quando um clipe curto termina, sem esperar os 30 s', async () => {
    const playlist = new MenuPlaylist()
    playlist.setTracks([
      { id: 'a', url: 'a/preview.opus', startAt: 0 },
      { id: 'b', url: 'b/preview.opus', startAt: 0 },
    ])
    playlist.start(contextoFalso(), {} as AudioNode)
    await vi.advanceTimersByTimeAsync(0)

    const el = AudioFalso.criados[0]
    expect(el.srcs).toHaveLength(1)

    // Um preview de 20 s acaba bem antes do prazo de 30 s do trecho.
    await vi.advanceTimersByTimeAsync(20_000)
    el.onended?.()
    await vi.advanceTimersByTimeAsync(0)

    expect(el.srcs).toHaveLength(2)
  })

  it('o fim de uma faixa já substituída não pula a atual', async () => {
    const playlist = new MenuPlaylist()
    playlist.setTracks([
      { id: 'a', url: 'a/preview.opus', startAt: 0 },
      { id: 'b', url: 'b/preview.opus', startAt: 0 },
    ])
    playlist.start(contextoFalso(), {} as AudioNode)
    await vi.advanceTimersByTimeAsync(0)
    const el = AudioFalso.criados[0]
    const fimDaPrimeira = el.onended

    // O prazo do trecho vence antes do fim: a playlist já foi para a segunda.
    await vi.advanceTimersByTimeAsync(30_000)
    expect(el.srcs).toHaveLength(2)

    fimDaPrimeira?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(el.srcs).toHaveLength(2)
  })

  it('recusado por falta de gesto, para e avisa — sem passar pelas faixas nem desistir delas', async () => {
    const playlist = new MenuPlaylist()
    const desistiu = vi.fn()
    const bloqueou = vi.fn()
    playlist.onGiveUp = desistiu
    playlist.onBlocked = bloqueou
    playlist.setTracks([
      { id: 'a', url: 'a/preview.opus', startAt: 0 },
      { id: 'b', url: 'b/preview.opus', startAt: 0 },
      { id: 'c', url: 'c/preview.opus', startAt: 0 },
    ])
    AudioFalso.recusar = true
    playlist.start(contextoFalso(), {} as AudioNode)
    await vi.advanceTimersByTimeAsync(5000)

    expect(AudioFalso.criados[0].srcs).toHaveLength(1)
    expect(bloqueou).toHaveBeenCalledTimes(1)
    expect(desistiu).not.toHaveBeenCalled()
    expect(playlist.isRunning).toBe(false)
  })
})
