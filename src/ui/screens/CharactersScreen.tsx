/**
 * Elenco: escolher quem toca, e comprar quem ainda não é seu.
 *
 * A prévia mostra o personagem animado, não parado — a pose de repouso não
 * diz nada sobre alguém que vai passar a música inteira se mexendo, e é a
 * animação que revela se as proporções e as articulações funcionam.
 */

import { useEffect, useRef } from 'react'
import { owns, useGame } from '../store'
import { BUILD_NAMES, CHARACTERS, characterById } from '../../content/characters'
import { CharacterModel, GUITAR_BODY_OFFSET, GUITAR_TILT } from '../../render/character/characterModel'
import { buildGuitar } from '../../render/guitar/guitarModel'
import { guitarById } from '../../content/guitars'
import { ModelPreview } from '../../render/preview'

function hex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function CharactersScreen() {
  const { profile, setScreen, chooseCharacter, buyCharacter } = useGame()
  const totalStars = useGame((s) => s.totalStars())

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<ModelPreview | null>(null)
  const modelRef = useRef<CharacterModel | null>(null)

  const shownId = profile.characterId
  const guitarId = profile.guitarId

  useEffect(() => {
    if (!canvasRef.current) return
    const preview = new ModelPreview({ canvas: canvasRef.current, spin: 0.14, fit: 1.02 })
    previewRef.current = preview

    // O personagem continua tocando no visor; o relógio vem do próprio
    // laço da prévia, já que não há música por trás.
    let frame = 0
    let last = performance.now()
    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      // 100 BPM de mentirinha, só para a pose ter pulso.
      modelRef.current?.update(dt, ((now / 600) % 1))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      preview.dispose()
      previewRef.current = null
      modelRef.current = null
    }
  }, [])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    const model = new CharacterModel(characterById(shownId))
    model.setState('playing')
    model.setIntensity(0.8)

    const guitar = buildGuitar(guitarById(guitarId))
    // Uma guitarra tem por volta de um metro contra 1,78m de pessoa; o
    // modelo mede ~2,5 unidades de ponta a ponta, daí a escala.
    guitar.group.scale.setScalar(0.36)
    guitar.group.rotation.set(-0.1, 0.22, -GUITAR_TILT)
    guitar.group.position.set(GUITAR_BODY_OFFSET.x, GUITAR_BODY_OFFSET.y, GUITAR_BODY_OFFSET.z)
    model.instrumentAnchor.add(guitar.group)

    modelRef.current = model
    preview.setModel(model.group, () => {
      guitar.dispose()
      model.dispose()
    })
  }, [shownId, guitarId])

  const shown = characterById(shownId)

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
        <div className="picker">
          <div className="picker-stage">
            <canvas ref={canvasRef} />
            <span className="picker-hint">arraste para girar</span>
            <div className="picker-caption">
              <h2>{shown.name}</h2>
              <p>
                {shown.subtitle} · {BUILD_NAMES[shown.build]}
              </p>
            </div>
          </div>

          <div className="picker-list">
            {CHARACTERS.map((character) => {
              const owned = owns(profile.ownedCharacters, character.id)
              const unlocked = totalStars >= character.unlockAtStars
              const affordable = profile.money >= character.price
              const selected = profile.characterId === character.id

              return (
                <button
                  key={character.id}
                  className="picker-row"
                  data-selected={selected}
                  disabled={!owned && (!unlocked || !affordable)}
                  onClick={() =>
                    owned ? chooseCharacter(character.id) : buyCharacter(character.id)
                  }
                >
                  <span
                    className="picker-chip"
                    style={{
                      background: `linear-gradient(140deg, ${hex(character.colors.top)} 50%, ${hex(
                        character.colors.hair,
                      )} 50%)`,
                    }}
                  />
                  <span>
                    <strong>{character.name}</strong>
                    <span>{character.subtitle}</span>
                  </span>
                  <span>
                    {owned ? (
                      <span className={`tag ${selected ? 'tag-own' : ''}`}>
                        {selected ? 'No palco' : 'Livre'}
                      </span>
                    ) : !unlocked ? (
                      <span className="tag tag-locked">{character.unlockAtStars} ★</span>
                    ) : (
                      <span className="tag">${character.price.toLocaleString('pt-BR')}</span>
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
          Clique num personagem liberado para usá-lo, ou num bloqueado para comprar.
        </span>
      </footer>
    </div>
  )
}
