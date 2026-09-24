/**
 * O sorteio dos efeitos que têm mais de uma versão.
 *
 * É a única parte do banco de samples que roda fora do navegador, e é
 * justamente a que tem regra própria: `Math.random()` puro repete o mesmo
 * som duas e três vezes seguidas com facilidade, e num jogo de ritmo o erro
 * de nota acontece em rajada — a repetição fica óbvia.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_NAMES, SampleBank, ShuffleBag, VoiceGroup } from './sfx'
import type { TrackProgress } from './download'

/** Gerador determinístico, para o teste não depender da sorte. */
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

describe('ShuffleBag', () => {
  it('só devolve itens do conjunto', () => {
    const bag = new ShuffleBag(['a', 'b', 'c'], seeded(1))
    for (let i = 0; i < 50; i++) expect(['a', 'b', 'c']).toContain(bag.next())
  })

  it('passa por todos os itens antes de repetir qualquer um', () => {
    const items = ['a', 'b', 'c', 'd']
    const bag = new ShuffleBag(items, seeded(7))

    // Cinco voltas: cada janela do tamanho do conjunto é uma permutação.
    for (let volta = 0; volta < 5; volta++) {
      const tirados = items.map(() => bag.next())
      expect([...tirados].sort()).toEqual([...items].sort())
    }
  })

  it('não repete o item na emenda entre duas voltas', () => {
    // O ponto fraco do saco: a volta pode terminar em X e a seguinte
    // começar em X, produzindo o par repetido que o saco existe para evitar.
    for (let seed = 1; seed <= 40; seed++) {
      const bag = new ShuffleBag(['a', 'b', 'c'], seeded(seed))
      let anterior = bag.next()
      for (let i = 0; i < 30; i++) {
        const atual = bag.next()
        expect(atual).not.toBe(anterior)
        anterior = atual
      }
    }
  })

  it('com dois itens, alterna — é o melhor possível sem repetir', () => {
    const bag = new ShuffleBag(['a', 'b'], seeded(3))
    const saida = Array.from({ length: 8 }, () => bag.next())
    for (let i = 1; i < saida.length; i++) expect(saida[i]).not.toBe(saida[i - 1])
  })

  it('com um item só, devolve sempre ele e não entra em laço', () => {
    const bag = new ShuffleBag(['a'], seeded(5))
    expect(Array.from({ length: 5 }, () => bag.next())).toEqual(['a', 'a', 'a', 'a', 'a'])
  })

  it('embaralha de verdade: sementes diferentes dão ordens diferentes', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    const ordem = (seed: number) => {
      const bag = new ShuffleBag(items, seeded(seed))
      return items.map(() => bag.next()).join('')
    }
    const ordens = new Set([1, 2, 3, 4, 5, 6].map(ordem))
    expect(ordens.size).toBeGreaterThan(1)
  })
})

/**
 * Um contexto de áudio de mentira: guarda como cada fonte foi começada e
 * parada, e o relógio anda quando o teste manda.
 */
function fakeContext() {
  const events: Array<{ kind: string; value: number; at: number }> = []
  const sources: Array<{ when: number; offset: number; stopped: boolean }> = []
  const ctx = {
    currentTime: 0,
    createBufferSource() {
      const record = { when: NaN, offset: NaN, stopped: false }
      sources.push(record)
      return {
        buffer: null,
        onended: null,
        connect() {},
        disconnect() {},
        start(when: number, offset: number) {
          record.when = when
          record.offset = offset
        },
        stop() {
          record.stopped = true
        },
      }
    },
    createGain() {
      return {
        gain: {
          setValueAtTime: (value: number, at: number) => events.push({ kind: 'set', value, at }),
          linearRampToValueAtTime: (value: number, at: number) =>
            events.push({ kind: 'ramp', value, at }),
        },
        connect() {},
        disconnect() {},
      }
    },
  }
  return { ctx: ctx as unknown as AudioContext, clock: ctx, sources, events }
}

