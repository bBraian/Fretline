/**
 * Um integrante da banda, montado a partir de primitivas.
 *
 * Os membros são grupos aninhados — quadril contém tronco, que contém braço,
 * que contém antebraço — então girar um grupo leva junto tudo o que vem
 * depois, como um esqueleto de verdade. É pouco código e evita depender de
 * um arquivo de animação que ainda não existe.
 *
 * A animação é escrita como soma de senoides em cima de uma pose de
 * repouso. Não substitui captura de movimento, mas lê como música porque as
 * fases dos membros são derivadas do tempo de batida, não de um relógio solto.
 */

import * as THREE from 'three'
import type { Character } from '../content/characters'

export type PerformanceState = 'idle' | 'playing' | 'solo' | 'starPower' | 'failing'

interface Limb {
  root: THREE.Group
  lower: THREE.Group
}

const BUILD_SCALE = { slim: 0.88, regular: 1, heavy: 1.16 } as const

export class CharacterModel {
  readonly group = new THREE.Group()

  private hips = new THREE.Group()
  private torso = new THREE.Group()
  private head = new THREE.Group()
  private leftArm: Limb
  private rightArm: Limb
  private leftLeg: Limb
  private rightLeg: Limb
  /** Onde um instrumento é pendurado. */
  readonly instrumentAnchor = new THREE.Group()

  private disposables: Array<{ dispose(): void }> = []
  private clock = 0
  private state: PerformanceState = 'idle'
  private intensity = 0

  constructor(private character: Character) {
    const width = BUILD_SCALE[character.build]
    const skin = this.material(character.colors.skin, 0.75)
    const shirt = this.material(character.colors.shirt, 0.85)
    const pants = this.material(character.colors.pants, 0.9)

    this.group.scale.setScalar(character.height)
    this.group.add(this.hips)
    this.hips.position.y = 0.92
    this.hips.add(this.torso)

    const pelvis = new THREE.Mesh(this.box(0.3 * width, 0.18, 0.2), pants)
    pelvis.position.y = -0.02
    this.hips.add(pelvis)

    const chest = new THREE.Mesh(this.box(0.38 * width, 0.42, 0.22), shirt)
    chest.position.y = 0.26
    this.torso.add(chest)

    const belly = new THREE.Mesh(this.box(0.32 * width, 0.16, 0.2), shirt)
    belly.position.y = 0.05
    this.torso.add(belly)

    // Pescoço e cabeça.
    const neck = new THREE.Mesh(this.cylinder(0.05, 0.1), skin)
    neck.position.y = 0.5
    this.torso.add(neck)

    this.head.position.y = 0.58
    this.torso.add(this.head)

    const skull = new THREE.Mesh(this.box(0.2, 0.24, 0.21), skin)
    this.head.add(skull)
    this.buildHair()

    // Braços: o direito toca sobre o corpo da guitarra, o esquerdo vai
    // para a escala.
    this.leftArm = this.buildLimb(shirt, skin, 0.34, 0.3, width)
    this.leftArm.root.position.set(-0.22 * width, 0.42, 0)
    this.torso.add(this.leftArm.root)

    this.rightArm = this.buildLimb(shirt, skin, 0.34, 0.3, width)
    this.rightArm.root.position.set(0.22 * width, 0.42, 0)
    this.torso.add(this.rightArm.root)

    this.leftLeg = this.buildLimb(pants, pants, 0.44, 0.42, width)
    this.leftLeg.root.position.set(-0.11 * width, -0.08, 0)
    this.hips.add(this.leftLeg.root)

    this.rightLeg = this.buildLimb(pants, pants, 0.44, 0.42, width)
    this.rightLeg.root.position.set(0.11 * width, -0.08, 0)
    this.hips.add(this.rightLeg.root)

    this.instrumentAnchor.position.set(0.02, 0.2, 0.2)
    this.torso.add(this.instrumentAnchor)
  }

  private material(color: number, roughness: number) {
    const material = new THREE.MeshStandardMaterial({ color, roughness })
    this.disposables.push(material)
    return material
  }

  private box(w: number, h: number, d: number) {
    const geometry = new THREE.BoxGeometry(w, h, d)
    this.disposables.push(geometry)
    return geometry
  }

