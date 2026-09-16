/**
 * Seleção de música e importação da biblioteca do jogador.
 */

import { useRef, useState } from 'react'
import { useGame } from '../store'
import { difficultyName } from './MenuScreen'
import { DIFFICULTIES } from '../../engine/types'
import {
  importFromDirectoryPicker,
  importFromFileList,
  isPlayable,
  supportsDirectoryPicker,
} from '../../songs/library'

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function SongsScreen() {
  const { library, selectedSongId, selectSong, setScreen, addSongs, profile } = useGame()
  const difficulty = useGame((s) => s.settings.difficulty)
  const updateSettings = useGame((s) => s.updateSettings)

  const refreshLocalLibrary = useGame((s) => s.refreshLocalLibrary)
  const loadingLibrary = useGame((s) => s.loadingLibrary)

  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)

  const selected = library.find((e) => e.song.meta.id === selectedSongId)
  const available = selected ? DIFFICULTIES.filter((d) => selected.song.charts[d]) : []
  const hasChart = selected?.song.charts[difficulty] !== undefined
  const hasAudio = selected ? isPlayable(selected) : false
  const playable = hasChart && hasAudio

  const handlePicker = async () => {
    try {
      setStatus('Lendo a pasta…')
      const entries = await importFromDirectoryPicker()
      addSongs(entries)
      setStatus(
        entries.length > 0
          ? `${entries.length} música${entries.length === 1 ? '' : 's'} importada${entries.length === 1 ? '' : 's'}.`
          : 'Nenhum .chart encontrado nessa pasta.',
      )
    } catch (error) {
      // Cancelar o seletor cai aqui e não é erro.
      setStatus(error instanceof DOMException ? null : 'Não consegui ler essa pasta.')
    }
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setStatus('Lendo os arquivos…')
    const entries = await importFromFileList(files)
    addSongs(entries)
    setStatus(
      entries.length > 0
        ? `${entries.length} música${entries.length === 1 ? '' : 's'} importada${entries.length === 1 ? '' : 's'}.`
        : 'Nenhum .chart encontrado nesses arquivos.',
    )
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1 className="screen-title">Escolha a música</h1>
          <p className="screen-subtitle">
            Uma pasta por música, com o chart e o áudio dentro — o mesmo arranjo do Clone Hero.
            Largue as pastas em <code>songs/</code> dentro do projeto e elas entram sozinhas.
            Os arquivos ficam no seu computador.
          </p>
        </div>
        <div className="segmented">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              data-active={difficulty === d}
              onClick={() => updateSettings({ difficulty: d })}
            >
              {difficultyName(d)}
            </button>
          ))}
        </div>
      </header>

      <div className="screen-body">
        <div className="song-list">
          {library.map((entry) => {
            const { meta } = entry.song
            const record = profile.records[`${meta.id}:${difficulty}`]
            const has = entry.song.charts[difficulty] !== undefined

            return (
              <button
                key={meta.id}
                className="song-row"
                data-selected={meta.id === selectedSongId}
                onClick={() => selectSong(meta.id)}
              >
                <span>
                  <span className="song-name">{meta.name}</span>
                  <br />
                  <span className="song-artist">
                    {meta.artist}
                    {entry.synthesized ? ' · faixa gerada pelo jogo' : ''}
                  </span>
                </span>
                <span className="song-meta">
                  {has ? `${entry.song.charts[difficulty]!.notes.length} notas` : 'sem este nível'}
                  <br />
                  {formatDuration(meta.length)}
                  {/* O que foi detectado na importação: explica por que uma
                      música não abafa a guitarra no erro, ou veio sem nome. */}
                  {entry.format !== 'gerada' && (
                    <>
                      {` · ${entry.format === 'midi' ? '.mid' : '.chart'}`}
                      {!isPlayable(entry)
                        ? ' · sem áudio'
                        : entry.tracks.some((t) => t.role === 'guitar')
                          ? ' · faixas separadas'
                          : ''}
                    </>
                  )}
                </span>
                <span className="song-meta">
                  {record ? `${record.score.toLocaleString('pt-BR')}` : '—'}
                  <br />
                  {record ? `${'★'.repeat(record.stars)}` : ''}
                </span>
              </button>
            )
          })}
        </div>

        {selected && !hasAudio && (
          <p className="screen-subtitle" style={{ marginTop: 16 }}>
            Essa pasta tem o chart, mas nenhum arquivo de áudio. Coloque o áudio dentro dela como{' '}
            <code>song.ogg</code> — ou use <code>tools/gh3/place-audio.mjs</code> para preencher
            várias de uma vez.
          </p>
        )}

        {selected && hasAudio && available.length > 0 && !hasChart && (
          <p className="screen-subtitle" style={{ marginTop: 16 }}>
            Essa música não tem o nível {difficultyName(difficulty)}. Disponíveis:{' '}
            {available.map(difficultyName).join(', ')}.
          </p>
        )}

        {status && (
          <p className="screen-subtitle" style={{ marginTop: 16 }}>
            {status}
          </p>
        )}
      </div>

      <footer className="screen-foot">
        <button className="btn btn-ghost" onClick={() => setScreen('menu')}>
          ← Voltar
        </button>

        <button
          className="btn"
          disabled={loadingLibrary}
          onClick={async () => {
            const added = await refreshLocalLibrary()
            setStatus(
              added > 0
                ? `${added} música${added === 1 ? '' : 's'} nova${added === 1 ? '' : 's'} na pasta songs/.`
                : 'Nada novo na pasta songs/.',
            )
          }}
        >
          {loadingLibrary ? 'Lendo songs/…' : 'Reler a pasta songs/'}
        </button>

        {supportsDirectoryPicker() ? (
          <button className="btn" onClick={handlePicker}>
            Importar pasta de músicas
          </button>
        ) : (
          <button className="btn" onClick={() => inputRef.current?.click()}>
            Importar pasta de músicas
          </button>
        )}

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

        <button
          className="btn btn-primary btn-lg"
          disabled={!playable}
          onClick={() => setScreen('play')}
        >
          Tocar em {difficultyName(difficulty)}
        </button>
      </footer>
    </div>
  )
}
