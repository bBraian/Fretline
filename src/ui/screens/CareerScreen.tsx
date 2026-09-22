/**
 * Carreira: os tiers preenchidos pela sua biblioteca.
 *
 * Nada aqui é uma lista fixa. As músicas entram nos tiers sozinhas, da mais
 * fácil para a mais difícil, e só entra o que dá para tocar — chart mais
 * áudio. Um chart sem áudio continua visível na biblioteca, como lembrete do
 * que falta, mas não vira etapa de carreira.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useGame } from '../store'
import { buildCareer } from '../../content/setlists'
import { difficultyName } from './MenuScreen'
import { catalogue, isPlayable } from '../../songs/library'
import { SongRow } from './SongRow'
import { DifficultyPicker } from './DifficultyPicker'
import { useListSelection } from '../useListSelection'
import { previewOf, useSongPreview } from '../useSongPreview'

/** O mesmo descanso da lista de músicas; a espera não muda de tela. */
const PREVIEW_DELAY = 2000
import { mixer } from '../../audio/mixer'

export function CareerScreen() {
  const {
    library: todas,
    setScreen,
    selectSong,
    selectedSongId,
    profile,
    settings,
  } = useGame()
  const totalStars = useGame((s) => s.totalStars())

  // A demo não é etapa de carreira quando existe biblioteca de verdade.
  const library = useMemo(() => catalogue(todas), [todas])
  const tiers = useMemo(() => buildCareer(library), [library])

  const waiting = library.filter((entry) => !isPlayable(entry)).length
  const total = tiers.reduce((sum, tier) => sum + tier.songs.length, 0)

  /**
   * As músicas que o seletor percorre, achatadas em uma lista só.
   *
   * A carreira desenha tiers, mas navegar por tiers seria navegar por uma
   * divisão que existe para ler, não para andar: a seta para baixo na
   * última música de um tier tem de cair na primeira do seguinte. O que não
   * entra é o que não se pode tocar — tier trancado, ou música sem chart na
   * dificuldade escolhida.
   */
  const navegaveis = useMemo(() => {
    const lista: Array<{ id: string; entry: (typeof tiers)[number]['songs'][number]['entry'] }> = []
    for (const tier of tiers) {
      if (totalStars < tier.unlockAtStars) continue
      for (const { entry } of tier.songs) {
        if (!entry.song.charts[settings.difficulty]) continue
        lista.push({ id: entry.song.meta.id, entry })
      }
    }
    return lista
  }, [tiers, totalStars, settings.difficulty])

  const iniciar = useCallback(
    (i: number) => {
      const alvo = navegaveis[i]
      if (!alvo) return
      mixer.play('select')
      selectSong(alvo.id)
      setScreen('play')
    },
    [navegaveis, selectSong, setScreen],
  )

  const { index, resting, setIndex, itemProps } = useListSelection({
    count: navegaveis.length,
    restDelay: PREVIEW_DELAY,
    onConfirm: iniciar,
  })

  // O destaque é a escolha, como na lista de músicas.
  useEffect(() => {
    const alvo = navegaveis[index]
    if (alvo) selectSong(alvo.id)
  }, [index, navegaveis, selectSong])

  // A carreira nasce vazia enquanto a pasta é varrida; quando ela aparece,
  // o seletor vai para a música que já estava escolhida.
  const posicionado = useRef(false)
  useEffect(() => {
    if (posicionado.current || navegaveis.length === 0) return
    posicionado.current = true
    const i = navegaveis.findIndex((n) => n.id === selectedSongId)
    if (i > 0) setIndex(i)
  }, [navegaveis, selectedSongId, setIndex])

  const previewIndex =
    resting !== null && previewOf(navegaveis[resting]?.entry) ? resting : null
  useSongPreview(previewIndex === null ? null : navegaveis[previewIndex].entry)

  /** Onde esta música está na lista que o seletor percorre. */
  const posicaoDe = (id: string) => navegaveis.findIndex((n) => n.id === id)

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
        <DifficultyPicker />
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
                  const i = playable ? posicaoDe(meta.id) : -1

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
                      selected={i >= 0 && i === index}
                      previewing={i >= 0 && i === previewIndex}
                      nav={i >= 0 ? itemProps(i) : undefined}
                      // Aqui o clique inicia, como sempre iniciou: a
                      // carreira não tem botão de tocar à parte. Escolher
                      // sem iniciar é o que o seletor passou a permitir.
                      onClick={() => iniciar(i)}
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
