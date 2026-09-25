import { describe, expect, it } from 'vitest'
import { looksLikeGuitar, strumRequired } from './guitar'

const xbox360 = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)'

describe('reconhecer a guitarra', () => {
  it('pelo nome, no Chrome', () => {
    const pad = { id: 'Guitar Hero3 for PlayStation (R) 3 (Vendor: 12ba Product: 0100)', mapping: '', axes: [0, 0, 0, 0] }
    expect(looksLikeGuitar(pad, 2)).toBe(true)
  })

  it('pelo nome, no Firefox', () => {
    const pad = { id: '1430-4748-Guitar Hero X-plorer', mapping: '', axes: [] }
    expect(looksLikeGuitar(pad, 2)).toBe(true)
  })

  it('pelo fabricante, quando o nome não diz', () => {
    const pad = { id: 'USB Gamepad (Vendor: 1430 Product: 4748)', mapping: '', axes: [] }
    expect(looksLikeGuitar(pad, 2)).toBe(true)
  })

  it('a de Xbox 360 no Windows, pela alavanca parada no fim do curso', () => {
    const pad = { id: xbox360, mapping: 'standard', axes: [0, 0, -1, 0.02] }
    expect(looksLikeGuitar(pad, 2)).toBe(true)
  })

  it('controle comum, com o analógico no meio, não é guitarra', () => {
    const pad = { id: xbox360, mapping: 'standard', axes: [0.03, -0.02, 0.05, 0] }
    expect(looksLikeGuitar(pad, 2)).toBe(false)
  })

  it('controle que ainda não mandou leitura nenhuma não é guitarra', () => {
    const pad = { id: xbox360, mapping: 'standard', axes: [0, 0, 0, 0] }
    expect(looksLikeGuitar(pad, 2)).toBe(false)
  })

  it('fora do layout padrão, eixo no extremo não quer dizer nada', () => {
    // Num layout livre o gatilho vira eixo, e gatilho solto descansa em -1.
    const pad = { id: 'Microsoft X-Box 360 pad', mapping: '', axes: [0, 0, -1, 0, 0, -1] }
    expect(looksLikeGuitar(pad, 2)).toBe(false)
  })

  it('sem alavanca ligada, só o nome decide', () => {
    const pad = { id: xbox360, mapping: 'standard', axes: [0, 0, -1, 0] }
    expect(looksLikeGuitar(pad, -1)).toBe(false)
  })

  it('olha o eixo da alavanca que o jogador escolheu', () => {
    const pad = { id: xbox360, mapping: 'standard', axes: [0, 0, 0, 1] }
    expect(looksLikeGuitar(pad, 3)).toBe(true)
    expect(looksLikeGuitar(pad, 2)).toBe(false)
  })
})

describe('quando a palhetada é exigida', () => {
  const guitarra = { id: 'Guitar Hero3 for PlayStation (R) 3', mapping: '', axes: [] }
  const comum = { id: xbox360, mapping: 'standard', axes: [0, 0, 0, 0] }

  it('só na guitarra: com guitarra sim, com controle comum não', () => {
    expect(strumRequired('guitar', guitarra, 2)).toBe(true)
    expect(strumRequired('guitar', comum, 2)).toBe(false)
  })

  it('em qualquer controle: basta haver um', () => {
    expect(strumRequired('always', comum, 2)).toBe(true)
  })

  it('desligada: nem com guitarra', () => {
    expect(strumRequired('off', guitarra, 2)).toBe(false)
  })

  it('sem controle, nunca — o teclado não tem barra', () => {
    expect(strumRequired('always', null, 2)).toBe(false)
    expect(strumRequired('guitar', null, 2)).toBe(false)
  })
})
