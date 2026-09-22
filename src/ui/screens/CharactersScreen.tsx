/**
 * Elenco: escolher quem toca, e comprar quem ainda não é seu.
 *
 * A prévia mostra o personagem animado, não parado — a pose de repouso não
 * diz nada sobre alguém que vai passar a música inteira se mexendo, e é a
 * animação que revela se as proporções e as articulações funcionam.
 */

import { useEffect, useRef } from 'react'
import { owns, useGame } from '../store'
import { ShopActions, ShopTag } from './ShopActions'
import { BUILD_NAMES, SHOP_CHARACTERS, characterById } from '../../content/characters'
import { loadCharacterGlb } from '../../render/character/characterGlb'
import type { StageCharacter } from '../../render/character/stageCharacter'
import { CharacterModel } from '../../render/character/characterModel'
import { attachmentFor } from '../../render/character/bandRig'
import {
  clearAttachments,
  registerAttachment,
  rigPanelEnabled,
  setRigCharacter,
} from '../../render/character/rigPanel'
import { loadGuitarGlb } from '../../render/guitar/guitarGlb'
import { buildGuitar, type GuitarModel } from '../../render/guitar/guitarModel'
import { guitarById } from '../../content/guitars'
import { ModelPreview } from '../../render/preview'
import { Backdrop } from '../Backdrop'
import { mixer } from '../../audio/mixer'

function hex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function CharactersScreen() {
  const { profile, setScreen, chooseCharacter, buyCharacter, previewCharacter } = useGame()
  const totalStars = useGame((s) => s.totalStars())
  const previewId = useGame((s) => s.previewCharacterId)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<ModelPreview | null>(null)
  const modelRef = useRef<StageCharacter | null>(null)

  // O visor mostra o selecionado na lista; equipar é um botão à parte.
  const shownId = previewId ?? profile.characterId
  const guitarId = profile.guitarId

  useEffect(() => {
    if (!canvasRef.current) return
    const preview = new ModelPreview({ canvas: canvasRef.current, entry: 'step', fit: 1.02 })
    previewRef.current = preview

    // O personagem continua tocando no visor; o relógio vem do próprio
    // laço da prévia, já que não há música por trás.
    let frame = 0
    let last = performance.now()
    let congelado = false
    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      // 100 BPM de mentirinha, só para a pose ter pulso.
      modelRef.current?.update(congelado ? 0 : dt, (now / 600) % 1)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    // Os mesmos ganchos que o palco publica, no que faz sentido aqui: o
    // visor não tem cortes de câmera (quem gira é o ponteiro), mas congelar
    // a animação é o que permite ajustar sem a pose mudando debaixo do
    // controle.
    if (rigPanelEnabled()) {
      ;(window as unknown as { __rigScene?: unknown }).__rigScene = {
        shots: [],
        lockShot: () => {},
        lockedShot: () => null,
        setFrozen: (value: boolean) => {
          congelado = value
        },
        isFrozen: () => congelado,
      }
    }

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

    const escolhido = characterById(shownId)
    const escolhida = guitarById(guitarId)

    let descartado = false
    // Corpo e guitarra chegam de arquivos diferentes, cada um no seu tempo.
    // Guardar os dois em variáveis e reconstruir o vínculo a cada chegada
    // evita a corrida que havia aqui: quando o corpo chegava primeiro, a
    // guitarra de arquivo era pendurada na marionete já descartada, e o
    // personagem ficava com a construída em código na mão.
    let corpo: StageCharacter = new CharacterModel(escolhido)
    let guitarra: GuitarModel = buildGuitar(escolhida)

    /** Põe a guitarra de agora no corpo de agora, na pose da tabela. */
    const montar = () => {
      const a = attachmentFor('guitar', shownId)
      const aplicar = () => {
        guitarra.group.scale.setScalar(a.scale)
        guitarra.group.position.set(...a.position)
        guitarra.group.rotation.set(...a.rotation)
      }
      aplicar()
      corpo.instrumentAnchor.add(guitarra.group)
      // Com `?rig`, os controles editam este encaixe — e a chave do bloco
      // copiado é o personagem que está no visor.
      setRigCharacter(shownId)
      registerAttachment('guitar', a, guitarra.group, aplicar, shownId)
    }

    const mostrar = () => {
      corpo.setState('playing')
      corpo.setIntensity(0.8)
      montar()
      modelRef.current = corpo
      preview.setModel(corpo.group, () => {})
    }

    mostrar()

    if (escolhida.model) {
      void loadGuitarGlb(escolhida.model, escolhida, escolhida.modelAdjust)
        .then((importada) => {
          if (descartado) return importada.dispose()
          corpo.instrumentAnchor.remove(guitarra.group)
          guitarra.dispose()
          guitarra = importada
          montar()
        })
        .catch((erro) => console.error(`não deu para carregar ${escolhida.model}`, erro))
    }

    if (escolhido.model) {
      void loadCharacterGlb({ url: escolhido.model, adjust: escolhido.modelAdjust })
        .then((importado) => {
          if (descartado) return importado.dispose()
          corpo.instrumentAnchor.remove(guitarra.group)
          const antigo = corpo
          corpo = importado
          corpo.setRole('guitar')
          antigo.dispose()
          mostrar()
        })
        .catch((erro) => console.error(`não deu para carregar ${escolhido.model}`, erro))
    }

    return () => {
      descartado = true
      clearAttachments()
      guitarra.dispose()
      corpo.dispose()
      modelRef.current = null
    }
  }, [shownId, guitarId])

  const shown = characterById(shownId)

  return (
    <div className="screen">
      <Backdrop variant="content" />
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

            <ShopActions
              owned={owns(profile.ownedCharacters, shown.id)}
              equipped={profile.characterId === shown.id}
              unlocked={totalStars >= shown.unlockAtStars}
              price={shown.price}
              unlockAtStars={shown.unlockAtStars}
              money={profile.money}
              onBuy={() => buyCharacter(shown.id)}
              onEquip={() => chooseCharacter(shown.id)}
            />
          </div>

          <div className="picker-list">
            {SHOP_CHARACTERS.map((character) => {
              const owned = owns(profile.ownedCharacters, character.id)

              return (
                <button
                  key={character.id}
                  className="picker-row"
                  data-selected={character.id === shownId}
                  data-owned={owned}
                  onClick={() => previewCharacter(character.id)}
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
                    <ShopTag
                      owned={owned}
                      equipped={profile.characterId === character.id}
                      unlocked={totalStars >= character.unlockAtStars}
                      price={character.price}
                      unlockAtStars={character.unlockAtStars}
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
          ← Voltar
        </button>
        <span className="screen-subtitle">
          Clique em qualquer personagem para vê-lo tocando. Comprar e equipar são os botões no
          visor.
        </span>
      </footer>
    </div>
  )
}
