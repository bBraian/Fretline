/**
 * O palco atrás do braço: banda, luzes, plateia e cenário.
 *
 * A cena fica deliberadamente barata. O braço é o que precisa de quadros
 * estáveis; tudo aqui existe para dar contexto e não pode disputar tempo de
 * GPU com ele. Por isso os holofotes são cones emissivos com uma luz pontual
 * fraca em vez de `SpotLight` com sombra, e a plateia inteira é um
 * `InstancedMesh` de caixas.
 */

import * as THREE from 'three'
import { CharacterModel, GUITAR_BODY_OFFSET, GUITAR_TILT, type PerformanceState } from './character/characterModel'
import { buildGuitar, type GuitarModel } from './guitar/guitarModel'
import { loadCharacterGlb } from './character/characterGlb'
import type { StageCharacter } from './character/stageCharacter'
import { loadGuitarGlb } from './guitar/guitarGlb'
import { CHARACTERS, characterById, type Character } from '../content/characters'
import { BASS_PROP, guitarById, type Guitar } from '../content/guitars'
import { LightRig } from './stage/lightRig'

const CROWD_ROWS = 7
const CROWD_PER_ROW = 26
const CROWD_COUNT = CROWD_ROWS * CROWD_PER_ROW

export class Stage {
  readonly group = new THREE.Group()

  private guitarist: StageCharacter
  private guitarModel: GuitarModel
  private bandmates: CharacterModel[] = []
  private rig: LightRig
  private haze: THREE.Mesh[] = []
  private crowdWash: THREE.PointLight[] = []
  private crowd: THREE.InstancedMesh
  private crowdSeeds: Float32Array
  private crowdDummy = new THREE.Object3D()
  private disposables: Array<{ dispose(): void }> = []

  private clock = 0
  private starPower = 0
  private energy = 0.5
  private currentCharacterId: string
  private currentGuitarId: string

  constructor(
    characterId: string,
    guitarId: string,
    private options: { effects?: boolean } = {},
  ) {
    this.currentCharacterId = characterId
    this.currentGuitarId = guitarId

    // O palco fica atrás do fim do braço e elevado: a banda precisa aparecer
    // acima do ponto de fuga da pista, senão fica escondida atrás dela.
    this.group.position.set(0, 1.45, -19.5)

    this.buildFloor()
    this.buildBackdrop()
    this.buildAmps()
    this.buildDrumKit()

    const effects = this.options.effects !== false
    this.rig = new LightRig(
      [0x4b7bff, 0xff3d7f, 0x3ddc84, 0xffb703, 0xb56bff, 0x00d4ff, 0xff6b35],
      { beams: effects, lights: effects ? 4 : 2, simpleWall: !effects },
    )
    this.group.add(this.rig.group)

    this.buildAmbientLight()
    if (effects) this.buildHaze()

    const { crowd, seeds } = this.buildCrowd()
    this.crowd = crowd
    this.crowdSeeds = seeds

    this.guitarist = this.placeGuitarist(characterById(characterId))
    this.guitarModel = this.attachGuitar(guitarById(guitarId))
    this.buildBandmates()
  }

  // --- construção --------------------------------------------------------