  private cylinder(radius: number, height: number) {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 10)
    this.disposables.push(geometry)
    return geometry
  }

  /** Membro de dois segmentos: o inferior é filho do superior. */
  private buildLimb(
    upperMaterial: THREE.Material,
    lowerMaterial: THREE.Material,
    upperLength: number,
    lowerLength: number,
    width: number,
  ): Limb {
    const root = new THREE.Group()
    const thickness = 0.09 * width

    const upper = new THREE.Mesh(this.box(thickness, upperLength, thickness), upperMaterial)
    upper.position.y = -upperLength / 2
    root.add(upper)

    const lower = new THREE.Group()
    lower.position.y = -upperLength
    root.add(lower)

    const lowerMesh = new THREE.Mesh(
      this.box(thickness * 0.9, lowerLength, thickness * 0.9),
      lowerMaterial,
    )
    lowerMesh.position.y = -lowerLength / 2
    lower.add(lowerMesh)

    return { root, lower }
  }

  private buildHair() {
    const color = this.character.colors.hair
    const material = this.material(color, 0.9)

    switch (this.character.hair) {
      case 'bald':
        return
      case 'long': {
        const mane = new THREE.Mesh(this.box(0.24, 0.42, 0.26), material)
        mane.position.set(0, -0.06, -0.03)
        this.head.add(mane)
        break
      }
      case 'ponytail': {
        const cap = new THREE.Mesh(this.box(0.22, 0.12, 0.23), material)
        cap.position.y = 0.08
        this.head.add(cap)
        const tail = new THREE.Mesh(this.cylinder(0.04, 0.34), material)
        tail.position.set(0, -0.08, -0.15)
        tail.rotation.x = -0.35
        this.head.add(tail)
        break
      }
      case 'spiky': {
        for (let i = 0; i < 7; i++) {
          const spikeGeometry = new THREE.ConeGeometry(0.035, 0.16, 5)
          this.disposables.push(spikeGeometry)
          const spike = new THREE.Mesh(spikeGeometry, material)
          const angle = (i / 7) * Math.PI * 2
          spike.position.set(Math.cos(angle) * 0.07, 0.15, Math.sin(angle) * 0.07)
          spike.rotation.set(Math.sin(angle) * 0.5, 0, -Math.cos(angle) * 0.5)
          this.head.add(spike)
        }
        break
      }
      case 'mohawk': {
        for (let i = 0; i < 5; i++) {
          const spikeGeometry = new THREE.ConeGeometry(0.03, 0.2, 5)
          this.disposables.push(spikeGeometry)
          const spike = new THREE.Mesh(spikeGeometry, material)
          spike.position.set(0, 0.2, -0.06 + i * 0.03)
          this.head.add(spike)
        }
        break
      }
      case 'afro': {
        const geometry = new THREE.SphereGeometry(0.19, 14, 12)
        this.disposables.push(geometry)
        const afro = new THREE.Mesh(geometry, material)
        afro.position.y = 0.06
        this.head.add(afro)
        break
      }
    }
  }

  setState(state: PerformanceState) {
    this.state = state
  }

  /** Quanto o integrante está empolgado, de 0 a 1. */
  setIntensity(value: number) {
    this.intensity = value
  }

  /**
   * `beatPhase` vai de 0 a 1 dentro de cada batida da música. Amarrar a
   * animação nele é o que faz a banda parecer tocar a música, e não apenas
   * se mexer perto dela.
   */
  update(dt: number, beatPhase: number) {
    this.clock += dt

    const energy = this.character.energy * (0.35 + this.intensity * 0.65)
    const beat = Math.sin(beatPhase * Math.PI * 2)
    const halfBeat = Math.sin(beatPhase * Math.PI)
    const idle = Math.sin(this.clock * 1.6)

    const playing = this.state === 'playing' || this.state === 'solo' || this.state === 'starPower'
    const soloBoost = this.state === 'solo' ? 1.5 : this.state === 'starPower' ? 1.3 : 1

    if (this.state === 'failing') {
      // Ombros caídos e cabeça baixa: o corpo conta o que o medidor diz.
      this.approach(this.torso.rotation, 'x', 0.24, dt)
      this.approach(this.head.rotation, 'x', 0.35, dt)
      this.approach(this.hips.position, 'y', 0.88, dt)
      this.approach(this.leftArm.root.rotation, 'x', -0.3, dt)
      this.approach(this.rightArm.root.rotation, 'x', -0.2, dt)
      return
    }

    // Peso do corpo acompanhando a batida.
    const bounce = playing ? beat * 0.03 * energy * soloBoost : idle * 0.012
    this.approach(this.hips.position, 'y', 0.92 + bounce, dt, 12)
    this.hips.rotation.y = Math.sin(this.clock * 0.9) * 0.06 * energy
    this.torso.rotation.z = beat * 0.05 * energy * soloBoost
    this.approach(this.torso.rotation, 'x', playing ? -0.06 : 0, dt, 8)

    // Cabeça: balança na batida, olha para cima no solo.
    this.head.rotation.x = (playing ? -beat * 0.16 * energy : idle * 0.04) - (this.state === 'solo' ? 0.3 : 0)
    this.head.rotation.y = Math.sin(this.clock * 0.7) * 0.18

    // Mão direita: acompanha a batida sobre o corpo da guitarra.
    const pickSwing = playing ? -0.55 - halfBeat * 0.5 * energy * soloBoost : -0.2
    this.approach(this.rightArm.root.rotation, 'x', pickSwing, dt, 18)
    this.rightArm.root.rotation.z = -0.5
    this.approach(this.rightArm.lower.rotation, 'x', playing ? -0.7 : -0.3, dt, 10)

    // Mão da escala: sobe e desce o braço da guitarra.
    const fretPosition = playing ? Math.sin(this.clock * 3.1) * 0.3 : 0
    this.approach(this.leftArm.root.rotation, 'x', -1.05 + fretPosition * 0.2, dt, 10)
    this.leftArm.root.rotation.z = 0.75 + fretPosition * 0.25
    this.approach(this.leftArm.lower.rotation, 'x', -1.5, dt, 8)

    // Pernas: peso alternando, joelho dobrado no solo.
    const stance = playing ? 0.08 * energy : 0.02
    this.leftLeg.root.rotation.x = Math.sin(this.clock * 1.3) * stance - (this.state === 'solo' ? 0.25 : 0)
    this.rightLeg.root.rotation.x = -Math.sin(this.clock * 1.3) * stance
    this.leftLeg.lower.rotation.x = Math.abs(this.leftLeg.root.rotation.x) * 0.6
    this.rightLeg.lower.rotation.x = Math.abs(this.rightLeg.root.rotation.x) * 0.6
  }

  /** Interpolação exponencial: mesmo tempo de convergência a qualquer FPS. */
  private approach<T extends Record<K, number>, K extends string>(
    target: T,
    key: K,
    value: number,
    dt: number,
    rate = 10,
  ) {
    const k = 1 - Math.exp(-dt * rate)
    target[key] = (target[key] + (value - target[key]) * k) as T[K]
  }

  dispose() {
    for (const item of this.disposables) item.dispose()
  }
}
