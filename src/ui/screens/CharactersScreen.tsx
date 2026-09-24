/**
 * Elenco: escolher quem toca, e comprar quem ainda não é seu.
 *
 * A prévia mostra o personagem animado, não parado — a pose de repouso não
 * diz nada sobre alguém que vai passar a música inteira se mexendo, e é a
 * animação que revela se as proporções e as articulações funcionam.
 */

import { useEffect, useRef, useState } from 'react'
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
import { useBackToMenu } from '../useBackKey'

function hex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function CharactersScreen() {
  const { profile, setScreen, chooseCharacter, buyCharacter, previewCharacter } = useGame()
  const totalStars = useGame((s) => s.totalStars())
  const previewId = useGame((s) => s.previewCharacterId)
  useBackToMenu()

  /**
   * O personagem ainda não está pronto na tela.
   *
   * Enquanto for verdade, o véu cobre o visor inteiro: nem o personagem
   * anterior sendo desmontado, nem o novo chegando pela metade. Começa
   * verdadeiro porque o visor começa vazio.
   */
  const [carregando, setCarregando] = useState(true)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<ModelPreview | null>(null)
  const modelRef = useRef<StageCharacter | null>(null)

  // O visor mostra o selecionado na lista; equipar é um botão à parte.
  const shownId = previewId ?? profile.characterId
  const guitarId = profile.guitarId

  useEffect(() => {
    if (!canvasRef.current) return
    const preview = new ModelPreview({
      canvas: canvasRef.current,
      entry: 'step',
      fit: 1.02,
      // O personagem toca sem parar: todo quadro é um quadro novo.
      continuous: true,
    })
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
    setCarregando(true)

    let descartado = false
    /** Entregues à prévia, que passa a cuidar do descarte deles. */
    let entregues = false
    let corpo: StageCharacter | null = null
    let guitarra: GuitarModel | null = null

    // Corpo e guitarra chegam de arquivos diferentes, cada um no seu tempo,
    // e o personagem só entra com os dois. Antes cada um aparecia quando
    // chegava: o corpo com a guitarra construída em código na mão, que
    // depois trocava pela de arquivo diante do jogador. Um arquivo que
    // falha cai na versão construída em código — melhor que um visor
    // coberto para sempre.
    const corpoPronto: Promise<StageCharacter> = escolhido.model
      ? loadCharacterGlb({ url: escolhido.model, adjust: escolhido.modelAdjust }).then(
          (importado) => {
            importado.setRole('guitar')
            return importado
          },
          (erro) => {
            console.error(`não deu para carregar ${escolhido.model}`, erro)
            return new CharacterModel(escolhido)
          },
        )
      : Promise.resolve(new CharacterModel(escolhido))

    const guitarraPronta: Promise<GuitarModel> = escolhida.model
      ? loadGuitarGlb(escolhida.model, escolhida, escolhida.modelAdjust).catch((erro) => {
          console.error(`não deu para carregar ${escolhida.model}`, erro)
          return buildGuitar(escolhida)
        })
      : Promise.resolve(buildGuitar(escolhida))

    void Promise.all([corpoPronto, guitarraPronta]).then(async ([c, g]) => {
      corpo = c
      guitarra = g
      if (descartado) {
        c.dispose()
        g.dispose()
        return
      }

      // A guitarra na pose da tabela; com `?rig`, os controles editam este
      // encaixe — e a chave do bloco copiado é o personagem que está no
      // visor.
      const a = attachmentFor('guitar', shownId)
      const aplicar = () => {
        g.group.scale.setScalar(a.scale)
        g.group.position.set(...a.position)
        g.group.rotation.set(...a.rotation)
      }
      aplicar()
      c.instrumentAnchor.add(g.group)
      setRigCharacter(shownId)
      registerAttachment('guitar', a, g.group, aplicar, shownId)

      c.setState('playing')
      c.setIntensity(0.8)
      // Uma pose antes de medir: o enquadramento lê a caixa do modelo, e o
      // esqueleto parado na pose de ligação mede outra coisa.
      c.update(0, 0)
      modelRef.current = c

      entregues = true
      const mostrado = await preview.present(c.group, () => {
        g.dispose()
        c.dispose()
      })
      if (mostrado && !descartado) setCarregando(false)
    })

    return () => {
      descartado = true
      clearAttachments()
      // O que já foi para a prévia continua na tela, sob o véu, até o
      // próximo tomar o lugar — descartar agora faria o visor redesenhar um
      // modelo desmontado, e a placa de vídeo subir tudo de novo à toa.
      preview.cancelPending()
      if (!entregues) {
        guitarra?.dispose()
        corpo?.dispose()
      }
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
            {/* O véu fica montado: cobre na hora, e sai devagar. */}
            <div className="picker-loading" data-hidden={!carregando} aria-hidden={!carregando}>
              <b>Carregando</b>
              <div className="loading-bar">
                <i />
              </div>
            </div>
            {!carregando && <span className="picker-hint">arraste para girar</span>}
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
