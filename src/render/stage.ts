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
import { CharacterModel, type PerformanceState } from './character'
import { buildGuitar, type GuitarModel } from './guitarModel'
import { CHARACTERS, characterById, type Character } from '../content/characters'
import { guitarById, type Guitar } from '../content/guitars'

const CROWD_ROWS = 7
const CROWD_PER_ROW = 26
const CROWD_COUNT = CROWD_ROWS * CROWD_PER_ROW

interface Spotlight {
  cone: THREE.Mesh
  light: THREE.PointLight
  phase: number
  color: THREE.Color
}

export class Stage {
  readonly group = new THREE.Group()

  private guitarist: CharacterModel
  private guitarModel: GuitarModel
  private bandmates: CharacterModel[] = []
  private spotlights: Spotlight[] = []
  private crowd: THREE.InstancedMesh
  private crowdSeeds: Float32Array
  private crowdDummy = new THREE.Object3D()
  private disposables: Array<{ dispose(): void }> = []

  private clock = 0
  private starPower = 0
  private currentCharacterId: string
  private currentGuitarId: string

  constructor(characterId: string, guitarId: string) {
    this.currentCharacterId = characterId
    this.currentGuitarId = guitarId

    // O palco fica atrás e acima do fim do braço.
    this.group.position.set(0, 0.3, -20)

    this.buildFloor()
    this.buildBackdrop()
    this.buildAmps()
    this.buildDrumKit()
    this.buildSpotlights()

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
    const material = this.track(
      new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.85, metalness: 0.1 }),
    )
    const floor = new THREE.Mesh(geometry, material)
    floor.position.set(0, -0.3, 0)
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
    const wall = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(30, 14)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x0a0b10, roughness: 1 })),
    )
    wall.position.set(0, 6, -6)
    this.group.add(wall)

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
    kit.position.set(0, 0.6, -4.2)

    const shell = this.track(
      new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.4, metalness: 0.2 }),
    )
    const skin = this.track(new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.6 }))
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

  private buildSpotlights() {
    const colors = [0x4b7bff, 0xff3d7f, 0x3ddc84, 0xffb703, 0xb56bff]
    const coneGeometry = this.track(new THREE.ConeGeometry(1.5, 9, 16, 1, true))
    coneGeometry.translate(0, -4.5, 0)

    for (let i = 0; i < colors.length; i++) {
      const color = new THREE.Color(colors[i])
      const material = this.track(
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.07,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      )
      const cone = new THREE.Mesh(coneGeometry, material)
      cone.position.set(-6 + i * 3, 7.4, -3)
      this.group.add(cone)

      const light = new THREE.PointLight(color, 6, 18, 2)
      light.position.set(-6 + i * 3, 4.5, -1)
      this.group.add(light)

      this.spotlights.push({ cone, light, phase: i * 1.27, color })
    }

    const fill = new THREE.HemisphereLight(0x5568a0, 0x090a0e, 0.55)
    this.group.add(fill)

    const key = new THREE.DirectionalLight(0xdfe7ff, 0.7)
    key.position.set(2, 8, 6)
    this.group.add(key)
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

    for (let row = 0; row < CROWD_ROWS; row++) {
      for (let slot = 0; slot < CROWD_PER_ROW; slot++) {
        const x = (slot - (CROWD_PER_ROW - 1) / 2) * 0.82 + (Math.random() - 0.5) * 0.3
        const z = 7.5 + row * 1.15 + (Math.random() - 0.5) * 0.4
        seeds[i * 3] = x
        seeds[i * 3 + 1] = z
        seeds[i * 3 + 2] = Math.random() * Math.PI * 2

        // A plateia é quase silhueta: escura, com variação pequena, para não
        // competir com o palco em atenção.
        color.setHSL(Math.random(), 0.25, 0.08 + Math.random() * 0.07)
        crowd.setColorAt(i, color)
        i++
      }
    }

    this.group.add(crowd)
    return { crowd, seeds }
  }

  private placeGuitarist(character: Character) {
    const model = new CharacterModel(character)
    model.group.position.set(-2.4, 0, -0.5)
    model.group.rotation.y = 0.28
    this.group.add(model.group)
    return model
  }

  private attachGuitar(guitar: Guitar): GuitarModel {
    const model = buildGuitar(guitar)
    model.group.scale.setScalar(0.62)
    model.group.rotation.set(-0.15, 0.1, -1.05)
    model.group.position.set(0, -0.05, 0.12)
    this.guitarist.instrumentAnchor.add(model.group)
    return model
  }

  private buildBandmates() {
    // Baixista e vocalista saem do elenco, evitando duplicar o guitarrista.
    const others = CHARACTERS.filter((c) => c.id !== this.currentCharacterId)

    const bassist = new CharacterModel(others[0] ?? CHARACTERS[1])
    bassist.group.position.set(2.6, 0, -0.8)
    bassist.group.rotation.y = -0.3
    const bass = buildGuitar({ ...guitarById('nocturne'), id: 'bass-prop' })
    bass.group.scale.setScalar(0.7)
    bass.group.rotation.set(-0.15, 0.1, -1.0)
    bassist.instrumentAnchor.add(bass.group)
    this.group.add(bassist.group)
    this.bandmates.push(bassist)
    this.disposables.push(bass)

    const singer = new CharacterModel(others[1] ?? CHARACTERS[2])
    singer.group.position.set(0.1, 0, 2.6)
    this.group.add(singer.group)
    this.bandmates.push(singer)

    const micStand = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 8)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x2a2d35, metalness: 0.7, roughness: 0.4 })),
    )
    micStand.position.set(0.1, 0.75, 3.0)
    this.group.add(micStand)

    const drummer = new CharacterModel(others[2] ?? CHARACTERS[3])
    drummer.group.position.set(0, 0.35, -5.2)
    drummer.group.scale.multiplyScalar(0.95)
    this.group.add(drummer.group)
    this.bandmates.push(drummer)
  }

  // --- troca de elenco ---------------------------------------------------

  setCharacter(characterId: string) {
    if (characterId === this.currentCharacterId) return
    this.currentCharacterId = characterId

    const position = this.guitarist.group.position.clone()
    const rotation = this.guitarist.group.rotation.clone()
    this.group.remove(this.guitarist.group)
    this.guitarist.dispose()

    this.guitarist = new CharacterModel(characterById(characterId))
    this.guitarist.group.position.copy(position)
    this.guitarist.group.rotation.copy(rotation)
    this.group.add(this.guitarist.group)

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

  setPerformance(state: PerformanceState, intensity: number, starPower: number) {
    this.starPower = starPower
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
    this.updateSpotlights(dt, beatPhase)
    this.updateCrowd(beatPhase)
  }

  private updateSpotlights(dt: number, beatPhase: number) {
    const pulse = 0.5 + 0.5 * Math.cos(beatPhase * Math.PI * 2)

    for (const spot of this.spotlights) {
      spot.phase += dt * 0.5
      spot.cone.rotation.z = Math.sin(spot.phase) * 0.35
      spot.cone.rotation.x = Math.cos(spot.phase * 0.7) * 0.2

      const material = spot.cone.material as THREE.MeshBasicMaterial
      material.opacity = 0.05 + pulse * 0.09 + this.starPower * 0.06
      spot.light.intensity = 3 + pulse * 5 + this.starPower * 4

      if (this.starPower > 0.01) {
        // No star power as luzes convergem para o azul do medidor.
        material.color.copy(spot.color).lerp(new THREE.Color(0x9ec5ff), this.starPower)
      } else {
        material.color.copy(spot.color)
      }
    }
  }

  private updateCrowd(beatPhase: number) {
    const bounce = Math.max(0, Math.sin(beatPhase * Math.PI * 2))

    for (let i = 0; i < CROWD_COUNT; i++) {
      const x = this.crowdSeeds[i * 3]
      const z = this.crowdSeeds[i * 3 + 1]
      const seed = this.crowdSeeds[i * 3 + 2]
      const jump = bounce * (0.12 + 0.1 * Math.sin(seed))

      this.crowdDummy.position.set(x, 0.45 + jump, z)
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
    for (const item of this.disposables) item.dispose()
    this.crowd.geometry.dispose()
  }
}
