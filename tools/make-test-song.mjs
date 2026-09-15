/**
 * Gera uma música de teste dentro de `songs/`.
 *
 * Serve para conferir que a pasta local está sendo lida corretamente antes
 * de largar um pack de verdade nela: se esta aparecer na lista e tocar, o
 * caminho inteiro — varredura, servidor, parser e áudio — está de pé.
 *
 * O áudio é um WAV escrito à mão, sem depender de codificador nenhum.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DIR = path.resolve('songs', 'Teste Local')
const SAMPLE_RATE = 22050
const BPM = 120
const BEAT = 60 / BPM
const RESOLUTION = 192

// Um riff simples: [batida, traste, altura em semitons acima de Mi grave].
const RIFF = [
  [0, 0, 0],
  [0.5, 1, 3],
  [1, 2, 5],
  [1.5, 1, 3],
  [2, 0, 0],
  [2.5, 2, 5],
  [3, 3, 7],
  [3.5, 2, 5],
]
const BARS = 8

const notes = []
for (let bar = 0; bar < BARS; bar++) {
  for (const [offset, fret, semitone] of RIFF) {
    notes.push({ beat: bar * 4 + offset + 4, fret, semitone })
  }
}

const lastBeat = BARS * 4 + 6

// --- chart ----------------------------------------------------------------

/**
 * Cada dificuldade usa menos trastes e uma grade mais larga, como um chart
 * de verdade: o easy precisa ser tocável com três dedos e ainda soar como a
 * mesma música.
 */
const LEVELS = [
  { section: 'EasySingle', lanes: 2, grid: 1 },
  { section: 'MediumSingle', lanes: 3, grid: 0.5 },
  { section: 'HardSingle', lanes: 4, grid: 0.5 },
  { section: 'ExpertSingle', lanes: 5, grid: 0.25 },
]

const sections = LEVELS.map(({ section, lanes, grid }) => {
  const lines = notes
    .filter((n) => Math.abs(n.beat / grid - Math.round(n.beat / grid)) < 1e-6)
    .map((n) => `  ${Math.round(n.beat * RESOLUTION)} = N ${Math.min(n.fret, lanes - 1)} 0`)

  lines.push(`  ${Math.round(4 * RESOLUTION)} = S 2 ${Math.round(8 * RESOLUTION)}`)
  return `[${section}]\n{\n${lines.join('\n')}\n}`
}).join('\n')

const chart = `[Song]
{
  Name = "Teste Local"
  Artist = "Fretline"
  Charter = "gerado por tools/make-test-song.mjs"
  Offset = 0
  Resolution = ${RESOLUTION}
  MusicStream = "song.wav"
}
[SyncTrack]
{
  0 = TS 4
  0 = B ${BPM * 1000}
}
${sections}
`

// --- áudio ----------------------------------------------------------------

const totalSamples = Math.ceil(lastBeat * BEAT * SAMPLE_RATE)
const pcm = new Int16Array(totalSamples)

for (const note of notes) {
  const start = Math.floor(note.beat * BEAT * SAMPLE_RATE)
  const length = Math.floor(BEAT * 0.45 * SAMPLE_RATE)
  const frequency = 82.4 * Math.pow(2, note.semitone / 12)

  for (let i = 0; i < length && start + i < totalSamples; i++) {
    const t = i / SAMPLE_RATE
    // Decaimento exponencial mais uma oitava acima: soa como corda tocada.
    const envelope = Math.exp(-t * 6)
    const wave =
      Math.sin(2 * Math.PI * frequency * t) * 0.6 +
      Math.sin(4 * Math.PI * frequency * t) * 0.25
    pcm[start + i] += Math.round(wave * envelope * 9000)
  }
}

function wavFile(samples) {
  const dataBytes = samples.length * 2
  const buffer = Buffer.alloc(44 + dataBytes)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16) // tamanho do bloco fmt
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28) // bytes por segundo
  buffer.writeUInt16LE(2, 32) // alinhamento de bloco
  buffer.writeUInt16LE(16, 34) // bits por amostra
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataBytes, 40)

  for (let i = 0; i < samples.length; i++) buffer.writeInt16LE(samples[i], 44 + i * 2)
  return buffer
}

const ini = `[song]
name = Teste Local
artist = Fretline
album = Verificação da pasta songs
year = 2026
charter = tools/make-test-song.mjs
song_length = ${Math.round(lastBeat * BEAT * 1000)}
preview_start_time = 4000
delay = 0
diff_guitar = 2
`

mkdirSync(DIR, { recursive: true })
writeFileSync(path.join(DIR, 'notes.chart'), chart)
writeFileSync(path.join(DIR, 'song.ini'), ini)
writeFileSync(path.join(DIR, 'song.wav'), wavFile(pcm))

console.log(`Música de teste escrita em ${DIR}`)
console.log(`  ${notes.length} notas, ${(lastBeat * BEAT).toFixed(1)}s`)
