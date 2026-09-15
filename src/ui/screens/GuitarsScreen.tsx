/**
 * Loja de guitarras.
 */

import { useGame } from '../store'
import { GUITARS } from '../../content/guitars'

const SHAPE_NAMES: Record<string, string> = {
  'single-cut': 'Recorte simples',
  'double-cut': 'Recorte duplo',
  offset: 'Corpo deslocado',
  v: 'Formato V',
  explorer: 'Angular',
}

function hex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function GuitarsScreen() {
  const { profile, setScreen, chooseGuitar, buyGuitar } = useGame()
  const totalStars = useGame((s) => s.totalStars())

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
        </div>
      </header>

      <div className="screen-body">
        <div className="card-grid">
          {GUITARS.map((guitar) => {
            const owned = profile.ownedGuitars.includes(guitar.id)
            const unlocked = totalStars >= guitar.unlockAtStars
            const affordable = profile.money >= guitar.price
            const selected = profile.guitarId === guitar.id

            return (
              <button
                key={guitar.id}
                className="card"
                data-selected={selected}
                data-locked={!owned && !unlocked}
                onClick={() => (owned ? chooseGuitar(guitar.id) : buyGuitar(guitar.id))}
                disabled={!owned && (!unlocked || !affordable)}
              >
                <span className="card-name">{guitar.name}</span>
                <span className="card-sub">{guitar.brandless}</span>
                <span className="card-sub">{SHAPE_NAMES[guitar.shape]}</span>

                <div className="swatches">
                  {[guitar.colors.body, guitar.colors.neck, guitar.colors.hardware, guitar.colors.pickguard].map(
                    (color, i) => (
                      <span key={i} className="swatch" style={{ background: hex(color) }} />
                    ),
                  )}
                </div>

                <span style={{ marginTop: 'auto', paddingTop: 10 }}>
                  {owned ? (
                    <span className={`tag ${selected ? 'tag-own' : ''}`}>
                      {selected ? 'Em uso' : 'Liberada'}
                    </span>
                  ) : !unlocked ? (
                    <span className="tag tag-locked">{guitar.unlockAtStars} estrelas</span>
                  ) : (
                    <span className="tag">
                      ${guitar.price.toLocaleString('pt-BR')}
                      {affordable ? '' : ' · falta dinheiro'}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <footer className="screen-foot">
        <button className="btn btn-ghost" onClick={() => setScreen('menu')}>
          ← Voltar
        </button>
      </footer>
    </div>
  )
}
