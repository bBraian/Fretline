import { describe, expect, it } from 'vitest'
import { parseChart } from './parseChart'
import { TempoMap } from './tempoMap'

/** Chart mínimo de referência, escrito à mão para os testes. */
const CHART = `
[Song]
{
  Name = "Teste"
  Artist = "Banda"
  Resolution = 192
  Offset = 0
  MusicStream = "song.ogg"
}
[SyncTrack]
{
  0 = TS 4
  0 = B 120000
  768 = B 240000
}
[ExpertSingle]
{
  0 = N 0 0
  192 = N 1 0
  192 = N 2 0
  384 = N 0 192
  768 = N 3 0
  768 = S 2 384
  960 = N 7 0
}
`

describe('TempoMap', () => {
  it('converte tick em segundos a 120 BPM', () => {
    const map = new TempoMap(192, [{ tick: 0, bpmThousandths: 120000 }])
    // 120 BPM: uma batida (192 ticks) dura meio segundo.
    expect(map.timeAt(192)).toBeCloseTo(0.5, 6)
    expect(map.timeAt(768)).toBeCloseTo(2, 6)
  })

  it('acumula a mudança de andamento no meio da música', () => {
    const map = new TempoMap(192, [
      { tick: 0, bpmThousandths: 120000 },
      { tick: 768, bpmThousandths: 240000 },
    ])
    // Até 768 são 2s a 120 BPM; depois cada batida passa a durar 0,25s.
    expect(map.timeAt(768)).toBeCloseTo(2, 6)
    expect(map.timeAt(960)).toBeCloseTo(2.25, 6)
  })

  it('mede a duração de um sustain no andamento vigente', () => {
    const map = new TempoMap(192, [
      { tick: 0, bpmThousandths: 120000 },
      { tick: 768, bpmThousandths: 240000 },
    ])
    expect(map.durationOf(384, 192)).toBeCloseTo(0.5, 6)
    expect(map.durationOf(768, 192)).toBeCloseTo(0.25, 6)
  })
})

describe('parseChart', () => {
  const song = parseChart(CHART)
  const chart = song.charts.expert!

  it('lê os metadados', () => {
    expect(song.meta.name).toBe('Teste')
    expect(song.meta.artist).toBe('Banda')
    expect(song.audioFiles).toEqual(['song.ogg'])
  })

  it('agrupa eventos do mesmo tick num acorde', () => {
    const chord = chart.notes[1]
    expect(chord.time).toBeCloseTo(0.5, 6)
    // Vermelho (bit 1) e amarelo (bit 2) juntos.
    expect(chord.frets).toBe(0b00110)
  })

  it('converte sustain para segundos', () => {
    const sustain = chart.notes[2]
    expect(sustain.duration).toBeCloseTo(0.5, 6)
  })

  /**
   * O `.chart` aceita qualquer comprimento, inclusive um tick, e vários
   * editores gravam a célula da grade em vez de zero. Sem limiar, cada uma
   * dessas notas virava um rastro na pista e um sustain a segurar.
   */
  it('comprimento curto demais não vira sustain', () => {
    const curto = parseChart(`
[Song]
{
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[ExpertSingle]
{
  0 = N 0 48
  192 = N 1 64
}
`)
    const notes = curto.charts.expert!.notes
    // 48 ticks é uma semicolcheia: notação, não intenção de segurar.
    expect(notes[0].duration).toBe(0)
    // 64 ticks é o limiar — uma colcheia de tercina — e já conta.
    expect(notes[1].duration).toBeGreaterThan(0)
  })

  it('marca nota aberta', () => {
    const open = chart.notes.at(-1)!
    expect(open.isOpen).toBe(true)
    expect(open.frets).toBe(0)
  })

  it('extrai os trechos de star power', () => {
    expect(chart.starPower).toHaveLength(1)
    expect(chart.starPower[0].start).toBeCloseTo(2, 6)
    expect(chart.starPower[0].end).toBeCloseTo(2.5, 6)
  })

  it('numera as notas em sequência', () => {
    expect(chart.notes.map((n) => n.index)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('derivação de HOPO', () => {
  function chartWith(body: string) {
    return parseChart(`
[Song]
{
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[ExpertSingle]
{
${body}
}
`).charts.expert!
  }

  it('nota próxima em outro traste vira HOPO', () => {
    const chart = chartWith('  0 = N 0 0\n  48 = N 1 0')
    expect(chart.notes[1].type).toBe('hopo')
  })

  it('nota longe fica strum', () => {
    const chart = chartWith('  0 = N 0 0\n  192 = N 1 0')
    expect(chart.notes[1].type).toBe('strum')
  })

  it('traste repetido não vira HOPO', () => {
    const chart = chartWith('  0 = N 0 0\n  48 = N 0 0')
    expect(chart.notes[1].type).toBe('strum')
  })

  it('acorde nunca é HOPO natural', () => {
    const chart = chartWith('  0 = N 0 0\n  48 = N 1 0\n  48 = N 2 0')
    expect(chart.notes[1].type).toBe('strum')
  })

  it('a flag forced inverte o resultado natural', () => {
    const hopoForcedToStrum = chartWith('  0 = N 0 0\n  48 = N 1 0\n  48 = N 5 0')
    expect(hopoForcedToStrum.notes[1].type).toBe('strum')

    const strumForcedToHopo = chartWith('  0 = N 0 0\n  192 = N 1 0\n  192 = N 5 0')
    expect(strumForcedToHopo.notes[1].type).toBe('hopo')
  })

  it('a flag tap ganha da flag forced', () => {
    const chart = chartWith('  0 = N 0 0\n  192 = N 1 0\n  192 = N 5 0\n  192 = N 6 0')
    expect(chart.notes[1].type).toBe('tap')
  })

  it('a primeira nota da música nunca é HOPO', () => {
    const chart = chartWith('  0 = N 0 0\n  48 = N 1 0')
    expect(chart.notes[0].type).toBe('strum')
  })
})
