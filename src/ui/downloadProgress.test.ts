import { describe, expect, it } from 'vitest'
import { downloadProgress, mb, type DownloadItem } from './downloadProgress'

describe('downloadProgress', () => {
  it('enquanto alguém não respondeu, está conectando e sem fração', () => {
    expect(
      downloadProgress([
        { state: 'receiving', loaded: 10, total: 100 },
        { state: 'waiting', loaded: 0 },
      ]),
    ).toEqual({ phase: 'connecting', fraction: null, loaded: 10, total: null })
  })

  it('com todos os tamanhos conhecidos, conta por bytes', () => {
    expect(
      downloadProgress([
        { state: 'receiving', loaded: 25, total: 100 },
        { state: 'done', loaded: 300, total: 300 },
      ]),
    ).toEqual({ phase: 'downloading', fraction: 325 / 400, loaded: 325, total: 400 })
  })

  it('sem Content-Length em algum, conta por arquivo', () => {
    expect(
      downloadProgress([
        { state: 'receiving', loaded: 25 },
        { state: 'done', loaded: 300, total: 300 },
        { state: 'receiving', loaded: 5, total: 50 },
      ]),
    ).toEqual({ phase: 'downloading', fraction: 1 / 3, loaded: 330, total: null })
  })

  it('um arquivo pronto sem Content-Length conta o que chegou como total', () => {
    const p = downloadProgress([
      { state: 'done', loaded: 80 },
      { state: 'receiving', loaded: 10, total: 20 },
    ])
    expect(p).toEqual({ phase: 'downloading', fraction: 90 / 100, loaded: 90, total: 100 })
  })

  it('tudo chegado é pronto, e lista vazia também', () => {
    expect(downloadProgress([{ state: 'done', loaded: 100, total: 100 }])).toEqual({
      phase: 'done',
      fraction: 1,
      loaded: 100,
      total: 100,
    })
    expect(downloadProgress([])).toEqual({ phase: 'done', fraction: 1, loaded: 0, total: 0 })
  })

  it('a fração nunca diminui ao longo de um download', () => {
    const passos: DownloadItem[][] = [
      [{ state: 'waiting', loaded: 0 }, { state: 'waiting', loaded: 0 }],
      [{ state: 'receiving', loaded: 0, total: 100 }, { state: 'waiting', loaded: 0 }],
      [{ state: 'receiving', loaded: 0, total: 100 }, { state: 'receiving', loaded: 0, total: 300 }],
      [{ state: 'receiving', loaded: 50, total: 100 }, { state: 'receiving', loaded: 0, total: 300 }],
      [{ state: 'receiving', loaded: 50, total: 100 }, { state: 'receiving', loaded: 150, total: 300 }],
      [{ state: 'done', loaded: 100, total: 100 }, { state: 'receiving', loaded: 150, total: 300 }],
      [{ state: 'done', loaded: 100, total: 100 }, { state: 'done', loaded: 300, total: 300 }],
    ]
    const fracoes = passos
      .map((itens) => downloadProgress(itens).fraction)
      .filter((f): f is number => f !== null)
    expect(fracoes).toEqual([...fracoes].sort((a, b) => a - b))
    expect(fracoes.at(-1)).toBe(1)
  })
})

describe('mb', () => {
  it('em megabytes, com vírgula e uma casa', () => {
    expect(mb(13 * 1024 * 1024)).toBe('13,0')
    expect(mb(12.44 * 1024 * 1024)).toBe('12,4')
    expect(mb(0)).toBe('0,0')
  })
})
