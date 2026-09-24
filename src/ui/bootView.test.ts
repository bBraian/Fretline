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
