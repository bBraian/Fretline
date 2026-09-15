import { describe, expect, it } from 'vitest'
import { parseSongIni } from './songIni'

describe('parseSongIni', () => {
  const sample = `
[song]
name = Barracuda
artist = Heart
album = Little Queen
year = 1977
charter = Alguém
song_length = 261000
preview_start_time = 30000
delay = 250
diff_guitar = 4
; um comentário
# outro comentário
`

  const ini = parseSongIni(sample)

  it('lê os campos de texto', () => {
    expect(ini.meta.name).toBe('Barracuda')
    expect(ini.meta.artist).toBe('Heart')
    expect(ini.meta.album).toBe('Little Queen')
    expect(ini.meta.charter).toBe('Alguém')
  })

  it('converte os campos de tempo de milissegundos para segundos', () => {
    expect(ini.meta.length).toBeCloseTo(261, 5)
    expect(ini.meta.previewStart).toBeCloseTo(30, 5)
    expect(ini.meta.offset).toBeCloseTo(0.25, 5)
  })

  it('lê a dificuldade declarada', () => {
    expect(ini.guitarDifficulty).toBe(4)
  })

  it('ignora comentários e linhas sem igual', () => {
    expect(ini.values.has('; um comentário')).toBe(false)
  })

  it('tolera variação de caixa e espaço nas chaves', () => {
    const odd = parseSongIni('[Song]\n  Preview Start Time  =  1500\nNAME=Teste')
    expect(odd.meta.previewStart).toBeCloseTo(1.5, 5)
    // Chave em maiúsculas e com espaços é o caso comum em packs antigos.
    expect(odd.meta.name).toBe('Teste')
  })

  it('omite campos ausentes em vez de inventar valores', () => {
    const sparse = parseSongIni('[song]\nname = Só o nome')
    expect(sparse.meta.name).toBe('Só o nome')
    expect('offset' in sparse.meta).toBe(false)
    expect('length' in sparse.meta).toBe(false)
    expect(sparse.guitarDifficulty).toBe(-1)
  })
})
