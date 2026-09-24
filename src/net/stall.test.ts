import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchStall } from './stall'

describe('watchStall', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sem sinal de vida no prazo, aborta com TimeoutError', () => {
    const vigia = watchStall(1000)
    vi.advanceTimersByTime(999)
    expect(vigia.signal.aborted).toBe(false)
    vi.advanceTimersByTime(1)
    expect(vigia.signal.aborted).toBe(true)
    expect((vigia.signal.reason as DOMException).name).toBe('TimeoutError')
  })

  it('cada sinal de vida adia o prazo', () => {
    const vigia = watchStall(1000)
    vi.advanceTimersByTime(800)
    vigia.touch()
    vi.advanceTimersByTime(800)
    expect(vigia.signal.aborted).toBe(false)
    vi.advanceTimersByTime(200)
    expect(vigia.signal.aborted).toBe(true)
  })

  it('parado, não aborta mais', () => {
    const vigia = watchStall(1000)
    vigia.stop()
    vi.advanceTimersByTime(5000)
    expect(vigia.signal.aborted).toBe(false)
  })
})
