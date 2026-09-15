/**
 * A biblioteca de músicas.
 *
 * O jogo não distribui áudio: o jogador aponta a própria pasta de músicas,
 * no mesmo arranjo que o Clone Hero usa — uma pasta por música, contendo o
 * `.chart` e as faixas de áudio. Duas formas de importar, porque a boa só
 * existe em parte dos navegadores:
 *
 * - `showDirectoryPicker`, que devolve um identificador reutilizável e
 *   permite reabrir a mesma pasta depois;
 * - um `<input webkitdirectory>`, que funciona em todo lugar mas só entrega
 *   os arquivos daquela vez.
 *
 * Em qualquer um dos casos, os arquivos viram URLs locais de blob. Nada é
 * enviado para lugar nenhum.
 */

import { parseChart } from '../engine/chart/parseChart'
import { parseMidi } from '../engine/chart/parseMidi'
import type { Song } from '../engine/types'
import { buildDemoSong } from '../content/demoSong'
import { parseSongIni } from './songIni'
import type { StemRole } from '../audio/songPlayer'

export interface AudioTrack {
  url: string
  role: StemRole
}

export interface SongEntry {
  song: Song
  /** Faixas tocáveis, com o papel de cada uma; vazio na faixa sintetizada. */
  tracks: AudioTrack[]
  /** A faixa demo é gerada, não carregada. */
  synthesized: boolean
  /** De onde veio: `.chart` ou `notes.mid`. */
  format: 'chart' | 'midi' | 'gerada'
}

/**
 * Nome de arquivo para papel de faixa.
 *
 * A convenção do Clone Hero é posicional por nome: `guitar.ogg` é a
 * guitarra do jogador, `song.ogg` é o resto da banda já misturado, e os
 * demais são instrumentos separados quando o charter os tem. Reconhecer o
 * papel é o que permite abafar só a guitarra num erro.
 */
const STEM_ROLES: Array<[RegExp, StemRole]> = [
  [/^guitar/i, 'guitar'],
  [/^rhythm/i, 'rhythm'],
  [/^bass/i, 'bass'],
  [/^drums?/i, 'drums'],
  [/^vocals/i, 'vocals'],
]

function roleOf(fileName: string): StemRole {
  const base = fileName.replace(/\.[^.]+$/, '')
  for (const [pattern, role] of STEM_ROLES) {
    if (pattern.test(base)) return role
  }
  return 'backing'
}

/** Arquivos que não fazem parte da mixagem da música. */
function isPlayableAudio(name: string) {
  const base = name.replace(/\.[^.]+$/, '').toLowerCase()
  // `preview` é o trecho tocado no menu e `crowd` é a plateia gravada;
  // nenhum dos dois entra na mixagem do jogo.
  return isAudio(name) && base !== 'preview' && base !== 'crowd'
}

const AUDIO_EXTENSIONS = ['.ogg', '.mp3', '.opus', '.wav', '.m4a']

