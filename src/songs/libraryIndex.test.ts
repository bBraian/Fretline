import { describe, expect, it } from 'vitest'
import { filePrefix, libraryIndexUrl } from './libraryIndex'

describe('libraryIndexUrl', () => {
  it('sem host de assets, é o índice do plugin', () => {
    expect(libraryIndexUrl(undefined)).toBe('/library/index.json')
    expect(libraryIndexUrl('')).toBe('/library/index.json')
  })

  it('com host, é o library.json dele', () => {
    expect(libraryIndexUrl('https://a.workers.dev')).toBe('https://a.workers.dev/library.json')
  })

  it('tolera barra no fim e subcaminho', () => {
    expect(libraryIndexUrl('https://a.workers.dev/')).toBe('https://a.workers.dev/library.json')
    expect(libraryIndexUrl('https://h.dev/sub/')).toBe('https://h.dev/sub/library.json')
  })
})

describe('filePrefix', () => {
  const page = 'https://fretline.vercel.app/'

  it('sem base, os arquivos saem do plugin', () => {
    expect(filePrefix({ songs: [] }, '/library/index.json', page)).toBe('/library/file')
  })

  it('resolve o base relativo contra a URL do índice, não da página', () => {
    expect(filePrefix({ base: 'songs/', songs: [] }, 'https://a.workers.dev/library.json', page)).toBe(
      'https://a.workers.dev/songs',
    )
  })

  it('mantém o subcaminho do host', () => {
    expect(filePrefix({ base: 'songs/', songs: [] }, 'https://h.dev/sub/library.json', page)).toBe(
      'https://h.dev/sub/songs',
    )
  })

  it('aceita base absoluta, como o manifesto antigo', () => {
    expect(filePrefix({ base: 'https://b.dev/songs/', songs: [] }, 'https://a.dev/library.json', page)).toBe(
      'https://b.dev/songs',
    )
  })
})
