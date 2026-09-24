/**
 * Seleção de música e importação da biblioteca.
 *
 * A lista é dividida em duas: o que dá para tocar, e o que está esperando o
 * arquivo de áudio. Não é enfeite — misturar as duas coisas numa lista só
 * confunde de verdade quando a mesma música aparece duas vezes, uma tocável
 * e outra não, e a que não toca vem primeiro. O jogador clica, encontra o
 * botão travado e conclui que a música está quebrada.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../store'
import { DIFFICULTIES } from '../../engine/types'
import {
  catalogue,
  importFromDirectoryPicker,
  importFromFileList,
  isPlayable,
  supportsDirectoryPicker,
  type SongEntry,
} from '../../songs/library'
import { SongRow } from './SongRow'
import { mixer } from '../../audio/mixer'
import { useBackToMenu } from '../useBackKey'
import { blockable } from '../blocked'
import { DifficultyPicker, useStepDifficulty } from './DifficultyPicker'
import { useListSelection } from '../useListSelection'
import { previewOf, useSongPreview } from '../useSongPreview'
import { useT } from '../useT'
import { Rich } from '../Rich'

/**
 * Quanto o jogador precisa ficar parado numa música antes de ela tocar.
 *
 * O número existe para separar navegar de escolher. Sem espera, atravessar
 * a lista dispara uma música por linha; com espera demais, quem parou para
 * decidir não recebe a ajuda que o preview é.
 */
