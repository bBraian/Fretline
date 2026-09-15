/**
 * Leitor de arquivo MIDI padrão.
 *
 * Só o necessário para ler charts: cabeçalho, trilhas, eventos de nota,
 * meta-eventos de andamento, compasso e nome de trilha, e mensagens SysEx —
 * que é por onde o formato do Phase Shift marca notas abertas e tap.
 *
 * O formato guarda tempos em *delta* de ticks desde o evento anterior, com
 * os números codificados em quantidade de tamanho variável: sete bits por
 * byte, com o bit mais alto indicando que ainda vem mais. Converter para
 * tempo absoluto na leitura evita que todo o resto do código tenha que
 * somar deltas.
 */

export interface MidiNoteEvent {
  kind: 'note'
  tick: number
  note: number
  velocity: number
  /** `true` para note-on com velocidade maior que zero. */
  on: boolean
  channel: number
}

export interface MidiMetaEvent {
  kind: 'meta'
  tick: number
  type: number
  data: Uint8Array
}

export interface MidiSysexEvent {
  kind: 'sysex'
  tick: number
  data: Uint8Array
}

export type MidiEvent = MidiNoteEvent | MidiMetaEvent | MidiSysexEvent

export interface MidiTrack {
  name: string
  events: MidiEvent[]
}

export interface MidiFile {
  /** Ticks por semínima. */
  division: number
  tracks: MidiTrack[]
}

const META_TRACK_NAME = 0x03
export const META_TEMPO = 0x51
export const META_TIME_SIGNATURE = 0x58
export const META_TEXT = 0x01

class Reader {
  private offset = 0

  constructor(private view: DataView) {}

  get position() {
    return this.offset
  }

  get remaining() {
    return this.view.byteLength - this.offset
  }

  seek(offset: number) {
    this.offset = offset
  }

  u8() {
    return this.view.getUint8(this.offset++)
  }

  u16() {
    const value = this.view.getUint16(this.offset)
    this.offset += 2
    return value
  }

  u32() {
    const value = this.view.getUint32(this.offset)
    this.offset += 4
    return value
  }

  bytes(length: number) {
    const slice = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length)
    this.offset += length
    // Cópia: a fatia aponta para o buffer original, que some depois.
    return new Uint8Array(slice)
  }

  ascii(length: number) {
    return String.fromCharCode(...this.bytes(length))
  }

  /** Quantidade de tamanho variável: sete bits por byte. */
  varint() {
    let value = 0
    for (let i = 0; i < 4; i++) {
      const byte = this.u8()
      value = (value << 7) | (byte & 0x7f)
      if ((byte & 0x80) === 0) break
    }
    return value
  }
}

export function parseMidiFile(buffer: ArrayBuffer): MidiFile {
  const reader = new Reader(new DataView(buffer))

  if (reader.ascii(4) !== 'MThd') throw new Error('não é um arquivo MIDI: falta o cabeçalho MThd')
  const headerLength = reader.u32()
  const headerEnd = reader.position + headerLength

  reader.u16() // formato: 0, 1 ou 2; a leitura abaixo serve para os três
  const trackCount = reader.u16()
  const division = reader.u16()

  if (division & 0x8000) {
    // Divisão em quadros por segundo (SMPTE). Charts não usam, e tratar como
    // ticks por semínima daria um mapa de tempo silenciosamente errado.
    throw new Error('MIDI com divisão SMPTE não é suportado')
  }

  reader.seek(headerEnd)

  const tracks: MidiTrack[] = []

  for (let i = 0; i < trackCount && reader.remaining > 8; i++) {
    const chunk = reader.ascii(4)
    const length = reader.u32()
    const end = reader.position + length

    if (chunk !== 'MTrk') {
      // Pedaço desconhecido: o formato manda pular pelo tamanho declarado.
      reader.seek(end)
      continue
    }

    tracks.push(readTrack(reader, end))
    reader.seek(end)
  }

  return { division, tracks }
}

function readTrack(reader: Reader, end: number): MidiTrack {
  const events: MidiEvent[] = []
  let tick = 0
  let runningStatus = 0
  let name = ''

  while (reader.position < end) {
    tick += reader.varint()

    let status = reader.u8()
    if ((status & 0x80) === 0) {
      // Status omitido: o formato permite repetir o anterior, e o byte lido
      // já é o primeiro dado.
      reader.seek(reader.position - 1)
      status = runningStatus
    } else {
      runningStatus = status
    }

    const type = status & 0xf0
    const channel = status & 0x0f

    if (status === 0xff) {
      const metaType = reader.u8()
      const length = reader.varint()
      const data = reader.bytes(length)
      if (metaType === META_TRACK_NAME) name = String.fromCharCode(...data)
      events.push({ kind: 'meta', tick, type: metaType, data })
      continue
    }

    if (status === 0xf0 || status === 0xf7) {
      const length = reader.varint()
      events.push({ kind: 'sysex', tick, data: reader.bytes(length) })
      continue
    }

    switch (type) {
      case 0x80:
      case 0x90: {
        const note = reader.u8()
        const velocity = reader.u8()
        // Note-on com velocidade zero é o jeito antigo de desligar a nota.
        events.push({
          kind: 'note',
          tick,
          note,
          velocity,
          on: type === 0x90 && velocity > 0,
          channel,
        })
        break
      }
      case 0xa0:
      case 0xb0:
      case 0xe0:
        reader.bytes(2)
        break
      case 0xc0:
      case 0xd0:
        reader.bytes(1)
        break
      default:
        // Status desconhecido: sem o tamanho não dá para continuar em
        // sincronia, então a trilha para aqui.
        reader.seek(end)
        break
    }
  }

  return { name, events }
}
