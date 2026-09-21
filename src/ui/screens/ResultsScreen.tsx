/**
 * Tela de resultado.
 */

import { useGame } from '../store'
import { starLabel } from '../../content/progression'
import { difficultyName } from './MenuScreen'
import { Backdrop } from '../Backdrop'

export function ResultsScreen() {
  const { lastPerformance, setScreen, selectedSongId, library, settings } = useGame()
  const entry = library.find((e) => e.song.meta.id === selectedSongId)

  if (!lastPerformance) {
    setScreen('menu')
    return null
  }

  const p = lastPerformance

  return (
    <div className="screen">
      <Backdrop variant="content" />
      <header className="screen-head">
        <div>
          <h1 className="screen-title">{p.failed ? 'A plateia foi embora' : starLabel(p.stars)}</h1>
          <p className="screen-subtitle">
            {entry?.song.meta.name} · {entry?.song.meta.artist} ·{' '}
            {difficultyName(settings.difficulty)}
          </p>
        </div>
      </header>

      <div className="screen-body">
        <div className="stars" aria-label={`${p.stars} de 6 estrelas`}>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={i < p.stars ? '' : 'off'}>
              ★
            </span>
          ))}
        </div>

        <div className="results-grid" style={{ marginTop: 22 }}>
          <div className="result-stat">
            <b>{p.score.toLocaleString('pt-BR')}</b>
            <span>Pontos</span>
          </div>
          <div className="result-stat">
            <b>{Math.round(p.accuracy * 100)}%</b>
            <span>Notas acertadas</span>
          </div>
          <div className="result-stat">
            <b>{p.longestStreak}</b>
            <span>Maior corrente</span>
          </div>
          <div className="result-stat">
            <b>${p.money.toLocaleString('pt-BR')}</b>
            <span>Cachê</span>
          </div>
        </div>

        {p.fullCombo && (
          <p className="screen-subtitle" style={{ marginTop: 18 }}>
            Música inteira sem errar uma nota.
          </p>
        )}
      </div>

      <footer className="screen-foot">
        <button className="btn btn-ghost" onClick={() => setScreen('menu')}>
          Menu
        </button>
        <button className="btn" onClick={() => setScreen('songs')}>
          Outra música
        </button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => setScreen('play')}>
          Tocar de novo
        </button>
      </footer>
    </div>
  )
}
