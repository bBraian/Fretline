/**
 * Loja de guitarras, com o modelo 3D em exibição.
 *
 * Uma prévia só, grande, em vez de uma miniatura por cartão: é o que o
 * limite de contextos WebGL do navegador permite (ver `render/preview.ts`),
 * e também o que faz sentido para um objeto cuja graça está na silhueta.
 */

import { useEffect, useRef } from 'react'
import { owns, useGame } from '../store'
import { GUITARS, SHAPE_NAMES, guitarById } from '../../content/guitars'
import { buildGuitar } from '../../render/guitar/guitarModel'
import { ModelPreview } from '../../render/preview'

function hex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function GuitarsScreen() {
  const { profile, setScreen, chooseGuitar, buyGuitar } = useGame()
  const totalStars = useGame((s) => s.totalStars())

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<ModelPreview | null>(null)

  // O visor fica em exibição pelo que estiver em uso; comprar ou escolher
  // outra troca o modelo no lugar, sem recriar o contexto WebGL.
  const shownId = profile.guitarId

  useEffect(() => {
    if (!canvasRef.current) return
    const preview = new ModelPreview({ canvas: canvasRef.current, spin: 0.18 })
    previewRef.current = preview
    return () => {
      preview.dispose()
      previewRef.current = null
    }
  }, [])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    const model = buildGuitar(guitarById(shownId))
    // De frente e levemente inclinada. O tampo é a face interessante: é
    // onde ficam captadores, escudo e controles.
    model.group.rotation.set(0.1, 0.34, 0.1)
    preview.setModel(model.group, model.dispose)
  }, [shownId])

  const shown = guitarById(shownId)

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1 className="screen-title">A guitarra</h1>
          <p className="screen-subtitle">
            Só muda o que você vê — nenhuma delas toca melhor que a outra.
          </p>
        </div>
        <div className="menu-stats">
          <div>
            <b>${profile.money.toLocaleString('pt-BR')}</b>
            no bolso
          </div>
          <div>
            <b>{totalStars}</b>
            estrelas
          </div>
        </div>
      </header>

      <div className="screen-body">
        <div className="picker">
          <div className="picker-stage">
            <canvas ref={canvasRef} />
            <span className="picker-hint">arraste para girar</span>
            <div className="picker-caption">
              <h2>{shown.name}</h2>
              <p>
                {SHAPE_NAMES[shown.shape]} · {shown.brandless}
              </p>
            </div>
          </div>

          <div className="picker-list">
            {GUITARS.map((guitar) => {
              const owned = owns(profile.ownedGuitars, guitar.id)
              const unlocked = totalStars >= guitar.unlockAtStars
              const affordable = profile.money >= guitar.price
              const selected = profile.guitarId === guitar.id

              return (
                <button
                  key={guitar.id}
                  className="picker-row"
                  data-selected={selected}
                  disabled={!owned && (!unlocked || !affordable)}
                  onClick={() => (owned ? chooseGuitar(guitar.id) : buyGuitar(guitar.id))}
                >
                  <span className="picker-chip" style={{ background: hex(guitar.colors.body) }} />
                  <span>
                    <strong>{guitar.name}</strong>
                    <span>{SHAPE_NAMES[guitar.shape]}</span>
                  </span>
                  <span>
                    {owned ? (
                      <span className={`tag ${selected ? 'tag-own' : ''}`}>
                        {selected ? 'Em uso' : 'Sua'}
                      </span>
                    ) : !unlocked ? (
                      <span className="tag tag-locked">{guitar.unlockAtStars} ★</span>
                    ) : (
                      <span className="tag">${guitar.price.toLocaleString('pt-BR')}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <footer className="screen-foot">
        <button className="btn btn-ghost" onClick={() => setScreen('menu')}>
          ← Voltar
        </button>
        <span className="screen-subtitle">
          Clique numa guitarra liberada para usá-la, ou numa bloqueada para comprar.
        </span>
      </footer>
    </div>
  )
}
