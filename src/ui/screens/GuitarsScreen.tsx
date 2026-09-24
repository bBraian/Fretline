/**
 * Loja de guitarras, com o modelo 3D em exibição.
 *
 * Uma prévia só, grande, em vez de uma miniatura por cartão: é o que o
 * limite de contextos WebGL do navegador permite (ver `render/preview.ts`),
 * e também o que faz sentido para um objeto cuja graça está na silhueta.
 */

import { useEffect, useRef, useState } from 'react'
import { owns, useGame } from '../store'
import { ShopActions, ShopTag } from './ShopActions'
import { GUITARS, guitarById } from '../../content/guitars'
import { loadGuitarGlb } from '../../render/guitar/guitarGlb'
import { buildGuitar } from '../../render/guitar/guitarModel'
import { ModelPreview } from '../../render/preview'
import { Backdrop } from '../Backdrop'
import { mixer } from '../../audio/mixer'
import { useBackToMenu } from '../useBackKey'
import { useT } from '../useT'

function hex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function GuitarsScreen() {
  const { profile, setScreen, chooseGuitar, buyGuitar, previewGuitar } = useGame()
  const totalStars = useGame((s) => s.totalStars())
  const previewId = useGame((s) => s.previewGuitarId)
  const t = useT()
  useBackToMenu()

  /** A guitarra ainda não está pronta na tela; o véu cobre o visor. */
  const [loading, setLoading] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<ModelPreview | null>(null)

  // O visor mostra o que está selecionado na lista, que começa no que está
  // equipado. Olhar não troca nada: equipar é um botão à parte.
  const shownId = previewId ?? profile.guitarId

  useEffect(() => {
    if (!canvasRef.current) return
    const preview = new ModelPreview({
      canvas: canvasRef.current,
      entry: 'dolly',
      // Folga em volta: no padrão, o enquadramento encostava nas bordas e a
      // ponta do headstock saía do quadro.
      fit: 1.05,
    })
    previewRef.current = preview
    return () => {
      preview.dispose()
      previewRef.current = null
    }
  }, [])

  // Todas no mesmo enquadramento: de frente, braço para cima, inclinadas um
  // pouco para a direita.
  //
  // Sem giro em Y — a pose antiga tinha 0,34 rad, quase vinte graus, e
  // punha cada guitarra num ângulo diferente conforme a espessura do corpo.
  // O tampo é a face que interessa, e é onde ficam captadores, escudo e
  // controles.
  const POSE: [number, number, number] = [0, 0, -0.1]

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    const guitar = guitarById(shownId)
    setLoading(true)

    // Guitarra de arquivo chega depois, e o jogador pode ter trocado de item
    // nesse meio-tempo. `cancelado` é o que impede um carregamento antigo de
    // aparecer por cima de um mais novo — sem ele, clicar rápido na lista
    // mostra a guitarra errada.
    let cancelado = false
    const pronta = guitar.model
      ? loadGuitarGlb(guitar.model, guitar, guitar.modelAdjust).catch((erro) => {
          console.error(`não deu para carregar ${guitar.model}`, erro)
          // Melhor a construída em código que um visor coberto para sempre.
          return buildGuitar(guitar)
        })
      : Promise.resolve(buildGuitar(guitar))

    void pronta.then(async (model) => {
      if (cancelado) {
        model.dispose()
        return
      }
      model.group.rotation.set(...POSE)
      // Preparada antes de entrar: ver `ModelPreview.present`.
      const mostrada = await preview.present(model.group, model.dispose)
      if (mostrada && !cancelado) setLoading(false)
    })

    return () => {
      cancelado = true
      preview.cancelPending()
    }
  }, [shownId])

  const shown = guitarById(shownId)

  return (
    <div className="screen">
      <Backdrop variant="content" />
      <header className="screen-head">
        <div>
          <h1 className="screen-title">{t.guitars.title}</h1>
          <p className="screen-subtitle">{t.guitars.subtitle}</p>
        </div>
        <div className="menu-stats">
          <div>
            <b>{t.money(profile.money)}</b>
            {t.common.inPocket}
          </div>
          <div>
            <b>{totalStars}</b>
            {t.starsWord(totalStars)}
          </div>
        </div>
      </header>

      <div className="screen-body">
        <div className="picker">
          <div className="picker-stage">
            <canvas ref={canvasRef} />
            {/* O mesmo véu da tela de personagens: cobre na hora, sai devagar. */}
            <div className="picker-loading" data-hidden={!loading} aria-hidden={!loading}>
              <b>{t.common.loading}</b>
              <div className="loading-bar">
                <i />
              </div>
            </div>
            {!loading && <span className="picker-hint">{t.common.dragToRotate}</span>}
            <div className="picker-caption">
              <h2>{shown.name}</h2>
              <p>{shown.brandless[t.language]}</p>
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
                    <span>{t.shapes[guitar.shape]}</span>
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
        <button className="btn btn-ghost" onClick={() => {
            mixer.play('back')
            setScreen('menu')
          }}>
          {t.common.back}
        </button>
        <span className="screen-subtitle">{t.guitars.footer}</span>
      </footer>
    </div>
  )
}
