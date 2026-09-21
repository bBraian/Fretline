/**
 * Carreira: os tiers preenchidos pela sua biblioteca.
 *
 * Nada aqui é uma lista fixa. As músicas entram nos tiers sozinhas, da mais
 * fácil para a mais difícil, e só entra o que dá para tocar — chart mais
 * áudio. Um chart sem áudio continua visível na biblioteca, como lembrete do
 * que falta, mas não vira etapa de carreira.
 */

import { useMemo } from 'react'
import { useGame } from '../store'
import { buildCareer } from '../../content/setlists'
import { difficultyName } from './MenuScreen'
import { isPlayable } from '../../songs/library'
import { SongRow } from './SongRow'
import { mixer } from '../../audio/mixer'

export function CareerScreen() {
  const { library, setScreen, selectSong, profile, settings } = useGame()
  const totalStars = useGame((s) => s.totalStars())

  const tiers = useMemo(() => buildCareer(library), [library])

  const waiting = library.filter((entry) => !isPlayable(entry)).length
  const total = tiers.reduce((sum, tier) => sum + tier.songs.length, 0)

  return (
    <div className="screen screen-paper">
      <header className="screen-head">
        <div>
          <h1 className="screen-title">Carreira</h1>
          <p className="screen-subtitle">
            As músicas da sua biblioteca, da mais fácil para a mais difícil. Cada pack novo entra
            sozinho no tier que couber.
          </p>
        </div>
        <div className="menu-stats">
          <div>
            <b>{totalStars}</b>
            estrelas
          </div>
          <div>
            <b>{total}</b>
            músicas
          </div>
        </div>
      </header>

      <div className="screen-body">
        {tiers.length === 0 && (
          <p className="empty">
            Nenhuma música tocável ainda. Coloque as pastas em <code>songs/</code> — cada uma com o
            chart e o áudio dentro — e elas aparecem aqui.
          </p>
        )}

        {tiers.map((tier) => {
          const locked = totalStars < tier.unlockAtStars

          return (
            <section key={tier.id} className="tier" data-locked={locked}>
              <header className="tier-head">
                <span className="tier-order">{tier.order}</span>
                <span>
                  <strong>{tier.name}</strong>
                  <span className="song-artist">
                    {locked
                      ? `Abre com ${tier.unlockAtStars} estrelas`
                      : `${tier.songs.length} música${tier.songs.length === 1 ? '' : 's'}`}
                  </span>
                </span>
              </header>

              <div className="song-list">
                {tier.songs.map(({ entry, encore }) => {
                  const { meta } = entry.song
                  const record = profile.records[`${meta.id}:${settings.difficulty}`]
                  const chart = entry.song.charts[settings.difficulty]
                  const playable = !locked && !!chart

                  return (
                    <SongRow
                      key={meta.id}
                      name={meta.name + (encore ? ' · encore' : '')}
                      artist={meta.artist + (meta.year ? `, ${meta.year}` : '')}
                      meta={
                        chart
                          ? `${chart.notes.length} notas`
                          : `sem ${difficultyName(settings.difficulty)}`
                      }
                      stars={record ? record.stars : null}
                      score={record ? record.score : null}
                      disabled={!playable}
                      onClick={() => {
                        selectSong(meta.id)
                        setScreen('play')
                      }}
                    />
                  )
                })}
              </div>
            </section>
          )
        })}

        {waiting > 0 && (
          <p className="empty" style={{ marginTop: 24 }}>
            {waiting} pasta{waiting === 1 ? '' : 's'} com chart mas sem áudio, esperando o arquivo.
            Elas aparecem na biblioteca, não na carreira.
          </p>
        )}
      </div>

      <footer className="screen-foot">
        <button className="btn btn-ghost" onClick={() => {
            mixer.play('back')
            setScreen('menu')
          }}>
          ← Voltar
        </button>
        <button className="btn" onClick={() => setScreen('songs')}>
          Ver a biblioteca inteira
        </button>
      </footer>
    </div>
  )
}
