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