const out = {} as AudioNode
const tenSeconds = { duration: 10 } as AudioBuffer

describe('VoiceGroup', () => {
  it('retoma do ponto em que pausou', () => {
    const { ctx, clock, sources } = fakeContext()
    const group = new VoiceGroup()
    group.play(ctx, out, tenSeconds)
    expect(sources[0]).toMatchObject({ when: 0, offset: 0 })

    clock.currentTime = 2
    group.pause(ctx)
    expect(sources[0].stopped).toBe(true)

    // Cinco segundos parado não contam: volta dois segundos adentro.
    clock.currentTime = 7
    group.resume(ctx)
    expect(sources[1]).toMatchObject({ when: 7, offset: 2 })
  })

  it('o que estava agendado para depois continua agendado, empurrado pela pausa', () => {
    const { ctx, clock, sources } = fakeContext()
    const group = new VoiceGroup()
    group.play(ctx, out, tenSeconds, 3)
    expect(sources[0]).toMatchObject({ when: 3, offset: 0 })

    clock.currentTime = 1
    group.pause(ctx)
    clock.currentTime = 5
    group.resume(ctx)
    // Faltavam dois segundos quando parou; faltam dois ao voltar.
    expect(sources[1]).toMatchObject({ when: 7, offset: 0 })
  })

  it('um efeito pedido durante a pausa espera a volta, em vez de soar por cima', () => {
    const { ctx, clock, sources } = fakeContext()
    const group = new VoiceGroup()
    group.pause(ctx)
    clock.currentTime = 2
    group.play(ctx, out, tenSeconds)
    expect(sources).toHaveLength(0)

    clock.currentTime = 4
    group.resume(ctx)
    expect(sources[0]).toMatchObject({ when: 4, offset: 0 })
  })

  it('o que já tinha acabado não volta', () => {
    const { ctx, clock, sources } = fakeContext()
    const group = new VoiceGroup()
    group.play(ctx, out, tenSeconds)
    clock.currentTime = 11
    group.pause(ctx)
    group.resume(ctx)
    expect(sources).toHaveLength(1)
  })

  it('stop esquece tudo: nada volta num resume seguinte', () => {
    const { ctx, clock, sources } = fakeContext()
    const group = new VoiceGroup()
    group.play(ctx, out, tenSeconds)
    group.pause(ctx)
    group.stop()
    clock.currentTime = 3
    group.resume(ctx)
    expect(sources).toHaveLength(1)
    expect(group.paused).toBe(false)
  })

  it('um fecho interrompido pela pausa continua do volume em que estava', () => {
    const { ctx, clock, events } = fakeContext()
    const group = new VoiceGroup()
    group.play(ctx, out, tenSeconds, 0, { from: 3, length: 1 })

    clock.currentTime = 3.5
    group.pause(ctx)
    events.length = 0
    clock.currentTime = 10
    group.resume(ctx)

    // Metade do fecho já tinha passado: recomeça da metade e termina no
    // meio segundo que faltava.
    expect(events[0]).toMatchObject({ kind: 'set', at: 10 })
    expect(events[0].value).toBeCloseTo(0.5, 3)
    expect(events.at(-1)).toMatchObject({ kind: 'ramp', at: 10.5 })
  })
})

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
    expect(ultimo).toHaveLength(SAMPLE_NAMES.length)
    expect(ultimo.every((item) => item.state === 'done')).toBe(true)
  })

  it('diz quantos efeitos não vieram, e o que falhou é pedido de novo depois', async () => {
    const pedidos: string[] = []
    let primeiro: string | null = null
    vi.stubGlobal('fetch', async (url: string) => {
      pedidos.push(url)
      primeiro ??= url
      return url === primeiro ? new Response(null, { status: 404 }) : new Response(new Uint8Array(10))
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const bank = new SampleBank()
    expect(await bank.prefetch()).toBe(1)
    await bank.prefetch()
    expect(pedidos.filter((url) => url === primeiro)).toHaveLength(2)
  })
})
