/**
 * Elenco: escolher quem toca, e comprar quem ainda não é seu.
 */

import { useGame } from '../store'
import { CHARACTERS } from '../../content/characters'

function hex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function CharactersScreen() {
  const { profile, setScreen, chooseCharacter, buyCharacter } = useGame()
  const totalStars = useGame((s) => s.totalStars())

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1 className="screen-title">Quem sobe no palco</h1>
          <p className="screen-subtitle">
            Personagens novos abrem por estrelas e são comprados com o dinheiro dos shows.
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
        <div className="card-grid">
          {CHARACTERS.map((character) => {
            const owned = profile.ownedCharacters.includes(character.id)
            const unlocked = totalStars >= character.unlockAtStars
            const affordable = profile.money >= character.price
            const selected = profile.characterId === character.id

            return (
              <button
                key={character.id}
                className="card"
                data-selected={selected}
                data-locked={!owned && !unlocked}
                onClick={() => (owned ? chooseCharacter(character.id) : buyCharacter(character.id))}
                disabled={!owned && (!unlocked || !affordable)}
              >
                <span className="card-name">{character.name}</span>
                <span className="card-sub">{character.subtitle}</span>

                <div className="swatches">
                  {[character.colors.shirt, character.colors.pants, character.colors.hair, character.colors.accent].map(
                    (color, i) => (
                      <span key={i} className="swatch" style={{ background: hex(color) }} />
                    ),
                  )}
                </div>

                <span style={{ marginTop: 'auto', paddingTop: 10 }}>
                  {owned ? (
                    <span className={`tag ${selected ? 'tag-own' : ''}`}>
                      {selected ? 'No palco' : 'Liberado'}
                    </span>
                  ) : !unlocked ? (
                    <span className="tag tag-locked">{character.unlockAtStars} estrelas</span>
                  ) : (
                    <span className="tag">
                      ${character.price.toLocaleString('pt-BR')}
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
