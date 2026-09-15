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
import type { Song } from '../engine/types'
import { buildDemoSong } from '../content/demoSong'

export interface SongEntry {
  song: Song
  /** URLs tocáveis das faixas; vazio na faixa sintetizada. */
  audioUrls: string[]
  /** A faixa demo é gerada, não carregada. */
  synthesized: boolean
}

const AUDIO_EXTENSIONS = ['.ogg', '.mp3', '.opus', '.wav', '.m4a']

function isAudio(name: string) {
  const lower = name.toLowerCase()
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function isChart(name: string) {
  return name.toLowerCase().endsWith('.chart')
}

export function demoEntry(): SongEntry {
  return { song: buildDemoSong(), audioUrls: [], synthesized: true }
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

async function entryFromFiles(folderName: string, files: File[]): Promise<SongEntry | null> {
  const chartFile = files.find((f) => isChart(f.name))
  if (!chartFile) return null

  const audioFiles = files.filter((f) => isAudio(f.name))
  const text = await chartFile.text()

  const song = parseChart(text, {
    id: folderName.split('/').pop() || folderName,
    audioFiles: audioFiles.map((f) => f.name),
  })

  return {
    song,
    audioUrls: audioFiles.map((f) => URL.createObjectURL(f)),
    synthesized: false,
  }
}

/** Importa a partir de um `<input type="file" webkitdirectory>`. */
export async function importFromFileList(fileList: FileList): Promise<SongEntry[]> {
  const files = [...fileList]
  const entries: SongEntry[] = []

  for (const [folder, folderFiles] of groupByFolder(files)) {
    try {
      const entry = await entryFromFiles(folder, folderFiles)
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
        if (isChart(child.name) || isAudio(child.name)) files.push(await child.getFile())
      } else if (depth < 2) {
        subdirectories.push(child)
      }
    }

    if (files.some((f) => isChart(f.name))) {
      const entry = await entryFromFiles(dir.name, files)
      if (entry) entries.push(entry)
    }

    for (const sub of subdirectories) await collect(sub, depth + 1)
  }

  await collect(root, 0)
  return entries
}

export function releaseEntry(entry: SongEntry) {
  for (const url of entry.audioUrls) URL.revokeObjectURL(url)
}