const PREVIEW_DELAY = 2000

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function SongsScreen() {
  const {
    library: todas,
    selectedSongId,
    selectSong,
    setScreen,
    addSongs,
    profile,
  } = useGame()
  const difficulty = useGame((s) => s.settings.difficulty)
  const refreshLocalLibrary = useGame((s) => s.refreshLocalLibrary)
  const loadingLibrary = useGame((s) => s.loadingLibrary)
  const t = useT()
  useBackToMenu()

  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)

  // A demo sai da lista quando há biblioteca de verdade.
  const library = useMemo(() => catalogue(todas), [todas])

  const { playableSongs, waitingSongs } = useMemo(() => {
    const byName = (a: SongEntry, b: SongEntry) =>
      a.song.meta.name.localeCompare(b.song.meta.name, 'pt-BR')

    return {
      playableSongs: library.filter(isPlayable).sort(byName),
      waitingSongs: library.filter((entry) => !isPlayable(entry)).sort(byName),
    }
  }, [library])

  const selected = library.find((e) => e.song.meta.id === selectedSongId)
  const available = selected ? DIFFICULTIES.filter((d) => selected.song.charts[d]) : []
  const hasChart = selected?.song.charts[difficulty] !== undefined
  const hasAudio = selected ? isPlayable(selected) : false
  const playable = hasChart && hasAudio

  /**
   * Toca a música da linha `i` — do clique, do Enter ou do controle.
   *
   * Recebe o índice em vez de ler a escolhida: num toque de tela não há
   * passagem do mouse antes do clique, e a loja ainda aponta para a música
   * anterior. A que não tem o nível escolhido fica escolhida, e recusa —
   * é o que faz aparecer, embaixo da lista, quais níveis ela tem.
   */
  const iniciar = useCallback(
    (i: number) => {
      const entry = playableSongs[i]
      if (entry) selectSong(entry.song.meta.id)
      if (!entry?.song.charts[difficulty]) {
        mixer.play('blocked')
        return
      }
      mixer.play('select')
      setScreen('play')
    },
    [playableSongs, difficulty, selectSong, setScreen],
  )

  const stepDifficulty = useStepDifficulty()
  const { index, resting, setIndex, itemProps } = useListSelection({
    count: playableSongs.length,
    restDelay: PREVIEW_DELAY,
    onConfirm: iniciar,
    onSide: stepDifficulty,
  })

  // O destaque é a escolha: o botão de tocar segue o seletor. Quem avisa
  // que mudou é a própria ação da loja de estado, que já toca o som de
  // navegar só quando a música de fato muda.
  useEffect(() => {
    const entry = playableSongs[index]
    if (entry) selectSong(entry.song.meta.id)
  }, [index, playableSongs, selectSong])

  // A lista nasce vazia e vai crescendo enquanto a pasta é varrida. Quando
  // ela aparece, o seletor vai para a música que já estava escolhida — de
  // uma partida anterior, ou da carreira.
  const posicionado = useRef(false)
  useEffect(() => {
    if (posicionado.current || playableSongs.length === 0) return
    posicionado.current = true
    const i = playableSongs.findIndex((e) => e.song.meta.id === selectedSongId)
    if (i > 0) setIndex(i)
  }, [playableSongs, selectedSongId, setIndex])

  /**
   * O preview da música em que o seletor parou.
   *
   * `resting` só aparece quando o seletor completou os dois segundos parado,
   * e volta a ser nulo no instante em que ele se mexe — de tecla, de
   * controle ou de mouse. Não há temporizador aqui: o estado já significa
   * "ficou parado nesta".
   */
  const previewIndex = resting !== null && previewOf(playableSongs[resting]) ? resting : null
  useSongPreview(previewIndex === null ? null : playableSongs[previewIndex])

  const describeImport = (count: number) =>
    count === 0 ? t.songs.noCharts : t.songs.imported(count)

  const handlePicker = async () => {
    try {
      setStatus(t.songs.readingFolder)
      const entries = await importFromDirectoryPicker()
      addSongs(entries)
      setStatus(describeImport(entries.length))
    } catch (error) {
      // Cancelar o seletor cai aqui e não é erro.
      setStatus(error instanceof DOMException ? null : t.songs.folderError)
    }
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setStatus(t.songs.readingFiles)
    const entries = await importFromFileList(files)
    addSongs(entries)
    setStatus(describeImport(entries.length))
  }

  const renderRow = (entry: SongEntry, i = -1) => {
    const { meta } = entry.song
    const record = profile.records[`${meta.id}:${difficulty}`]
    const chart = entry.song.charts[difficulty]
    const waiting = !isPlayable(entry)

    // Os dados de arquivo vão na linha do artista, como no original vai o
    // ano: a folha só tem duas linhas por música, e abrir uma terceira
    // desmancharia o ritmo da lista.
    const detalhes = [
      chart ? t.songs.notes(chart.notes.length) : t.songs.noLevel,
      formatDuration(meta.length),
      entry.synthesized ? t.songs.generated : null,
      entry.format === 'gerada' ? null : entry.format === 'midi' ? '.mid' : '.chart',
      !waiting && entry.tracks.some((track) => track.role === 'guitar') ? t.songs.separateTracks : null,
    ].filter(Boolean)

    return (
      <SongRow
        key={meta.id}
        name={meta.name}
        artist={meta.artist}
        meta={detalhes.join(' · ')}
        stars={record ? record.stars : null}
        score={record ? record.score : null}
        selected={i >= 0 ? i === index : meta.id === selectedSongId}
        previewing={i >= 0 && i === previewIndex}
        nav={i >= 0 ? itemProps(i) : undefined}
        waiting={waiting}
        // O clique inicia, como na carreira. A linha em espera não está no
        // seletor (`i` é −1), e recusa.
        onClick={() => iniciar(i)}
      />
    )
  }


  return (
    <div className="screen screen-paper">
      <header className="screen-head">
        <div>
          <h1 className="screen-title">{t.songs.title}</h1>
          <p className="screen-subtitle">
            <Rich text={t.songs.subtitle} />
          </p>
        </div>
        <DifficultyPicker />
      </header>

      <div className="screen-body">
        {/* O índice vai junto: é ele que liga cada linha ao seletor, e o
            que uma lista de músicas em espera — que não se navega — não
            tem. */}
        <div className="song-list">{playableSongs.map((e, i) => renderRow(e, i))}</div>

        {waitingSongs.length > 0 && (
          <>
            <h2 className="list-heading">
              {t.songs.waitingHeading}
              <span>
                <Rich text={t.songs.waitingNote(waitingSongs.length)} />
              </span>
            </h2>
            <div className="song-list">{waitingSongs.map(renderRow)}</div>
          </>
        )}

        {selected && !hasAudio && (
          <p className="screen-subtitle" style={{ marginTop: 16 }}>
            <b>{selected.song.meta.name}</b> <Rich text={t.songs.noAudio} />
          </p>
        )}

        {selected && hasAudio && available.length > 0 && !hasChart && (
          <p className="screen-subtitle" style={{ marginTop: 16 }}>
            {t.songs.missingLevel(
              t.difficulty[difficulty],
              available.map((d) => t.difficulty[d]).join(', '),
            )}
          </p>
        )}

        {status && (
          <p className="screen-subtitle" style={{ marginTop: 16 }}>
            {status}
          </p>
        )}
      </div>

      <footer className="screen-foot">
        <button className="btn btn-ghost" onClick={() => {
            mixer.play('back')
            setScreen('menu')
          }}>
          {t.common.back}
        </button>

        {/* Na versão hospedada não existe pasta para reler: a biblioteca é
            o índice publicado, e muda por `upload-assets`, não daqui. */}
        {!import.meta.env.VITE_ASSETS_BASE && (
          <button
            className="btn"
            disabled={loadingLibrary}
            onClick={async () => {
              const added = await refreshLocalLibrary()
              setStatus(added > 0 ? t.songs.newSongs(added) : t.songs.nothingNew)
            }}
          >
            {loadingLibrary ? t.songs.rereading : t.songs.reread}
          </button>
        )}

        <button
          className="btn"
          onClick={() => (supportsDirectoryPicker() ? handlePicker() : inputRef.current?.click())}
        >
          {t.songs.importFolder}
        </button>

        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          // `webkitdirectory` não existe nos tipos de React, mas é o que faz
          // o seletor entregar uma árvore de pastas inteira.
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={(e) => void handleFiles(e.target.files)}
        />

        <span style={{ flex: 1 }} />

        <button className="btn btn-primary btn-lg" {...blockable(!playable, () => setScreen('play'))}>
          {t.songs.playOn(t.difficulty[difficulty])}
        </button>
      </footer>
    </div>
  )
}
