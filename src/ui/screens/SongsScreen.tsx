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

  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)

  const selected = library.find((e) => e.song.meta.id === selectedSongId)
  const available = selected ? DIFFICULTIES.filter((d) => selected.song.charts[d]) : []
  const playable = selected?.song.charts[difficulty] !== undefined

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
            Uma pasta por música, com o .chart e o áudio dentro — o mesmo arranjo do Clone Hero.
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

        {selected && available.length > 0 && !playable && (
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
