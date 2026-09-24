/**
 * Tela de resultado.
 */

import { useGame } from '../store'
import { Backdrop } from '../Backdrop'
import { mixer } from '../../audio/mixer'
import { useBackToMenu } from '../useBackKey'
import { useT } from '../useT'

export function ResultsScreen() {
  const { lastPerformance, setScreen, selectedSongId, library, settings } = useGame()
  const entry = library.find((e) => e.song.meta.id === selectedSongId)
  const t = useT()
  useBackToMenu()

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
          <h1 className="screen-title">{p.failed ? t.results.booed : t.results.verdict(p.stars)}</h1>
          <p className="screen-subtitle">
            {entry?.song.meta.name} · {entry?.song.meta.artist} ·{' '}
            {t.difficulty[settings.difficulty]}
          </p>
        </div>
      </header>

      <div className="screen-body">
        <div className="stars" aria-label={t.results.starsOf(p.stars)}>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={i < p.stars ? '' : 'off'}>
              ★
            </span>
          ))}
        </div>

        <div className="results-grid" style={{ marginTop: 22 }}>
          <div className="result-stat">
            <b>{t.number(p.score)}</b>
            <span>{t.results.score}</span>
          </div>
          <div className="result-stat">
            <b>{Math.round(p.accuracy * 100)}%</b>
            <span>{t.results.accuracy}</span>
          </div>
          <div className="result-stat">
            <b>{p.longestStreak}</b>
            <span>{t.results.streak}</span>
          </div>
          <div className="result-stat">
            <b>{t.money(p.money)}</b>
            <span>{t.results.money}</span>
          </div>
        </div>

        {p.fullCombo && (
          <p className="screen-subtitle" style={{ marginTop: 18 }}>
            {t.results.fullCombo}
          </p>
        )}
      </div>

      <footer className="screen-foot">
        <button className="btn btn-ghost" onClick={() => {
            mixer.play('back')
            setScreen('menu')
          }}>
          {t.results.menu}
        </button>
        <button className="btn" onClick={() => setScreen('songs')}>
          {t.results.anotherSong}
        </button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => setScreen('play')}>
          {t.results.playAgain}
        </button>
      </footer>
    </div>
  )
}
