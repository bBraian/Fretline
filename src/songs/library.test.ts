import { describe, expect, it } from 'vitest'
import { demoEntry, menuTracks, type SongEntry } from './library'

function musica(
  campos: Partial<SongEntry>,
  meta: Partial<SongEntry['song']['meta']> = {},
): SongEntry {
  const base = demoEntry()
  return {
    ...base,
    synthesized: false,
    format: 'midi',
    ...campos,
    song: { ...base.song, meta: { ...base.song.meta, ...meta } },
  }
}

describe('menuTracks', () => {
  it('toca o preview desde o início quando ele existe', () => {
    const entry = musica(
      { preview: 'https://h/songs/a/preview.opus', tracks: [{ url: 'https://h/songs/a/song.opus', role: 'backing' }] },
      { id: 'a', previewStart: 45 },
    )
    expect(menuTracks([entry])).toEqual([{ id: 'a', url: 'https://h/songs/a/preview.opus', startAt: 0 }])
  })

  it('sem preview, toca a faixa de fundo a partir do preview_start_time', () => {
    const entry = musica(
      { tracks: [{ url: 'g.opus', role: 'guitar' }, { url: 's.opus', role: 'backing' }] },
      { id: 'b', previewStart: 45, length: 200 },
    )
    expect(menuTracks([entry])).toEqual([{ id: 'b', url: 's.opus', duration: 200, startAt: 45 }])
  })

  it('deixa de fora a faixa sintetizada e as músicas sem áudio', () => {
    expect(menuTracks([demoEntry(), musica({ tracks: [] })])).toEqual([])
  })
})
