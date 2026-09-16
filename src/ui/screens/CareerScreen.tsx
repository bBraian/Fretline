/**
 * Carreira: os tiers do Guitar Hero III, preenchidos pela sua biblioteca.
 *
 * O jogo não traz áudio, então cada faixa aqui é um *lugar* na carreira. Se
 * a música correspondente estiver na biblioteca importada, o lugar fica
 * jogável; se não, aparece como vago, com o nome e o artista — que é
 * exatamente a informação necessária para ir atrás do chart.
 */

import { useMemo } from 'react'
import { useGame } from '../store'
import { SETLISTS, normalizeTitle, type SetlistEntry } from '../../content/setlists'
import { difficultyName } from './MenuScreen'
import { isPlayable, type SongEntry } from '../../songs/library'

interface Slot {
  entry: SetlistEntry
  /** Música da biblioteca que preenche este lugar, se houver. */
  song: SongEntry | null
}

export function CareerScreen() {
  const { library, setScreen, selectSong, profile, settings } = useGame()
  const totalStars = useGame((s) => s.totalStars())

  // Índice por título normalizado: a mesma faixa aparece escrita de formas
  // diferentes entre packs, e comparar texto cru erraria quase sempre.
  const byTitle = useMemo(() => {
    const index = new Map<string, SongEntry>()
    for (const entry of library) {
      index.set(normalizeTitle(entry.song.meta.name), entry)
    }
    return index
  }, [library])

  const tiers = useMemo(
    () =>
      [...SETLISTS]
        .sort((a, b) => a.order - b.order)
        .map((setlist) => ({
          setlist,
          slots: setlist.songs.map<Slot>((entry) => ({
            entry,
            song: byTitle.get(normalizeTitle(entry.title)) ?? null,
          })),
        })),
    [byTitle],
  )

  const missing = tiers.reduce(
    (sum, tier) => sum + tier.slots.filter((slot) => !slot.song).length,
    0,
  )

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1 className="screen-title">Carreira</h1>
          <p className="screen-subtitle">
            Os tiers na ordem original. Cada faixa fica jogável assim que a música
            correspondente estiver na sua biblioteca — o casamento é pelo título, não pelo nome
            da pasta.
          </p>
        </div>
        <div className="menu-stats">
          <div>
            <b>{totalStars}</b>
            estrelas
          </div>
          <div>
            <b>{missing}</b>
            faixas faltando
          </div>
        </div>
      </header>

      <div className="screen-body">
        {tiers.map(({ setlist, slots }) => {
          const locked = totalStars < setlist.unlockAtStars

          return (
            <section key={setlist.id} className="tier" data-locked={locked}>
              <header className="tier-head">
                <span className="tier-order">{setlist.order}</span>
                <span>
                  <strong>{setlist.name}</strong>
                  <span className="song-artist">
                    {locked
                      ? `Abre com ${setlist.unlockAtStars} estrelas`
                      : `${slots.filter((s) => s.song).length} de ${slots.length} disponíveis`}
                  </span>
                </span>
              </header>

              <div className="song-list">
                {slots.map(({ entry, song }) => {
                  const record = song
                    ? profile.records[`${song.song.meta.id}:${settings.difficulty}`]
                    : undefined
                  const playable =
                    !!song && !locked && !!song.song.charts[settings.difficulty] && isPlayable(song)

                  return (
                    <button
                      key={entry.title}
                      className="song-row"
                      disabled={!playable}
                      onClick={() => {
                        if (!song) return
                        selectSong(song.song.meta.id)
                        setScreen('play')
                      }}
                    >
                      <span>
                        <span className="song-name">
                          {entry.title}
                          {entry.encore ? ' · encore' : ''}
                        </span>
                        <br />
                        <span className="song-artist">
                          {entry.artist} · {entry.year}
                        </span>
                      </span>
                      <span className="song-meta">
                        {!song
                          ? 'não importada'
                          : !isPlayable(song)
                            ? 'sem áudio'
                            : song.song.charts[settings.difficulty]
                              ? `${song.song.charts[settings.difficulty]!.notes.length} notas`
                              : `sem ${difficultyName(settings.difficulty)}`}
                      </span>
                      <span className="song-meta">
                        {record ? '★'.repeat(record.stars) : '—'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}

        {missing > 0 && (
          <p className="empty" style={{ marginTop: 24 }}>
            As faixas marcadas como não importadas ainda não estão na sua biblioteca. Importe a
            pasta delas em <b>Tocar → Importar pasta de músicas</b> e elas assumem o lugar
            sozinhas.
          </p>
        )}
      </div>

      <footer className="screen-foot">
        <button className="btn btn-ghost" onClick={() => setScreen('menu')}>
          ← Voltar
        </button>
        <button className="btn" onClick={() => setScreen('songs')}>
          Ver a biblioteca inteira
        </button>
      </footer>
    </div>
  )
}
