/**
 * Loja de guitarras, com o modelo 3D em exibição.
 *
 * Uma prévia só, grande, em vez de uma miniatura por cartão: é o que o
 * limite de contextos WebGL do navegador permite (ver `render/preview.ts`),
 * e também o que faz sentido para um objeto cuja graça está na silhueta.
 */

import { useEffect, useRef } from 'react'
import { owns, useGame } from '../store'
import { ShopActions, ShopTag } from './ShopActions'
import { GUITARS, SHAPE_NAMES, guitarById } from '../../content/guitars'
import { buildGuitar } from '../../render/guitar/guitarModel'
import { ModelPreview } from '../../render/preview'
import { Backdrop } from '../Backdrop'

function hex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function GuitarsScreen() {
  const { profile, setScreen, chooseGuitar, buyGuitar, previewGuitar } = useGame()
  const totalStars = useGame((s) => s.totalStars())
  const previewId = useGame((s) => s.previewGuitarId)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<ModelPreview | null>(null)

  // O visor mostra o que está selecionado na lista, que começa no que está
  // equipado. Olhar não troca nada: equipar é um botão à parte.
  const shownId = previewId ?? profile.guitarId

  useEffect(() => {
    if (!canvasRef.current) return
    const preview = new ModelPreview({ canvas: canvasRef.current, entry: 'dolly' })
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
      <Backdrop variant="content" />
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
              <p>{shown.brandless}</p>
            </div>

            <ShopActions
              owned={owns(profile.ownedGuitars, shown.id)}
              equipped={profile.guitarId === shown.id}
              unlocked={totalStars >= shown.unlockAtStars}
              price={shown.price}
              unlockAtStars={shown.unlockAtStars}
              money={profile.money}
              onBuy={() => buyGuitar(shown.id)}
              onEquip={() => chooseGuitar(shown.id)}
            />
          </div>

          <div className="picker-list">
            {GUITARS.map((guitar) => {
              const owned = owns(profile.ownedGuitars, guitar.id)

              return (
                <button
                  key={guitar.id}
                  className="picker-row"
                  data-selected={guitar.id === shownId}
                  data-owned={owned}
                  onClick={() => previewGuitar(guitar.id)}
                >
                  <span className="picker-chip" style={{ background: hex(guitar.colors.body) }} />
                  <span>
                    <strong>{guitar.name}</strong>
                    <span>{SHAPE_NAMES[guitar.shape]}</span>
                  </span>
                  <span>
                    <ShopTag
                      owned={owned}
                      equipped={profile.guitarId === guitar.id}
                      unlocked={totalStars >= guitar.unlockAtStars}
                      price={guitar.price}
                      unlockAtStars={guitar.unlockAtStars}
                      money={profile.money}
                    />
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
          Clique em qualquer guitarra para vê-la de perto. Comprar e equipar são os botões no
          visor.
        </span>
      </footer>
    </div>
  )
}