  private track<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item)
    return item
  }

  private buildFloor() {
    const geometry = this.track(new THREE.BoxGeometry(22, 0.6, 12))
    // Piso liso e escuro: quase um espelho embaçado. É o que devolve a cor
    // dos refletores para dentro do quadro em vez de engolir tudo.
    const material = this.track(
      new THREE.MeshStandardMaterial({ color: 0x0e1016, roughness: 0.18, metalness: 0.55 }),
    )
    const floor = new THREE.Mesh(geometry, material)
    floor.position.set(0, -0.3, 0)
    floor.receiveShadow = true
    this.group.add(floor)

    // Borda luminosa: separa o palco da escuridão da plateia.
    const edge = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(22, 0.06, 0.1)),
      this.track(new THREE.MeshBasicMaterial({ color: 0x4b7bff })),
    )
    edge.position.set(0, 0.02, 6)
    this.group.add(edge)
  }

  private buildBackdrop() {
    // Paredes laterais e teto escuros, para o palco ser um lugar fechado e
    // não um objeto flutuando no vazio.
    const shell = this.track(new THREE.MeshStandardMaterial({ color: 0x07080d, roughness: 1 }))
    for (const [x, rotation] of [
      [-11, Math.PI / 2],
      [11, -Math.PI / 2],
    ] as const) {
      const side = new THREE.Mesh(this.track(new THREE.PlaneGeometry(14, 14)), shell)
      side.position.set(x, 5, 0)
      side.rotation.y = rotation
      this.group.add(side)
    }

    // Treliça de iluminação.
    const trussMaterial = this.track(
      new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.5, metalness: 0.7 }),
    )
    const beam = this.track(new THREE.BoxGeometry(20, 0.18, 0.18))
    for (const y of [7.4, 7.9]) {
      const bar = new THREE.Mesh(beam, trussMaterial)
      bar.position.set(0, y, -3)
      this.group.add(bar)
    }
    const strut = this.track(new THREE.BoxGeometry(0.1, 0.62, 0.1))
    for (let i = -9; i <= 9; i += 1.5) {
      const post = new THREE.Mesh(strut, trussMaterial)
      post.position.set(i, 7.65, -3)
      this.group.add(post)
    }
  }

  private buildAmps() {
    const cabinet = this.track(new THREE.BoxGeometry(1.5, 1.7, 0.9))
    const cabinetMaterial = this.track(
      new THREE.MeshStandardMaterial({ color: 0x17181d, roughness: 0.95 }),
    )
    const grille = this.track(
      new THREE.MeshStandardMaterial({ color: 0x2b2c33, roughness: 0.8 }),
    )
    const cone = this.track(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 14))

    for (const x of [-6.2, 6.2]) {
      for (let level = 0; level < 2; level++) {
        const amp = new THREE.Mesh(cabinet, cabinetMaterial)
        amp.position.set(x, 0.85 + level * 1.75, -4)
        this.group.add(amp)

        for (const dx of [-0.36, 0.36]) {
          for (const dy of [-0.38, 0.38]) {
            const speaker = new THREE.Mesh(cone, grille)
            speaker.rotation.x = Math.PI / 2
            speaker.position.set(x + dx, 0.85 + level * 1.75 + dy, -3.54)
            this.group.add(speaker)
          }
        }
      }
    }
  }

  private buildDrumKit() {
    const kit = new THREE.Group()
    kit.position.set(0, 0.5, -4.9)

    const shell = this.track(
      new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.4, metalness: 0.2 }),
    )
    // A pele do bumbo é bege, não branca: em branco puro ela vira um disco
    // estourado que rouba a atenção de tudo no plano.
    const skin = this.track(new THREE.MeshStandardMaterial({ color: 0xbfb6a4, roughness: 0.75 }))
    const metal = this.track(
      new THREE.MeshStandardMaterial({ color: 0xc9b037, roughness: 0.3, metalness: 0.9 }),
    )

    const bass = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.75, 0.75, 0.7, 20)), shell)
    bass.rotation.x = Math.PI / 2
    bass.position.set(0, 0.7, 0)
    kit.add(bass)

    const bassHead = new THREE.Mesh(this.track(new THREE.CircleGeometry(0.75, 20)), skin)
    bassHead.position.set(0, 0.7, 0.36)
    kit.add(bassHead)

    const tom = this.track(new THREE.CylinderGeometry(0.26, 0.26, 0.3, 16))
    for (const [x, y, z] of [
      [-0.45, 1.35, -0.2],
      [0.45, 1.35, -0.2],
      [-0.95, 0.75, 0.3],
    ] as const) {
      const drum = new THREE.Mesh(tom, shell)
      drum.position.set(x, y, z)
      kit.add(drum)
    }

    const snare = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16)),
      this.track(new THREE.MeshStandardMaterial({ color: 0xb8b8c0, roughness: 0.3, metalness: 0.8 })),
    )
    snare.position.set(-0.7, 0.95, 0.5)
    kit.add(snare)

    const cymbal = this.track(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 20))
    for (const [x, y, z, tilt] of [
      [-1.3, 1.7, 0.1, 0.22],
      [1.3, 1.65, 0.1, -0.22],
      [0.95, 1.2, 0.6, 0.1],
    ] as const) {
      const plate = new THREE.Mesh(cymbal, metal)
      plate.position.set(x, y, z)
      plate.rotation.z = tilt
      kit.add(plate)

      const stand = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.02, 0.02, y, 6)), metal)
      stand.position.set(x, y / 2, z)
      kit.add(stand)
    }

    this.group.add(kit)
  }

  private buildAmbientLight() {
    // Luz de preenchimento fria e fraca: o palco precisa de um piso de
    // exposição para os refletores terem contra o que se destacar, mas alta
    // demais e o show vira um escritório iluminado.
    this.group.add(new THREE.HemisphereLight(0x4a5f96, 0x07080c, 0.45))

    const key = new THREE.DirectionalLight(0xdfe7ff, 0.9)
    key.position.set(3, 9, 10)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 30
    key.shadow.camera.left = -10
    key.shadow.camera.right = 10
    key.shadow.camera.top = 10
    key.shadow.camera.bottom = -6
    this.group.add(key)

    // Luz frontal dedicada à banda: os refletores vêm de cima e deixariam
    // rostos e instrumentos em silhueta.
    const front = new THREE.PointLight(0xfff0dc, 30, 18, 2)
    front.position.set(0, 2.8, 5)
    this.group.add(front)

    // Lavagem sobre a plateia. Sem ela o plano que olha para o público cai
    // no breu — a plateia fica fora do alcance de tudo que ilumina o palco,
    // e um plano inteiro do repertório do diretor vira tela preta.
    const washes = this.options.effects === false
      ? ([[0, 10, 0x8b5cf6]] as const)
      : ([
          [-6, 9, 0x3b6fd4],
          [0, 11, 0x8b5cf6],
          [6, 9, 0xd946a0],
        ] as const)

    for (const [x, z, color] of washes) {
      const wash = new THREE.PointLight(color, 26, 26, 2)
      wash.position.set(x, 5.5, z)
      this.group.add(wash)
      this.crowdWash.push(wash)
    }
  }

  /**
   * Fumaça: planos aditivos grandes e translúcidos, espalhados em
   * profundidade. É o que dá corpo aos feixes — um refletor sem fumaça
   * ilumina o chão e mais nada, e o palco fica com aquele ar de maquete.
   */
  private buildHaze() {
    const geometry = this.track(new THREE.PlaneGeometry(26, 11))
    for (let i = 0; i < 5; i++) {
      const material = this.track(
        new THREE.MeshBasicMaterial({
          color: 0x8fa8d8,
          transparent: true,
          opacity: 0.018,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      )
      const plane = new THREE.Mesh(geometry, material)
      plane.position.set(0, 3.4, -5 + i * 2.6)
      this.group.add(plane)
      this.haze.push(plane)
    }
  }

  private buildCrowd() {
    const geometry = this.track(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8))
    const material = this.track(new THREE.MeshStandardMaterial({ roughness: 0.95 }))
    const crowd = new THREE.InstancedMesh(geometry, material, CROWD_COUNT)
    crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    crowd.frustumCulled = false

    const seeds = new Float32Array(CROWD_COUNT * 3)
    const color = new THREE.Color()
    let i = 0

    const rows = this.options.effects === false ? 3 : CROWD_ROWS
    for (let row = 0; row < rows; row++) {
      for (let slot = 0; slot < CROWD_PER_ROW; slot++) {
        const x = (slot - (CROWD_PER_ROW - 1) / 2) * 0.82 + (Math.random() - 0.5) * 0.3
        const z = 6.5 + row * 1.15 + (Math.random() - 0.5) * 0.4
        // Vão no meio: é por ali que a pista atravessa até o palco. Sem isso
        // a plateia vira uma parede na frente das notas distantes.
        if (Math.abs(x) < 2.6) {
          seeds[i * 3] = Number.NaN
          i++
          continue
        }
        seeds[i * 3] = x
        seeds[i * 3 + 1] = z
        seeds[i * 3 + 2] = Math.random() * Math.PI * 2

        // A plateia é quase silhueta: escura, com variação pequena, para não
        // competir com o palco em atenção.
        color.setHSL(Math.random(), 0.18, 0.06 + Math.random() * 0.06)
        crowd.setColorAt(i, color)
        i++
      }
    }

    crowd.count = i
    this.group.add(crowd)

    // Telas de celular na plateia: pontinhos emissivos espalhados, que é o
    // que se vê de verdade de cima de um palco hoje em dia.
    const phoneGeometry = this.track(new THREE.PlaneGeometry(0.1, 0.16))
    const phoneMaterial = this.track(
      new THREE.MeshBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0.75 }),
    )
    const phones = new THREE.InstancedMesh(phoneGeometry, phoneMaterial, 40)
    phones.frustumCulled = false
    const dummy = new THREE.Object3D()
    for (let p = 0; p < 40; p++) {
      const source = Math.floor(Math.random() * CROWD_COUNT)
      const x = seeds[source * 3]
      dummy.position.set(Number.isNaN(x) ? 4 : x, 0.15 + Math.random() * 0.4, seeds[source * 3 + 1])
      dummy.rotation.set(-0.3, (Math.random() - 0.5) * 0.6, 0)
      dummy.updateMatrix()
      phones.setMatrixAt(p, dummy.matrix)
    }
    this.group.add(phones)

    return { crowd, seeds }
  }

  private placeGuitarist(character: Character): StageCharacter {
    const model = new CharacterModel(character)
    model.setRole('guitar')
    model.group.position.set(-2.6, 0, -0.6)
    model.group.rotation.y = 0.3
    this.group.add(model.group)
    if (character.model) void this.swapInImportedCharacter(character)
    return model
  }

  /**
   * Troca o guitarrista provisório pelo de arquivo, quando ele carrega.
   *
   * Mesma ideia da guitarra: a marionete construída em código entra na hora
   * e o importado a substitui, levando junto a guitarra que está pendurada
   * nela. O `id` é conferido na volta porque o jogador pode ter trocado de
   * personagem nesse meio-tempo.
   */
  private async swapInImportedCharacter(character: Character) {
    try {
      const imported = await loadCharacterGlb({
        url: character.model!,
        adjust: character.modelAdjust,
      })
      if (this.currentCharacterId !== character.id) {
        imported.dispose()
        return
      }
      const position = this.guitarist.group.position.clone()
      const rotation = this.guitarist.group.rotation.clone()

      // A guitarra sai do provisório e entra no importado antes do descarte:
      // ela é do jogador, não do corpo que a segura.
      this.guitarist.instrumentAnchor.remove(this.guitarModel.group)
      this.group.remove(this.guitarist.group)
      this.guitarist.dispose()

      imported.setRole('guitar')
      imported.group.position.copy(position)
      imported.group.rotation.copy(rotation)
      this.group.add(imported.group)
      imported.instrumentAnchor.add(this.guitarModel.group)
      this.guitarist = imported
    } catch (erro) {
      // Falhar aqui deixa a marionete no palco e a música segue.
      console.error(`não deu para carregar ${character.model}`, erro)
    }
  }

  private attachGuitar(guitar: Guitar): GuitarModel {
    // A construída em código entra na hora, mesmo quando a guitarra é de
    // arquivo: ela é o lugar-guardado enquanto o `.glb` chega. Esperar o
    // arquivo aqui atrasaria o início da música, e um guitarrista de mão
    // vazia no palco é pior que uma guitarra provisória.
    const model = buildGuitar(guitar)
    this.poseGuitar(model, 0.36)
    this.guitarist.instrumentAnchor.add(model.group)
    if (guitar.model) void this.swapInImported(guitar)
    return model
  }

  /** Pendura a guitarra na mão do personagem, no ângulo de quem a segura. */
  private poseGuitar(model: GuitarModel, scale: number) {
    model.group.scale.setScalar(scale)
    model.group.rotation.set(-0.1, 0.22, -GUITAR_TILT)
    model.group.position.set(GUITAR_BODY_OFFSET.x, GUITAR_BODY_OFFSET.y, GUITAR_BODY_OFFSET.z)
  }

  /**
   * Troca a guitarra provisória pela do arquivo, quando ele termina de
   * carregar.
   *
   * O `id` é conferido na volta porque o jogador pode ter trocado de
   * guitarra nesse meio-tempo — sem isso, um carregamento lento aparece por
   * cima de uma escolha mais nova.
   */
  private async swapInImported(guitar: Guitar) {
    try {
      const imported = await loadGuitarGlb(guitar.model!, guitar, guitar.modelAdjust)
      if (this.currentGuitarId !== guitar.id) {
        imported.dispose()
        return
      }
      this.guitarist.instrumentAnchor.remove(this.guitarModel.group)
      this.guitarModel.dispose()
      this.poseGuitar(imported, 0.36)
      this.guitarist.instrumentAnchor.add(imported.group)
      this.guitarModel = imported
    } catch (erro) {
      // Falhar aqui não tira o jogador da música: a provisória continua na
      // mão, e o show segue.
      console.error(`não deu para carregar ${guitar.model}`, erro)
    }
  }

  private buildBandmates() {
    // Baixista, vocalista e baterista saem do elenco, evitando duplicar o
    // guitarrista. Cada um recebe o próprio papel: é o que separa uma banda
    // de quatro guitarristas em posições diferentes.
    const others = CHARACTERS.filter((c) => c.id !== this.currentCharacterId)

    const bassist = new CharacterModel(others[0] ?? CHARACTERS[1])
    bassist.setRole('bass')
    bassist.group.position.set(2.7, 0, -0.9)
    bassist.group.rotation.y = -0.34
    const bass = buildGuitar(BASS_PROP)
    // O baixo é maior que a guitarra e tem o braço mais comprido.
    this.poseGuitar(bass, 0.42)
    bassist.instrumentAnchor.add(bass.group)
    this.group.add(bassist.group)
    this.bandmates.push(bassist)
    this.disposables.push(bass)

    const singer = new CharacterModel(others[1] ?? CHARACTERS[2])
    singer.setRole('vocals')
    singer.group.position.set(-0.1, 0, 3.4)
    singer.group.rotation.y = 0.1
    this.group.add(singer.group)
    this.bandmates.push(singer)

    // Microfone na mão, não num pedestal à parte: assim ele acompanha o
    // gesto do braço em vez de ficar parado enquanto a mão se mexe.
    const micBody = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.018, 0.022, 0.15, 10)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x1b1d23, roughness: 0.5, metalness: 0.6 })),
    )
    micBody.position.set(0, -0.09, 0.02)
    micBody.rotation.x = -0.5
    singer.pickHand.add(micBody)

    const micHead = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(0.033, 12, 10)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.35, metalness: 0.85 })),
    )
    micHead.position.set(0, -0.16, 0.055)
    singer.pickHand.add(micHead)

    const drummer = new CharacterModel(others[2] ?? CHARACTERS[3])
    drummer.setRole('drums')
    drummer.group.position.set(0, 0.42, -4.1)
    this.group.add(drummer.group)
    this.bandmates.push(drummer)

    // Banquinho, para o baterista não ficar sentado no ar.
    const stool = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.2, 0.18, 0.08, 14)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.8 })),
    )
    stool.position.set(0, 0.98, -4.1)
    this.group.add(stool)

    const stoolPost = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.03, 0.05, 0.55, 8)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.4, metalness: 0.7 })),
    )
    stoolPost.position.set(0, 0.68, -4.1)
    this.group.add(stoolPost)

    // Baquetas nas mãos.
    const stickGeometry = this.track(new THREE.CylinderGeometry(0.008, 0.012, 0.38, 6))
    const stickMaterial = this.track(new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.7 }))
    for (const hand of [drummer.pickHand, drummer.fretHand]) {
      const stick = new THREE.Mesh(stickGeometry, stickMaterial)
      stick.position.set(0, -0.2, 0.05)
      stick.rotation.x = -0.3
      hand.add(stick)
    }
  }

  // --- troca de elenco ---------------------------------------------------

  setCharacter(characterId: string) {
    if (characterId === this.currentCharacterId) return
    this.currentCharacterId = characterId

    const position = this.guitarist.group.position.clone()
    const rotation = this.guitarist.group.rotation.clone()
    this.group.remove(this.guitarist.group)
    this.guitarist.dispose()

    const character = characterById(characterId)
    this.guitarist = new CharacterModel(character)
    this.guitarist.setRole('guitar')
    this.guitarist.group.position.copy(position)
    this.guitarist.group.rotation.copy(rotation)
    this.group.add(this.guitarist.group)
    if (character.model) void this.swapInImportedCharacter(character)

    // A guitarra está pendurada no personagem, então acompanha a troca.
    this.guitarModel.dispose()
    this.guitarModel = this.attachGuitar(guitarById(this.currentGuitarId))
  }

  setGuitar(guitarId: string) {
    if (guitarId === this.currentGuitarId) return
    this.currentGuitarId = guitarId
    this.guitarist.instrumentAnchor.remove(this.guitarModel.group)
    this.guitarModel.dispose()
    this.guitarModel = this.attachGuitar(guitarById(guitarId))
  }

  // --- animação ----------------------------------------------------------

  /** Liga e desliga partes do palco, para isolar custo em diagnóstico. */
  setPartVisible(part: 'band' | 'rig' | 'crowd', visible: boolean) {
    if (part === 'band') {
      this.guitarist.group.visible = visible
      for (const mate of this.bandmates) mate.group.visible = visible
    } else if (part === 'rig') {
      this.rig.group.visible = visible
    } else {
      this.crowd.visible = visible
    }
  }

  setPerformance(state: PerformanceState, intensity: number, starPower: number) {
    this.starPower = starPower
    this.energy = intensity
    this.guitarist.setState(state)
    this.guitarist.setIntensity(intensity)
    for (const mate of this.bandmates) {
      mate.setState(state === 'solo' ? 'playing' : state)
      mate.setIntensity(intensity * 0.8)
    }
  }

  update(dt: number, beatPhase: number) {
    this.clock += dt

    this.guitarist.update(dt, beatPhase)
    // Uma defasagem pequena entre os integrantes evita o efeito de marionetes
    // idênticas se mexendo em uníssono.
    this.bandmates.forEach((mate, i) => mate.update(dt, (beatPhase + i * 0.17) % 1))

    this.guitarModel.setGlow(this.starPower)
    this.rig.update(dt, beatPhase, this.energy, this.starPower)

    // A lavagem da plateia pulsa na batida, como os blinders de um show.
    const pulse = 0.5 + 0.5 * Math.cos(beatPhase * Math.PI * 2)
    for (let i = 0; i < this.crowdWash.length; i++) {
      this.crowdWash[i].intensity = 14 + pulse * 22 * (0.6 + this.energy * 0.6)
    }
    this.updateHaze(dt)
    this.updateCrowd(beatPhase)
  }

  /** A fumaça deriva devagar: parada, denuncia que é um plano. */
  private updateHaze(dt: number) {
    for (let i = 0; i < this.haze.length; i++) {
      const plane = this.haze[i]
      plane.position.x = Math.sin(this.clock * 0.08 + i) * 1.4
      plane.position.y = 3.4 + Math.sin(this.clock * 0.13 + i * 2) * 0.3
      const material = plane.material as THREE.MeshBasicMaterial
      material.opacity = 0.014 + this.starPower * 0.012 + this.energy * 0.008
    }
    void dt
  }

  private updateCrowd(beatPhase: number) {
    const bounce = Math.max(0, Math.sin(beatPhase * Math.PI * 2))

    for (let i = 0; i < CROWD_COUNT; i++) {
      const x = this.crowdSeeds[i * 3]
      const z = this.crowdSeeds[i * 3 + 1]
      const seed = this.crowdSeeds[i * 3 + 2]
      const jump = bounce * (0.12 + 0.1 * Math.sin(seed))

      if (Number.isNaN(x)) {
        // Instância reservada no vão central: fica com escala zero.
        this.crowdDummy.scale.setScalar(0)
        this.crowdDummy.position.set(0, -100, 0)
        this.crowdDummy.rotation.set(0, 0, 0)
        this.crowdDummy.updateMatrix()
        this.crowd.setMatrixAt(i, this.crowdDummy.matrix)
        continue
      }

      // A plateia fica no fosso, abaixo do nível do palco.
      this.crowdDummy.position.set(x, -0.95 + jump, z)
      this.crowdDummy.rotation.set(0, Math.sin(seed + this.clock * 0.4) * 0.3, 0)
      this.crowdDummy.scale.setScalar(0.9 + 0.2 * Math.sin(seed * 3))
      this.crowdDummy.updateMatrix()
      this.crowd.setMatrixAt(i, this.crowdDummy.matrix)
    }

    this.crowd.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.guitarist.dispose()
    this.guitarModel.dispose()
    for (const mate of this.bandmates) mate.dispose()
    this.rig.dispose()
    for (const item of this.disposables) item.dispose()
    this.crowd.geometry.dispose()
  }
}
