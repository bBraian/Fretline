import { describe, expect, it } from 'vitest'
import { TrackLoadError } from '../audio/download'
import { loadErrorView } from './loadError'

describe('loadErrorView', () => {
  it('rede caída: conferir a conexão, e tentar de novo adianta', () => {
    expect(loadErrorView(new TrackLoadError('network', 'caiu'))).toEqual({
      message: 'Não consegui baixar a música. Confira a conexão e tente de novo.',
      retryable: true,
    })
    expect(loadErrorView(new TrackLoadError('network', '503', { status: 503 })).retryable).toBe(true)
  })

  it('arquivo que o servidor não tem: tentar de novo não adianta', () => {
    const view = loadErrorView(new TrackLoadError('network', '404', { status: 404 }))
    expect(view).toEqual({ message: 'O áudio dessa música não está no servidor.', retryable: false })
    expect(loadErrorView(new TrackLoadError('network', '403', { status: 403 })).retryable).toBe(false)
  })

  it('áudio que não decodifica: tentar de novo também não', () => {
    expect(loadErrorView(new TrackLoadError('decode', 'ruim'))).toEqual({
      message: 'Não consegui decodificar o áudio dessa música.',
      retryable: false,
    })
  })
})
