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
import { fillMissingDifficulties } from '../engine/chart/reduce'
import type { Song } from '../engine/types'
import { buildDemoSong } from '../content/demoSong'
import { parseSongIni } from './songIni'
import type { StemRole } from '../audio/songPlayer'
import { filePrefix, libraryIndexUrl, type LibraryIndex } from './libraryIndex'
import { mapInOrder } from './mapInOrder'

export interface AudioTrack {
  url: string
  role: StemRole
}

export interface SongEntry {
  song: Song
  /** Faixas tocáveis, com o papel de cada uma; vazio na faixa sintetizada. */
  tracks: AudioTrack[]
  /**
   * O clipe de preview do pack, quando existe (`preview.ogg`/`.opus`).
   *
   * Fica fora de `tracks` de propósito: ele não faz parte da mixagem da
   * música e não pode entrar no palco. É o trecho que o charter escolheu
   * para representar a faixa no menu, e é o melhor ponto de partida que
   * existe para o preview da seleção.
   */
  preview?: string
  /** A faixa demo é gerada, não carregada. */
  synthesized: boolean
  /** De onde veio: `.chart` ou `notes.mid`. */
  format: 'chart' | 'midi' | 'gerada'
  /**
   * Dificuldade declarada da guitarra, de 0 a 6; -1 quando o pack não diz.
   *
   * É o número que o charter escolheu, e vale mais que qualquer medida
   * automática — ele sabe se a música é difícil por velocidade, por acordes
   * ou por um solo de dez segundos que não aparece na média.
   */
  declaredDifficulty: number
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

function isPreviewName(name: string) {
  return name.replace(/\.[^.]+$/, '').toLowerCase() === 'preview'
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
  return {
    song: buildDemoSong(),
    tracks: [],
    synthesized: true,
    format: 'gerada',
    declaredDifficulty: 1,
  }
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
  const previewFile = files.find((f) => isAudio(f.name) && isPreviewName(f.name))
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

  // A maioria dos charts da comunidade traz só o expert. Sem preencher o
  // resto, três das quatro dificuldades ficam vazias e não existe rampa
  // nenhuma entre o nível inicial e o mais alto.
  song = { ...song, charts: fillMissingDifficulties(song.charts) }

  return {
    song,
    tracks: audioFiles.map((file) => ({ url: file.url, role: roleOf(file.name) })),
    preview: previewFile?.url,
    synthesized: false,
    format,
    declaredDifficulty: ini?.guitarDifficulty ?? -1,
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

/**
 * A música tem áudio?
 *
 * Um chart sem áudio carrega e desenha as notas, mas em silêncio — e um jogo
 * de ritmo em silêncio não é jogável. Vale como item de lista, para mostrar
 * o que está esperando o áudio chegar, mas não como algo que se inicia.
 */
export function isPlayable(entry: SongEntry): boolean {
  return entry.synthesized || entry.tracks.length > 0
}

export function releaseEntry(entry: SongEntry) {
  for (const track of entry.tracks) URL.revokeObjectURL(track.url)
  if (entry.preview) URL.revokeObjectURL(entry.preview)
}

/** Um endereço tocável fora do palco, e onde começar a tocá-lo. */
export interface BackgroundAudio {
  url: string
  /** Duração declarada, quando o `song.ini` a traz. */
  duration?: number
  /** Onde começar; sem isto, quem toca escolhe. */
  startAt?: number
}

/**
 * A faixa que representa a música fora do palco.
 *
 * Duas situações usam isto: o fundo do menu e o preview da seleção. As
 * duas querem *a* parte que identifica a faixa, e aí vale a opinião de quem
 * charteou: primeiro o `preview.opus` — o do pack, ou o que
 * `upload-assets` gera para toda música publicada —, depois o
 * `preview_start_time` do `song.ini`, e só então o meio.
 *
 * De cada pacote sai uma faixa só. Quando há várias, a escolhida é a
 * `backing` — o `song.ogg` da convenção do Clone Hero, a banda já
 * misturada. Tocar as faixas separadas em sincronia custaria vários fluxos
 * abertos para um som que é de fundo.
 */
export function backgroundAudio(
  entry: SongEntry,
  { usePreview = false } = {},
): BackgroundAudio | null {
  if (usePreview && entry.preview) return { url: entry.preview, startAt: 0 }

  const track = entry.tracks.find((t) => t.role === 'backing') ?? entry.tracks[0]
  if (!track) return null

  const { length, previewStart } = entry.song.meta
  return {
    url: track.url,
    duration: length > 0 ? length : undefined,
    startAt: usePreview && previewStart > 0 ? previewStart : undefined,
  }
}

/**
 * A trilha do menu: um clipe de cada música da biblioteca.
 *
 * O preview desde o início, quando existe. Além de ser o trecho que
 * representa a faixa, tocá-lo do começo não depende de o servidor aceitar
 * pular para o meio de um arquivo — coisa que o host de assets não faz.
 */
export function menuTracks(entries: SongEntry[]): Array<BackgroundAudio & { id: string }> {
  const tracks: Array<BackgroundAudio & { id: string }> = []
  for (const entry of entries) {
    if (entry.synthesized) continue
    const audio = backgroundAudio(entry, { usePreview: true })
    if (audio) tracks.push({ id: entry.song.meta.id, ...audio })
  }
  return tracks
}

/**
 * A demo aparece nas listas?
 *
 * Ela é rede de segurança, não catálogo: existe para o jogo não abrir vazio
 * quando não há pasta `songs/` — num build estático, ou antes da varredura
 * terminar. Com biblioteca de verdade no ar, sai de cena.
 *
 * `?debug` a mantém à vista porque é ela que o teste de fumaça toca: o
 * chart é gerado pelo mesmo arquivo que gera o áudio, então os dois nunca
 * saem de sincronia e o teste pode exigir 100% de acerto.
 */
export function demoVisible(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')
}

/** O que as telas mostram: a biblioteca sem a demo, quando há o que mostrar. */
export function catalogue(entries: SongEntry[]): SongEntry[] {
  if (demoVisible()) return entries
  const real = entries.filter((entry) => !entry.synthesized)
  return real.length > 0 ? real : entries
}

/**
 * O índice da biblioteca e a URL de onde ele veio.
 *
 * Um endereço só por build: o do host de assets na versão hospedada, o do
 * plugin na própria máquina. Sem índice, a biblioteca fica vazia e o
 * catálogo cai na faixa de demonstração.
 */
async function fetchLibraryIndex(): Promise<{ index: LibraryIndex; url: string } | null> {
  const url = libraryIndexUrl(import.meta.env.VITE_ASSETS_BASE)
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return { index: (await response.json()) as LibraryIndex, url }
  } catch {
    return null
  }
}

/** Quantas pastas da biblioteca são lidas ao mesmo tempo. */
const PARALLEL_FOLDERS = 6

/**
 * Carrega a biblioteca publicada: a pasta `songs/` servida pelo plugin, ou
 * o índice do host de assets na versão hospedada.
 *
 * Os endereços são URLs normais, então a biblioteca continua lá depois de
 * recarregar a página — ao contrário do seletor de pastas, cujos blobs
 * morrem com a aba. `onProgress` conta pastas lidas contra o total.
 */
export async function loadLocalLibrary(
  onProgress?: (done: number, total: number) => void,
): Promise<SongEntry[]> {
  const found = await fetchLibraryIndex()
  if (!found) return []

  const prefix = filePrefix(found.index, found.url, location.href)

  const entries = await mapInOrder(
    found.index.songs,
    PARALLEL_FOLDERS,
    async (folder) => {
      const files: SongFile[] = folder.files.map((name) => {
        // Cada segmento é codificado em separado: codificar o caminho inteiro
        // escaparia as barras e o servidor não acharia a subpasta. É também
        // a forma que o host de assets considera canônica — outra
        // codificação recebe um 307 até ela.
        const segments = [...folder.path.split('/').filter(Boolean), name]
        const url = `${prefix}/${segments.map(encodeURIComponent).join('/')}`
        return {
          name,
          url,
          text: async () => (await fetch(url)).text(),
          arrayBuffer: async () => (await fetch(url)).arrayBuffer(),
        }
      })

      try {
        return await entryFromFiles(folder.id, files)
      } catch (error) {
        console.warn(`Não consegui ler a música em songs/${folder.path}:`, error)
        return null
      }
    },
    onProgress,
  )

  return entries.filter((entry): entry is SongEntry => entry !== null)
}
