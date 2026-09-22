import { describe, expect, it } from 'vitest'
import { groupStems, isDuckedRole } from './stems'
import type { StemRole } from './songPlayer'

const of = (...roles: StemRole[]) => roles.map((role, i) => ({ role, id: i }))

describe('agrupamento das faixas', () => {
  it('guitarra e base abafam juntas; o resto não', () => {
    expect(isDuckedRole('guitar')).toBe(true)
    expect(isDuckedRole('rhythm')).toBe(true)
    expect(isDuckedRole('bass')).toBe(false)
    expect(isDuckedRole('drums')).toBe(false)
    expect(isDuckedRole('vocals')).toBe(false)
    expect(isDuckedRole('backing')).toBe(false)
  })

  /**
   * O jogo só precisa separar duas coisas: o que cala quando o jogador erra
   * e o que continua tocando. Um pacote de Rock Band traz sete faixas —
   * três só de bateria — e manter as sete decodificadas custa centenas de
   * megabytes de PCM e sete fontes tocando ao mesmo tempo, sem que nada no
   * jogo saiba distinguir uma bateria da outra.
   */
  it('reduz um pacote de sete faixas a dois grupos', () => {
    const { ducked, rest } = groupStems(
      of('guitar', 'rhythm', 'drums', 'drums', 'drums', 'vocals', 'backing'),
    )

    expect(ducked.map((s) => s.role)).toEqual(['guitar', 'rhythm'])
    expect(rest).toHaveLength(5)
  })

  it('sem faixa de guitarra, tudo cai no grupo que não abafa', () => {
    const { ducked, rest } = groupStems(of('backing'))
    expect(ducked).toHaveLength(0)
    expect(rest).toHaveLength(1)
  })
})