function isAudio(name: string) {
  const lower = name.toLowerCase()
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function isChart(name: string) {
  return name.toLowerCase().endsWith('.chart')
}

function isMidi(name: string) {
  const lower = name.toLowerCase()
  return lower.endsWith('.mid') || lower.endsWith('.midi')
}

function isIni(name: string) {
  return name.toLowerCase().endsWith('.ini')
}

function isChartFile(name: string) {
  return isChart(name) || isMidi(name)
}

export function demoEntry(): SongEntry {
  return { song: buildDemoSong(), tracks: [], synthesized: true, format: 'gerada' }
}

/** Agrupa uma lista plana de arquivos pela pasta que os contém. */
function groupByFolder(files: File[]): Map<string, File[]> {
  const folders = new Map<string, File[]>()
  for (const file of files) {
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const folder = path.split('/').slice(0, -1).join('/') || '(raiz)'
    const list = folders.get(folder)
    if (list) list.push(file)
    else folders.set(folder, [file])
  }
  return folders
}

/**
 * Um arquivo de música, venha ele do seletor de pastas ou da pasta local
 * servida pelo servidor de desenvolvimento.
 *
 * A abstração existe para que exista um caminho só montando a música: as
 * duas origens diferem apenas em como se lê o conteúdo e em que endereço o
 * áudio fica.
 */
export interface SongFile {
  name: string
  /** Endereço tocável desta faixa. */
  url: string
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
}

function fromBrowserFile(file: File): SongFile {
  return {
    name: file.name,
    // O blob só vale enquanto a aba viver; é o preço do seletor de pastas.
    url: URL.createObjectURL(file),
    text: () => file.text(),
    arrayBuffer: () => file.arrayBuffer(),
  }
}

async function entryFromFiles(folderName: string, files: SongFile[]): Promise<SongEntry | null> {
  const midiFile = files.find((f) => isMidi(f.name))
  const chartFile = files.find((f) => isChart(f.name))
  if (!midiFile && !chartFile) return null

  const audioFiles = files.filter((f) => isPlayableAudio(f.name))
  const iniFile = files.find((f) => isIni(f.name))
  const id = folderName.split('/').pop() || folderName

  // O `.ini` traz nome, artista e deslocamento de áudio, que o MIDI não tem.
  const ini = iniFile ? parseSongIni(await iniFile.text()) : null

  let song: Song
  let format: SongEntry['format']

  if (midiFile) {
    song = parseMidi(await midiFile.arrayBuffer(), {
      id,
      audioFiles: audioFiles.map((f) => f.name),
      meta: ini?.meta,
    })
    format = 'midi'
  } else {
    song = parseChart(await chartFile!.text(), {
      id,
      audioFiles: audioFiles.map((f) => f.name),
    })
    // O `.chart` traz os próprios metadados, mas o `.ini` tem precedência:
    // é ele que o charter atualiza quando corrige um nome ou um atraso.
    if (ini) song = { ...song, meta: { ...song.meta, ...ini.meta } }
    format = 'chart'
  }

  // Sem nome em lugar nenhum, o nome da pasta é melhor que "Sem nome".
  if (!song.meta.name || song.meta.name === 'Sem nome') {
    song = { ...song, meta: { ...song.meta, name: id.replace(/[-_]+/g, ' ') } }
  }

  return {
    song,
    tracks: audioFiles.map((file) => ({ url: file.url, role: roleOf(file.name) })),
    synthesized: false,
    format,
  }
}

/** Importa a partir de um `<input type="file" webkitdirectory>`. */
export async function importFromFileList(fileList: FileList): Promise<SongEntry[]> {
  const files = [...fileList]
  const entries: SongEntry[] = []

  for (const [folder, folderFiles] of groupByFolder(files)) {
    try {
      const entry = await entryFromFiles(folder, folderFiles.map(fromBrowserFile))
      if (entry) entries.push(entry)
    } catch (error) {
      console.warn(`Não consegui ler a música em ${folder}:`, error)
    }
  }

  return entries
}

/** O navegador oferece `showDirectoryPicker`? */
export function supportsDirectoryPicker(): boolean {
  return (
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
    'function'
  )
}

interface FileHandle {
  name: string
  kind: 'file'
  getFile(): Promise<File>
}

interface DirectoryHandle {
  name: string
  kind: 'directory'
  values(): AsyncIterable<DirectoryHandle | FileHandle>
}

/** Importa a partir da API de diretórios, quando disponível. */
export async function importFromDirectoryPicker(): Promise<SongEntry[]> {
  const picker = (
    window as unknown as { showDirectoryPicker: () => Promise<DirectoryHandle> }
  ).showDirectoryPicker

  const root = await picker()
  const entries: SongEntry[] = []

  // A pasta escolhida pode ser a própria música ou conter várias, então a
  // varredura desce alguns níveis antes de desistir.
  const collect = async (dir: DirectoryHandle, depth: number) => {
    const files: File[] = []
    const subdirectories: DirectoryHandle[] = []

    for await (const child of dir.values()) {
      if (child.kind === 'file') {
        if (isChartFile(child.name) || isAudio(child.name) || isIni(child.name)) {
          files.push(await child.getFile())
        }
      } else if (depth < 2) {
        subdirectories.push(child)
      }
    }

    if (files.some((f) => isChartFile(f.name))) {
      const entry = await entryFromFiles(dir.name, files.map(fromBrowserFile))
      if (entry) entries.push(entry)
    }

    for (const sub of subdirectories) await collect(sub, depth + 1)
  }

  await collect(root, 0)
  return entries
}

export function releaseEntry(entry: SongEntry) {
  for (const track of entry.tracks) URL.revokeObjectURL(track.url)
}


/**
 * Carrega a pasta `songs/` do projeto, servida pelo servidor local.
 *
 * É o caminho recomendado para jogar na própria máquina: os endereços são
 * URLs normais, então a biblioteca continua lá depois de recarregar a
 * página — ao contrário do seletor de pastas, cujos blobs morrem com a aba.
 */
export async function loadLocalLibrary(): Promise<SongEntry[]> {
  let index: { songs: Array<{ id: string; path: string; files: string[] }> }

  try {
    const response = await fetch('/library/index.json')
    if (!response.ok) return []
    index = await response.json()
  } catch {
    // Sem o servidor local — build estático, por exemplo — resta o seletor.
    return []
  }

  const entries: SongEntry[] = []

  for (const folder of index.songs) {
    const files: SongFile[] = folder.files.map((name) => {
      // Cada segmento é codificado em separado: codificar o caminho inteiro
      // escaparia as barras e o servidor não acharia a subpasta.
      const segments = [...folder.path.split('/').filter(Boolean), name]
      const url = `/library/file/${segments.map(encodeURIComponent).join('/')}`
      return {
        name,
        url,
        text: async () => (await fetch(url)).text(),
        arrayBuffer: async () => (await fetch(url)).arrayBuffer(),
      }
    })

    try {
      const entry = await entryFromFiles(folder.id, files)
      if (entry) entries.push(entry)
    } catch (error) {
      console.warn(`Não consegui ler a música em songs/${folder.path}:`, error)
    }
  }

  return entries
}
