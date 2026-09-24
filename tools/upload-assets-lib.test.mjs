import { describe, expect, it } from 'vitest'
import {
  PREVIEW_FILE,
  buildManifest,
  ffmpegPreviewArgs,
  pickPreviewSource,
  previewClip,
  publishedFiles,
  readIni,
} from './upload-assets-lib.mjs'

describe('readIni', () => {
  it('lê chave e valor, com a chave em minúsculas', () => {
    const ini = readIni('[song]\nName = Barracuda\npreview_start_time = 45000\n')
    expect(ini).toEqual({ name: 'Barracuda', preview_start_time: '45000' })
  })

  it('ignora comentários, seções e o BOM do início', () => {
    const ini = readIni('﻿[song]\r\n; x = 1\r\n# y = 2\r\nsong_length = 200000\r\n')
    expect(ini).toEqual({ song_length: '200000' })
  })
})

describe('pickPreviewSource', () => {
  it('prefere o preview do pack', () => {
    expect(pickPreviewSource(['song.opus', 'preview.ogg', 'guitar.opus'])).toEqual({
      names: ['preview.ogg'],
      fromPack: true,
    })
  })

  it('sem preview, mistura todas as faixas tocáveis', () => {
    // Num pack com instrumentos separados, o `song.opus` guarda só o que
    // sobrou — às vezes silêncio. A música é a soma.
    expect(pickPreviewSource(['guitar.opus', 'song.opus', 'drums_1.opus'])).toEqual({
      names: ['drums_1.opus', 'guitar.opus', 'song.opus'],
      fromPack: false,
    })
  })

  it('nunca mistura a plateia gravada', () => {
    expect(pickPreviewSource(['crowd.ogg', 'guitar.ogg'])?.names).toEqual(['guitar.ogg'])
    expect(pickPreviewSource(['crowd.ogg', 'notes.mid'])).toBeNull()
  })

  it('sem áudio nenhum, não há preview', () => {
    expect(pickPreviewSource(['notes.mid', 'song.ini'])).toBeNull()
  })
})

describe('previewClip', () => {
  it('o preview do pack é reencodado desde o início', () => {
    expect(previewClip({ fromPack: true, previewStartMs: 45000, sourceSeconds: 25 })).toEqual({
      start: 0,
      length: 25,
    })
  })

  it('usa o preview_start_time do song.ini', () => {
    expect(previewClip({ fromPack: false, previewStartMs: 45000, sourceSeconds: 200 })).toEqual({
      start: 45,
      length: 30,
    })
  })

  it('sem preview_start_time, começa em 35% da faixa', () => {
    const clip = previewClip({ fromPack: false, previewStartMs: 0, sourceSeconds: 200 })
    expect(clip.start).toBeCloseTo(70, 5)
    expect(clip.length).toBe(30)
  })

  it('trata preview_start_time negativo como ausente', () => {
    const clip = previewClip({ fromPack: false, previewStartMs: -1, sourceSeconds: 200 })
    expect(clip.start).toBeCloseTo(70, 5)
  })

  it('um início perto do fim recua para o clipe caber inteiro', () => {
    expect(previewClip({ fromPack: false, previewStartMs: 190000, sourceSeconds: 200 })).toEqual({
      start: 170,
      length: 30,
    })
  })

  it('uma faixa curta vira um clipe curto, desde o começo', () => {
    expect(previewClip({ fromPack: false, previewStartMs: 0, sourceSeconds: 20 })).toEqual({
      start: 0,
      length: 20,
    })
  })

  it('sem duração conhecida, não há clipe', () => {
    expect(previewClip({ fromPack: false, previewStartMs: 0, sourceSeconds: NaN })).toBeNull()
    expect(previewClip({ fromPack: false, previewStartMs: 0, sourceSeconds: 0 })).toBeNull()
  })
})

describe('ffmpegPreviewArgs', () => {
  const args = ffmpegPreviewArgs({ inputs: ['in.opus'], output: 'out.opus', start: 45, length: 20 })
  const filtro = (a) => a[a.indexOf('-filter_complex') + 1]

  it('corta na entrada, antes do -i', () => {
    const i = args.indexOf('-i')
    expect(args.slice(i - 4, i)).toEqual(['-ss', '45.000', '-t', '20.000'])
    expect(args[i + 1]).toBe('in.opus')
  })

  it('o fade de saída termina junto com o clipe', () => {
    expect(filtro(args)).toContain('afade=t=in:d=0.5,afade=t=out:st=19.000:d=1')
  })

  it('com uma faixa só, não mistura', () => {
    expect(filtro(args)).not.toContain('amix')
  })

  it('com várias faixas, corta cada uma e soma sem reduzir o volume', () => {
    const varias = ffmpegPreviewArgs({ inputs: ['a.ogg', 'b.ogg', 'c.ogg'], output: 'o.opus', start: 10, length: 30 })
    for (const nome of ['a.ogg', 'b.ogg', 'c.ogg']) {
      const i = varias.indexOf(nome)
      expect(varias.slice(i - 5, i)).toEqual(['-ss', '10.000', '-t', '30.000', '-i'])
    }
    expect(filtro(varias)).toContain('[0:a:0][1:a:0][2:a:0]amix=inputs=3:normalize=0')
  })

  it('encoda em Opus a 96 kbps e escreve por último a saída', () => {
    expect(args).toEqual(expect.arrayContaining(['-c:a', 'libopus', '-b:a', '96k']))
    expect(args.at(-1)).toBe('out.opus')
  })
})

describe('publishedFiles', () => {
  it('deixa de fora o preview do pack e o que o jogo não lê', () => {
    expect(publishedFiles(['song.opus', 'preview.opus', 'album.jpg', 'notes.mid', 'song.ini'])).toEqual(
      ['song.opus', 'notes.mid', 'song.ini'],
    )
  })
})

describe('buildManifest', () => {
  const manifest = buildManifest([
    { id: 'B', path: 'B', files: ['song.ogg', 'preview.ogg', 'notes.mid'], hasPreview: true },
    { id: 'A', path: 'A', files: ['notes.mid'], hasPreview: false },
  ])

  it('tem base relativa', () => {
    expect(manifest.base).toBe('songs/')
  })

  it('ordena as músicas pelo caminho', () => {
    expect(manifest.songs.map((s) => s.id)).toEqual(['A', 'B'])
  })

  it('troca o preview do pack pelo gerado, uma vez só', () => {
    expect(manifest.songs[1].files).toEqual(['notes.mid', PREVIEW_FILE, 'song.ogg'])
  })

  it('sem preview gerado, não lista preview', () => {
    expect(manifest.songs[0].files).toEqual(['notes.mid'])
  })
})
