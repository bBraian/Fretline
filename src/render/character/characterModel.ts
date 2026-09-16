/**
 * Um integrante da banda.
 *
 * Os membros são grupos aninhados — quadril contém tronco, que contém o
 * braço, que contém o antebraço — então girar um grupo leva junto tudo o que
 * vem depois, como um esqueleto de verdade. É pouco código, dá controle
 * direto sobre a pose, e evita depender de um arquivo de animação.
 *
 * As proporções seguem a regra de desenho de figura: a altura total dá umas
 * sete cabeças e meia, os ombros medem duas cabeças de largura, e o cotovelo
 * cai na linha da cintura. Errar isso é o que faz um boneco montado a partir
 * de primitivas parecer um boneco; acertar é metade do caminho para parecer
 * gente, mesmo com um corpo feito de cápsulas.
 *
 * A animação é escrita como soma de senoides em cima de uma pose de
 * repouso, com as fases amarradas à batida da música — é o que faz a banda
 * parecer tocar a música, e não apenas se mexer perto dela.
 */

import * as THREE from 'three'
import type { Character } from '../../content/characters'
import { solveTwoBone, type TwoBoneChain } from './ik'
import { mergeChildren } from '../mergeStatic'

export type PerformanceState = 'idle' | 'playing' | 'solo' | 'starPower' | 'failing'

/**
 * O que a pessoa está fazendo no palco.
 *
 * Não é enfeite: um baterista sentado com as mãos batendo para baixo e um
 * vocalista com o microfone na boca têm poses completamente diferentes de
 * quem segura uma guitarra. Animar os quatro com a mesma pose foi o que fez
 * a banda parecer quatro guitarristas, um deles atrás de uma bateria.
 */
export type StageRole = 'guitar' | 'bass' | 'drums' | 'vocals'

/** Altura de referência do corpo em unidades de mundo. */
const HEIGHT = 1.78

const HEAD = HEIGHT / 7.5

/**
 * Marcos anatômicos, em altura a partir do chão. São as medidas que um
 * manual de desenho de figura usa, e é delas que saem todas as posições
 * abaixo — nenhum número neste arquivo é escolhido a olho.
 */
const LEVEL = {
  crotch: 0.94,
  navel: 1.06,
  chest: 1.30,
  shoulder: 1.45,
  chin: 1.54,
  headCenter: 1.655,
  elbow: 1.10,
  wrist: 0.82,
  knee: 0.50,
  ankle: 0.09,
}

/**
 * Como a guitarra é pendurada. Fica aqui, e não na cena, porque as duas
 * mãos são posicionadas a partir destes números: se o instrumento muda de
 * ângulo, os alvos das mãos precisam acompanhar no mesmo lugar.
 */
export const GUITAR_TILT = 1.02
export const GUITAR_BODY_OFFSET = { x: 0.04, y: -0.03, z: 0.02 }
/** Distância do corpo da guitarra até o fim da escala, já em escala de mundo. */
export const GUITAR_NECK_REACH = 0.62

/**
 * Raio do crânio e profundidade da face.
 *
 * Todo traço do rosto é posicionado em relação a `FACE_Z`, e não em números
 * soltos: olhos, sobrancelhas e boca colocados por estimativa acabam
 * *dentro* da esfera da cabeça, onde ficam invisíveis sem dar erro nenhum.
 */
const SKULL_RADIUS = HEAD * 0.47
const FACE_Z = SKULL_RADIUS * 0.97

const UPPER_ARM = LEVEL.shoulder - LEVEL.elbow
const FOREARM = LEVEL.elbow - LEVEL.wrist
const THIGH = LEVEL.crotch - LEVEL.knee
const SHIN = LEVEL.knee - LEVEL.ankle

const BUILD = {
  slim: { width: 0.86, depth: 0.86, limb: 0.9 },
  regular: { width: 1, depth: 1, limb: 1 },
  heavy: { width: 1.2, depth: 1.18, limb: 1.14 },
} as const

interface Limb {
  root: THREE.Group
  lower: THREE.Group
  /** Extremidade: mão ou pé, já no fim do segmento inferior. */
  end: THREE.Group
}

export class CharacterModel {
  readonly group = new THREE.Group()
  readonly instrumentAnchor = new THREE.Group()
  /** Mão que fica sobre o corpo da guitarra, ou segura o microfone. */
  get pickHand() {
    return this.pickArm.end
  }
  /** Mão que corre a escala. */
  get fretHand() {
    return this.fretArm.end
  }

  private hips = new THREE.Group()
  private torso = new THREE.Group()
  private neck = new THREE.Group()
  private head = new THREE.Group()
  private jaw = new THREE.Group()
  /** Braço que corre a escala: fica do lado do braço da guitarra. */
  private fretArm!: Limb
  /** Braço que fica sobre o corpo da guitarra. */
  private pickArm!: Limb
  private fretLeg!: Limb
  private pickLeg!: Limb

  private fretChain!: TwoBoneChain
  private pickChain!: TwoBoneChain
  /** Alvos das mãos, em coordenadas do tronco. Reaproveitados a cada frame. */
  private fretTarget = new THREE.Vector3()
  private pickTarget = new THREE.Vector3()
  private elbowPole = new THREE.Vector3()

  private disposables: Array<{ dispose(): void }> = []
  private materials = new Map<string, THREE.MeshStandardMaterial>()
  private clock = 0
  private state: PerformanceState = 'idle'
  private role: StageRole = 'guitar'
  private intensity = 0

  constructor(private character: Character) {
    const build = BUILD[character.build]
    this.group.scale.setScalar(character.height)

    this.buildTorso(build)
    this.buildHead()
    this.buildArms(build)
    this.buildLegs(build)

    // A guitarra pendura na cintura, não no peito: a alça apoia no ombro,
    // mas o corpo do instrumento desce até a altura do quadril. Colocar o
    // ponto de apoio alto demais é o erro que faz o instrumento parecer
    // grande demais, mesmo estando na escala certa.
    this.instrumentAnchor.position.set(0, HEAD * 0.05, 0.14 * build.depth)
    this.torso.add(this.instrumentAnchor)

    // As peças de dentro de cada osso viram um desenho por material. Quatro
    // integrantes em cena passavam de duzentas chamadas de desenho, e era o
    // custo dominante do palco inteiro.
    mergeChildren(this.group)
  }

  // --- materiais ---------------------------------------------------------

  private material(key: string, color: number, roughness = 0.75, metalness = 0) {
    const existing = this.materials.get(key)
    if (existing) return existing
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness })
    this.materials.set(key, material)
    this.disposables.push(material)
    return material
  }

  private get skin() {
    return this.material('skin', this.character.colors.skin, 0.82)
  }

  private track<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item)
    return item
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
    const mesh = new THREE.Mesh(this.track(geometry), material)
    mesh.castShadow = true
    return mesh
  }

  /**
 * Calota de cabelo: uma esfera recortada que cobre do alto até a nuca, mas
 * deixa a frente do rosto livre. Uma esfera inteira do tamanho da cabeça
 * engole olhos, nariz e boca — e como nada disso dá erro, o personagem
 * simplesmente sai sem rosto.
 */
private scalp(radius: number, material: THREE.Material, coverage = 0.78) {
    const gap = (1 - coverage) * Math.PI
    return this.mesh(
      new THREE.SphereGeometry(radius, 22, 16, gap, Math.PI * 2 - gap * 2, 0, Math.PI * 0.72),
      material,
    )
  }

  /** Cápsula achatada: a forma que mais se aproxima de um membro humano. */
  private segment(radius: number, length: number, material: THREE.Material, flatten = 0.8) {
    const mesh = this.mesh(new THREE.CapsuleGeometry(radius, length, 6, 14), material)
    mesh.scale.z = flatten
    return mesh
  }

  // --- tronco ------------------------------------------------------------

  private buildTorso(build: (typeof BUILD)[keyof typeof BUILD]) {
    const c = this.character.colors
    const top = this.material('top', c.top, 0.78)
    const trim = this.material('trim', c.topTrim, 0.6)
    const legs = this.material('legs', c.legs, 0.85)

    this.group.add(this.hips)
    this.hips.position.y = LEVEL.crotch
    this.hips.add(this.torso)

    const pelvis = this.mesh(new THREE.CapsuleGeometry(0.145 * build.width, 0.08, 5, 14), legs)
    pelvis.rotation.z = Math.PI / 2
    pelvis.scale.set(1, 1, 0.8)
    pelvis.position.y = 0.02
    this.hips.add(pelvis)

    // Caixa torácica: o volume vai do umbigo ao ombro, e é mais largo do
    // que fundo — uma cápsula achatada em Z, não um cilindro.
    const chestHalf = 0.17 * build.width
    // Com top curto, o tronco é pele: o tecido são só as conchas.
    const torsoMaterial = this.character.top === 'bra' ? this.skin : top
    const chest = this.mesh(new THREE.CapsuleGeometry(chestHalf, 0.05, 6, 18), torsoMaterial)
    chest.scale.set(1, 1, 0.66 * build.depth)
    chest.position.y = LEVEL.chest - LEVEL.crotch
    this.torso.add(chest)

    const waist = this.mesh(new THREE.CapsuleGeometry(0.132 * build.width, 0.05, 5, 16), torsoMaterial)
    waist.scale.set(1, 1, 0.72 * build.depth)
    waist.position.y = LEVEL.navel - LEVEL.crotch
    this.torso.add(waist)

    // Trapézio: o volume que liga o pescoço aos ombros. Sem ele a cabeça
    // parece espetada num tronco reto.
    const traps = this.mesh(
      new THREE.CapsuleGeometry(0.075 * build.width, 0.18 * build.width, 5, 12),
      torsoMaterial,
    )
    traps.rotation.z = Math.PI / 2
    traps.scale.set(1, 1, 0.8)
    traps.position.y = LEVEL.shoulder - LEVEL.crotch - 0.02
    this.torso.add(traps)

    if (this.character.top === 'bra') {
      // Top curto: duas conchas e as alças. O tronco fica com a cor da pele,
      // trocada logo acima.
      const cup = this.material('top', c.top, 0.6)
      for (const side of [-1, 1]) {
        const shell = this.mesh(new THREE.SphereGeometry(0.075 * build.width, 14, 12), cup)
        shell.scale.set(1.15, 0.9, 0.72)
        shell.position.set(
          side * 0.075 * build.width,
          LEVEL.chest - LEVEL.crotch + 0.02,
          0.1 * build.depth,
        )
        this.torso.add(shell)

        const strap = this.mesh(new THREE.BoxGeometry(0.028, 0.2, 0.02), cup)
        strap.position.set(
          side * 0.13 * build.width,
          LEVEL.chest - LEVEL.crotch + 0.11,
          0.06 * build.depth,
        )
        strap.rotation.z = side * 0.3
        this.torso.add(strap)
      }

      const band = this.mesh(new THREE.CapsuleGeometry(0.15 * build.width, 0.03, 4, 14), cup)
      band.rotation.z = Math.PI / 2
      band.scale.set(1, 1, 0.68 * build.depth)
      band.position.y = LEVEL.chest - LEVEL.crotch - 0.04
      this.torso.add(band)
    }

    if (this.character.top === 'tank') {
      for (const side of [-1, 1]) {
        const shoulder = this.mesh(new THREE.SphereGeometry(0.068 * build.width, 14, 12), this.skin)
        shoulder.position.set(side * 0.2 * build.width, LEVEL.shoulder - LEVEL.crotch, 0)
        this.torso.add(shoulder)
      }
    }

    if (this.character.top === 'jacket' || this.character.top === 'vest') {
      for (const side of [-1, 1]) {
        const lapel = this.mesh(new THREE.BoxGeometry(0.085, 0.24, 0.02), trim)
        lapel.position.set(
          side * 0.075 * build.width,
          LEVEL.chest - LEVEL.crotch + 0.04,
          0.115 * build.depth,
        )
        lapel.rotation.z = side * 0.2
        lapel.rotation.y = side * -0.35
        this.torso.add(lapel)
      }
    }

    if (this.character.top === 'shirt') {
      const collar = this.mesh(new THREE.TorusGeometry(0.085 * build.width, 0.02, 8, 20), trim)
      collar.rotation.x = Math.PI / 2
      collar.position.y = LEVEL.shoulder - LEVEL.crotch + 0.03
      this.torso.add(collar)

      const placket = this.mesh(new THREE.BoxGeometry(0.026, 0.3, 0.02), trim)
      placket.position.set(0, LEVEL.chest - LEVEL.crotch, 0.112 * build.depth)
      this.torso.add(placket)
    }

    if (this.character.accessories.belt) {
      const belt = this.mesh(
        new THREE.CapsuleGeometry(0.138 * build.width, 0.05, 4, 16),
        this.material('belt', 0x1a1418, 0.6),
      )
      belt.rotation.z = Math.PI / 2
      belt.scale.set(1, 1, 0.76 * build.depth)
      belt.position.y = 0.06
      this.torso.add(belt)

      const metal = this.material('metal', c.accent, 0.25, 0.85)
      const buckle = this.mesh(new THREE.BoxGeometry(0.055, 0.04, 0.02), metal)
      buckle.position.set(0, 0.06, 0.108 * build.depth)
      this.torso.add(buckle)

      if (this.character.accessories.studs) {
        // Fileira de tachas em volta do cinto. É o detalhe que transforma
        // uma tira escura num cinto de rock, e quase não custa geometria.
        const studGeometry = new THREE.ConeGeometry(0.012, 0.022, 6)
        for (let i = 0; i < 22; i++) {
          const angle = (i / 22) * Math.PI * 2
          const stud = this.mesh(studGeometry.clone(), metal)
          stud.position.set(
            Math.sin(angle) * 0.142 * build.width,
            0.06,
            Math.cos(angle) * 0.108 * build.depth,
          )
          stud.rotation.z = -Math.sin(angle) * 1.3
          stud.rotation.x = Math.cos(angle) * 1.3
          this.torso.add(stud)
        }
      }
    }
  }

  // --- cabeça ------------------------------------------------------------

  private buildHead() {
    const c = this.character.colors

    this.neck.position.y = LEVEL.shoulder - LEVEL.crotch
    this.torso.add(this.neck)

    const neckMesh = this.mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.12, 12), this.skin)
    neckMesh.position.y = 0.05
    this.neck.add(neckMesh)

    this.head.position.y = LEVEL.headCenter - LEVEL.shoulder
    this.neck.add(this.head)

    // Crânio: esfera alongada, achatada nas laterais e atrás. O raio sai da
    // altura da cabeça, que por definição é uma unidade HEAD.
    const skull = this.mesh(new THREE.SphereGeometry(SKULL_RADIUS, 22, 18), this.skin)
    skull.scale.set(0.9, 1.04, 0.97)
    skull.position.y = HEAD * 0.06
    this.head.add(skull)

    // Maxilar: um pouco mais estreito, embaixo e à frente do crânio.
    this.jaw.position.set(0, -HEAD * 0.12, 0.01)
    this.head.add(this.jaw)
    const jawMesh = this.mesh(new THREE.SphereGeometry(HEAD * 0.38, 18, 14), this.skin)
    jawMesh.scale.set(0.88, 0.78, 1.0)
    this.jaw.add(jawMesh)

    for (const side of [-1, 1]) {
      const ear = this.mesh(new THREE.SphereGeometry(HEAD * 0.09, 10, 8), this.skin)
      ear.scale.set(0.45, 1, 0.75)
      ear.position.set(side * HEAD * 0.43, HEAD * 0.02, -0.005)
      this.head.add(ear)
    }

    this.buildFace()
    this.buildHair()

    if (this.character.accessories.choker) {
      const chokerMaterial = this.material('choker', 0x16161c, 0.7)
      const band = this.mesh(new THREE.TorusGeometry(0.058, 0.014, 8, 20), chokerMaterial)
      band.rotation.x = Math.PI / 2
      band.position.y = 0.03
      this.neck.add(band)

      const pendant = this.mesh(
        new THREE.OctahedronGeometry(0.022),
        this.material('metal', this.character.colors.accent, 0.25, 0.85),
      )
      pendant.position.set(0, -0.02, 0.055)
      this.neck.add(pendant)
    }

    if (this.character.beard > 0.05) {
      const beard = this.mesh(
        new THREE.SphereGeometry(HEAD * 0.33, 16, 12),
        this.material('hair', c.hair, 0.95),
      )
      beard.scale.set(0.92, 0.5 + this.character.beard * 0.75, 0.92)
      beard.position.set(0, -HEAD * (0.2 + this.character.beard * 0.14), 0.012)
      this.jaw.add(beard)
    }
  }

  private buildFace() {
    const eyeWhite = this.material('eyeWhite', 0xf4f1ea, 0.35)
    const pupil = this.material('pupil', 0x14100e, 0.3)
    const hair = this.material('hair', this.character.colors.hair, 0.95)

    for (const side of [-1, 1]) {
      const eye = this.mesh(new THREE.SphereGeometry(HEAD * 0.075, 12, 10), eyeWhite)
      eye.scale.set(1, 0.72, 0.6)
      eye.position.set(side * HEAD * 0.16, HEAD * 0.06, FACE_Z * 0.86)
      this.head.add(eye)

      const iris = this.mesh(new THREE.SphereGeometry(HEAD * 0.038, 10, 8), pupil)
      iris.position.set(side * HEAD * 0.16, HEAD * 0.055, FACE_Z * 0.96)
      this.head.add(iris)

      // Sobrancelhas inclinadas para dentro: é o que dá a cara de
      // concentração que se espera de alguém no meio de um solo.
      const brow = this.mesh(new THREE.BoxGeometry(HEAD * 0.17, HEAD * 0.035, HEAD * 0.05), hair)
      brow.position.set(side * HEAD * 0.16, HEAD * 0.17, FACE_Z * 0.92)
      brow.rotation.z = side * -0.18
      this.head.add(brow)
    }

    const nose = this.mesh(new THREE.ConeGeometry(HEAD * 0.06, HEAD * 0.16, 6), this.skin)
    nose.rotation.x = Math.PI / 2
    nose.position.set(0, -HEAD * 0.02, FACE_Z * 0.95)
    this.head.add(nose)

    const mouth = this.mesh(
      new THREE.CapsuleGeometry(HEAD * 0.035, HEAD * 0.11, 4, 8),
      this.material('mouth', 0x7a3a3a, 0.6),
    )
    mouth.rotation.z = Math.PI / 2
    mouth.scale.z = 0.4
    mouth.position.set(0, -HEAD * 0.12, FACE_Z * 0.86)
    this.jaw.add(mouth)

    if (this.character.accessories.sunglasses) {
      const frame = this.material('frame', 0x0e0e12, 0.3, 0.4)
      for (const side of [-1, 1]) {
        const lens = this.mesh(new THREE.BoxGeometry(HEAD * 0.2, HEAD * 0.14, HEAD * 0.03), frame)
        lens.position.set(side * HEAD * 0.16, HEAD * 0.06, FACE_Z * 1.0)
        this.head.add(lens)

        const arm = this.mesh(new THREE.BoxGeometry(HEAD * 0.05, HEAD * 0.03, HEAD * 0.34), frame)
        arm.position.set(side * HEAD * 0.4, HEAD * 0.08, FACE_Z * 0.5)
        this.head.add(arm)
      }
      const bridge = this.mesh(new THREE.BoxGeometry(HEAD * 0.12, HEAD * 0.03, HEAD * 0.03), frame)
      bridge.position.set(0, HEAD * 0.09, FACE_Z * 1.0)
      this.head.add(bridge)
    }
  }

  private buildHair() {
    const c = this.character.colors
    const hair = this.material('hair', c.hair, 0.95)

    if (this.character.accessories.topHat) {
      // Cartola: copa, aba e uma fita com fivelas. Vai antes do cabelo para
      // os cachos poderem escapar por baixo dela.
      const feltMaterial = this.material('felt', 0x1a1a1f, 0.95)
      const crown = this.mesh(new THREE.CylinderGeometry(HEAD * 0.46, HEAD * 0.48, HEAD * 0.72, 22), feltMaterial)
      crown.position.y = HEAD * 0.62
      this.head.add(crown)

      const brim = this.mesh(new THREE.CylinderGeometry(HEAD * 0.78, HEAD * 0.78, HEAD * 0.05, 26), feltMaterial)
      brim.position.y = HEAD * 0.28
      this.head.add(brim)

      const band = this.mesh(
        new THREE.CylinderGeometry(HEAD * 0.49, HEAD * 0.49, HEAD * 0.16, 22),
        this.material('hatband', 0x2c2c33, 0.7),
      )
      band.position.y = HEAD * 0.34
      this.head.add(band)

      // Fivelas presas à fita, em volta da copa.
      const conchoMaterial = this.material('metal', c.accent, 0.25, 0.85)
      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2
        const concho = this.mesh(new THREE.CylinderGeometry(HEAD * 0.06, HEAD * 0.06, HEAD * 0.03, 12), conchoMaterial)
        concho.rotation.z = Math.PI / 2
        concho.rotation.y = -angle
        concho.position.set(Math.cos(angle) * HEAD * 0.5, HEAD * 0.34, Math.sin(angle) * HEAD * 0.5)
        this.head.add(concho)
      }
    }

    if (this.character.accessories.beanie) {
      const beanie = this.scalp(SKULL_RADIUS * 1.12, this.material('beanie', c.accent, 0.9), 0.9)
      beanie.scale.set(1, 0.9, 1)
      beanie.position.y = HEAD * 0.1
      this.head.add(beanie)

      const brim = this.mesh(new THREE.TorusGeometry(SKULL_RADIUS * 1.04, HEAD * 0.06, 8, 22), this.material('beanie', c.accent, 0.9))
      brim.rotation.x = Math.PI / 2
      brim.position.y = HEAD * 0.12
      this.head.add(brim)
      return
    }

    switch (this.character.hair) {
      case 'bald':
        return

      case 'buzz': {
        const cap = this.scalp(SKULL_RADIUS * 1.03, hair, 0.9)
        cap.scale.set(0.96, 1.02, 1)
        cap.position.y = HEAD * 0.1
        this.head.add(cap)
        break
      }

      case 'long': {
        const cap = this.scalp(SKULL_RADIUS * 1.06, hair, 0.82)
        cap.scale.set(0.98, 1.02, 1)
        cap.position.y = HEAD * 0.1
        this.head.add(cap)

        // A juba cai atrás dos ombros: uma cápsula larga inclinada.
        const mane = this.mesh(new THREE.CapsuleGeometry(HEAD * 0.34, HEAD * 0.7, 6, 16), hair)
        mane.scale.set(1, 1, 0.55)
        mane.position.set(0, -HEAD * 0.42, -HEAD * 0.16)
        this.head.add(mane)
        break
      }

      case 'ponytail': {
        const cap = this.scalp(SKULL_RADIUS * 1.05, hair, 0.84)
        cap.position.y = HEAD * 0.12
        this.head.add(cap)

        const tail = this.mesh(new THREE.CapsuleGeometry(HEAD * 0.11, HEAD * 0.6, 5, 12), hair)
        tail.position.set(0, -HEAD * 0.3, -HEAD * 0.42)
        tail.rotation.x = -0.4
        this.head.add(tail)
        break
      }

      case 'spiky': {
        const cap = this.scalp(SKULL_RADIUS * 1.04, hair, 0.86)
        cap.position.y = HEAD * 0.1
        this.head.add(cap)

        for (let i = 0; i < 11; i++) {
          const spike = this.mesh(new THREE.ConeGeometry(HEAD * 0.07, HEAD * 0.34, 5), hair)
          const angle = (i / 11) * Math.PI * 2
          const ring = i % 2 === 0 ? 0.2 : 0.1
          spike.position.set(
            Math.cos(angle) * HEAD * ring,
            HEAD * (0.38 + (i % 3) * 0.04),
            Math.sin(angle) * HEAD * ring,
          )
          spike.rotation.set(Math.sin(angle) * 0.65, 0, -Math.cos(angle) * 0.65)
          this.head.add(spike)
        }
        break
      }

      case 'mohawk': {
        const sides = this.scalp(SKULL_RADIUS * 1.02, this.material('shaved', c.hair, 0.95), 0.88)
        sides.scale.set(1, 0.9, 1)
        sides.position.y = HEAD * 0.08
        this.head.add(sides)

        for (let i = 0; i < 7; i++) {
          const spike = this.mesh(new THREE.ConeGeometry(HEAD * 0.06, HEAD * 0.46, 5), hair)
          spike.position.set(0, HEAD * 0.5, HEAD * (0.22 - i * 0.075))
          spike.rotation.x = (i - 3) * 0.08
          this.head.add(spike)
        }
        break
      }

      case 'afro': {
        const afro = this.scalp(SKULL_RADIUS * 1.42, hair, 0.72)
        afro.scale.set(1, 0.92, 1)
        afro.position.y = HEAD * 0.04
        this.head.add(afro)
        break
      }

      case 'bob': {
        const cap = this.scalp(SKULL_RADIUS * 1.1, hair, 0.8)
        cap.scale.set(1, 1.02, 1)
        cap.position.y = HEAD * 0.1
        this.head.add(cap)

        const bottom = this.mesh(new THREE.CylinderGeometry(HEAD * 0.48, HEAD * 0.44, HEAD * 0.4, 18, 1, true), hair)
        bottom.position.y = -HEAD * 0.12
        this.head.add(bottom)
        break
      }

      case 'curtain': {
        // Liso e comprido, repartido no meio: a calota cobre a cabeça e duas
        // mechas caem na frente dos ombros, deixando só parte do rosto à
        // mostra. É o corte que mais define a silhueta de quem toca com a
        // cabeça baixa.
        const cap = this.scalp(SKULL_RADIUS * 1.06, hair, 0.86)
        cap.scale.set(0.98, 1.04, 1)
        cap.position.y = HEAD * 0.1
        this.head.add(cap)

        for (const side of [-1, 1]) {
          const strand = this.mesh(
            new THREE.BoxGeometry(HEAD * 0.2, HEAD * 1.05, HEAD * 0.12),
            hair,
          )
          strand.position.set(side * HEAD * 0.3, -HEAD * 0.42, HEAD * 0.16)
          strand.rotation.z = side * -0.08
          this.head.add(strand)
        }

        // Franja: uma placa fina descendo pela testa até a altura dos olhos.
        const fringe = this.mesh(new THREE.BoxGeometry(HEAD * 0.56, HEAD * 0.4, HEAD * 0.1), hair)
        fringe.position.set(0, HEAD * 0.16, FACE_Z * 0.78)
        fringe.rotation.x = -0.12
        this.head.add(fringe)

        const back = this.mesh(new THREE.BoxGeometry(HEAD * 0.62, HEAD * 1.0, HEAD * 0.2), hair)
        back.position.set(0, -HEAD * 0.34, -HEAD * 0.2)
        this.head.add(back)
        break
      }

      case 'curls': {
        // Massa de cachos: esferas sobrepostas em volta e abaixo da cabeça.
        // Uma esfera só daria um capacete; o que faz parecer cabelo é a
        // irregularidade do contorno.
        const cap = this.scalp(SKULL_RADIUS * 1.12, hair, 0.8)
        cap.position.y = HEAD * 0.08
        this.head.add(cap)

        for (let i = 0; i < 16; i++) {
          const angle = (i / 16) * Math.PI * 2
          const ring = 0.42 + (i % 3) * 0.06
          const puff = this.mesh(new THREE.SphereGeometry(HEAD * (0.2 + (i % 4) * 0.035), 10, 8), hair)
          puff.position.set(
            Math.cos(angle) * HEAD * ring,
            -HEAD * (0.05 + (i % 5) * 0.11),
            Math.sin(angle) * HEAD * ring - HEAD * 0.05,
          )
          this.head.add(puff)
        }
        break
      }

      case 'dreads': {
        const cap = this.scalp(SKULL_RADIUS * 1.06, hair, 0.82)
        cap.position.y = HEAD * 0.1
        this.head.add(cap)

        for (let i = 0; i < 14; i++) {
          const strand = this.mesh(new THREE.CapsuleGeometry(HEAD * 0.055, HEAD * 0.5, 4, 8), hair)
          const angle = (i / 14) * Math.PI * 2
          strand.position.set(
            Math.cos(angle) * HEAD * 0.36,
            -HEAD * (0.16 + (i % 3) * 0.08),
            Math.sin(angle) * HEAD * 0.32 - HEAD * 0.06,
          )
          strand.rotation.set(Math.sin(angle) * 0.2, 0, -Math.cos(angle) * 0.25)
          this.head.add(strand)
        }
        break
      }
    }
  }

  // --- membros -----------------------------------------------------------

  private buildLimb(options: {
    upperMaterial: THREE.Material
    lowerMaterial: THREE.Material
    upperLength: number
    lowerLength: number
    radius: number
    jointMaterial: THREE.Material
  }): Limb {
    const { upperMaterial, lowerMaterial, upperLength, lowerLength, radius, jointMaterial } = options

    const root = new THREE.Group()

    const shoulder = this.mesh(new THREE.SphereGeometry(radius * 1.12, 12, 10), jointMaterial)
    root.add(shoulder)

    const upper = this.segment(radius, upperLength - radius * 2, upperMaterial)
    upper.position.y = -upperLength / 2
    root.add(upper)

    const lower = new THREE.Group()
    lower.position.y = -upperLength
    root.add(lower)

    // Articulação: uma esfera no cotovelo ou joelho esconde a emenda entre
    // os dois segmentos, que de outro modo aparece como um degrau ao dobrar.
    const joint = this.mesh(new THREE.SphereGeometry(radius * 1.02, 12, 10), jointMaterial)
    lower.add(joint)

    const lowerMesh = this.segment(radius * 0.86, lowerLength - radius * 1.6, lowerMaterial)
    lowerMesh.position.y = -lowerLength / 2
    lower.add(lowerMesh)

    const end = new THREE.Group()
    end.position.y = -lowerLength
    lower.add(end)

    return { root, lower, end }
  }

  private buildArms(build: (typeof BUILD)[keyof typeof BUILD]) {
    const c = this.character.colors
    // Quem usa regata, colete ou top curto está de braços de fora.
    const sleeveless =
      this.character.top === 'tank' ||
      this.character.top === 'vest' ||
      this.character.top === 'bra'
    const sleeve = sleeveless ? this.skin : this.material('top', c.top, 0.78)
    const forearmMaterial = this.character.top === 'shirt' ? this.material('top', c.top, 0.78) : this.skin

    const radius = 0.048 * build.limb

    for (const side of [-1, 1] as const) {
      const limb = this.buildLimb({
        upperMaterial: sleeve,
        lowerMaterial: forearmMaterial,
        upperLength: UPPER_ARM,
        lowerLength: FOREARM,
        radius,
        jointMaterial: sleeveless ? this.skin : sleeve,
      })
      limb.root.position.set(side * 0.2 * build.width, LEVEL.shoulder - LEVEL.crotch, 0)

      // Mão: palma achatada mais o polegar. Não são dedos, mas dá a
      // silhueta certa contra o braço da guitarra.
      const palm = this.mesh(new THREE.BoxGeometry(radius * 1.8, radius * 2.2, radius * 0.95), this.skin)
      palm.position.y = -radius * 1.1
      limb.end.add(palm)

      const thumb = this.mesh(new THREE.CapsuleGeometry(radius * 0.32, radius * 0.75, 4, 8), this.skin)
      thumb.position.set(-side * radius * 0.95, -radius * 0.75, radius * 0.35)
      thumb.rotation.z = side * 0.6
      limb.end.add(thumb)

      if (this.character.accessories.armband) {
        const band = this.mesh(
          new THREE.CylinderGeometry(radius * 1.14, radius * 1.14, radius * 1.4, 14),
          this.material('armband', 0x1a1a20, 0.75),
        )
        band.position.y = -UPPER_ARM * 0.45
        limb.root.add(band)
      }

      if (this.character.accessories.armWarmer) {
        // Meia-luva comprida cobrindo o antebraço inteiro, num tecido
        // diferente da pele.
        const warmer = this.mesh(
          new THREE.CapsuleGeometry(radius * 0.96, FOREARM - radius * 1.4, 5, 12),
          this.material('warmer', c.topTrim, 0.85),
        )
        warmer.scale.z = 0.82
        warmer.position.y = -FOREARM / 2
        limb.lower.add(warmer)
      }

      if (this.character.accessories.wristband) {
        const band = this.mesh(
          new THREE.CylinderGeometry(radius * 1.08, radius * 1.08, radius * 1.2, 12),
          this.material('accent', c.accent, 0.7),
        )
        band.position.y = radius * 0.25
        limb.end.add(band)
      }

      this.torso.add(limb.root)
      // A guitarra é segurada com o braço apontando para +X, então é a mão
      // desse lado que corre a escala.
      if (side > 0) this.fretArm = limb
      else this.pickArm = limb
    }

    this.fretChain = { ...this.fretArm, upperLength: UPPER_ARM, lowerLength: FOREARM }
    this.pickChain = { ...this.pickArm, upperLength: UPPER_ARM, lowerLength: FOREARM }
  }

  private buildLegs(build: (typeof BUILD)[keyof typeof BUILD]) {
    const c = this.character.colors
    const trousers = this.material('legs', c.legs, 0.85)
    const shoeMaterial = this.material('shoes', c.shoes, 0.6)

    const radius = 0.072 * build.limb

    if (this.character.legs === 'skirt') {
      const skirt = this.mesh(new THREE.CylinderGeometry(0.16 * build.width, 0.24 * build.width, 0.3, 20, 1, true), trousers)
      skirt.position.y = -0.14
      this.hips.add(skirt)
    }

    for (const side of [-1, 1] as const) {
      const bare = this.character.legs === 'skirt'
      const limb = this.buildLimb({
        upperMaterial: bare ? this.skin : trousers,
        lowerMaterial: bare ? this.skin : trousers,
        upperLength: THIGH,
        lowerLength: SHIN,
        radius,
        jointMaterial: bare ? this.skin : trousers,
      })
      limb.root.position.set(side * 0.1 * build.width, -0.02, 0)

      const bootHeight = this.character.shoes === 'boots' ? radius * 3.2 : radius * 1.3
      const shaft = this.mesh(
        new THREE.CylinderGeometry(radius * 0.95, radius * 1.05, bootHeight, 12),
        shoeMaterial,
      )
      shaft.position.y = bootHeight / 2 - radius * 0.2
      limb.end.add(shaft)

      const foot = this.mesh(
        new THREE.BoxGeometry(radius * 1.7, radius * 0.8, radius * 3.4),
        shoeMaterial,
      )
      foot.position.set(0, -radius * 0.5, radius * 1.0)
      limb.end.add(foot)

      if (this.character.shoes === 'sneakers') {
        const sole = this.mesh(
          new THREE.BoxGeometry(radius * 1.8, radius * 0.3, radius * 3.5),
          this.material('sole', 0xe8e8ea, 0.7),
        )
        sole.position.set(0, -radius * 0.88, radius * 1.0)
        limb.end.add(sole)
      }

      this.hips.add(limb.root)
      if (side > 0) this.fretLeg = limb
      else this.pickLeg = limb
    }
  }

  // --- animação ----------------------------------------------------------

  setState(state: PerformanceState) {
    this.state = state
  }

  setRole(role: StageRole) {
    this.role = role
    // O baterista senta: o quadril desce e as pernas vão para a frente.
    if (role === 'drums') this.group.position.y = 0
  }

  /** Quanto o integrante está empolgado, de 0 a 1. */
  setIntensity(value: number) {
    this.intensity = value
  }

  /**
   * `beatPhase` vai de 0 a 1 dentro de cada batida da música.
   */
  update(dt: number, beatPhase: number) {
    this.clock += dt

    const energy = this.character.energy * (0.35 + this.intensity * 0.65)
    const beat = Math.sin(beatPhase * Math.PI * 2)
    const halfBeat = Math.sin(beatPhase * Math.PI)
    const idle = Math.sin(this.clock * 1.6)
    const playing = this.state === 'playing' || this.state === 'solo' || this.state === 'starPower'
    const boost = this.state === 'solo' ? 1.5 : this.state === 'starPower' ? 1.3 : 1

    if (this.state === 'failing') {
      this.approach(this.torso.rotation, 'x', 0.26, dt)
      this.approach(this.neck.rotation, 'x', 0.4, dt)
      this.approach(this.hips.position, 'y', HEIGHT * 0.5, dt)
      this.approach(this.fretArm.root.rotation, 'x', -0.3, dt)
      this.approach(this.pickArm.root.rotation, 'x', -0.2, dt)
      this.approach(this.jaw.position, 'y', -HEAD * 0.12, dt)
      return
    }

    // Peso do corpo acompanhando a batida.
    const bounce = playing ? beat * 0.03 * energy * boost : idle * 0.012
    this.approach(this.hips.position, 'y', HEIGHT * 0.52 + bounce, dt, 12)
    this.hips.rotation.y = Math.sin(this.clock * 0.9) * 0.07 * energy
    this.torso.rotation.z = beat * 0.05 * energy * boost
    this.approach(this.torso.rotation, 'x', playing ? -0.06 : 0, dt, 8)

    // Cabeça: balança na batida, e joga para trás no solo.
    this.neck.rotation.x =
      (playing ? -beat * 0.16 * energy : idle * 0.04) - (this.state === 'solo' ? 0.34 : 0)
    this.neck.rotation.y = Math.sin(this.clock * 0.7) * 0.2
    this.neck.rotation.z = Math.cos(this.clock * 0.55) * 0.06

    // Boca aberta no solo e no star power: cantar junto é involuntário.
    const openMouth = this.state === 'solo' || this.state === 'starPower' ? HEAD * 0.06 : 0
    this.approach(this.jaw.position, 'y', -HEAD * 0.12 - openMouth, dt, 9)

    if (this.role === 'drums') this.poseDrums(dt, beatPhase, energy, boost)
    else if (this.role === 'vocals') this.poseVocals(dt, beatPhase, energy, playing)
    else this.poseStrings(playing, halfBeat, energy, boost)

    if (this.role === 'drums') {
      // Sentado: coxas para a frente, joelhos dobrados, pés no pedal.
      for (const leg of [this.fretLeg, this.pickLeg]) {
        this.approach(leg.root.rotation, 'x', -1.32, dt, 8)
        this.approach(leg.lower.rotation, 'x', 1.15, dt, 8)
        leg.end.rotation.x = 0.2
      }
      // O pé do bumbo bate na batida.
      this.pickLeg.end.rotation.x = 0.2 - Math.max(0, Math.cos(beatPhase * Math.PI * 2)) * 0.35
      this.approach(this.hips.position, 'y', LEVEL.crotch * 0.62, dt, 8)
      return
    }

    // Pernas: peso alternando, joelho dobrado no solo.
    const stance = playing ? 0.1 * energy : 0.02
    const sway = Math.sin(this.clock * 1.3)
    this.fretLeg.root.rotation.x = sway * stance - (this.state === 'solo' ? 0.28 : 0)
    this.pickLeg.root.rotation.x = -sway * stance
    this.fretLeg.root.rotation.z = 0.06
    this.pickLeg.root.rotation.z = -0.06
    this.fretLeg.lower.rotation.x = Math.abs(this.fretLeg.root.rotation.x) * 0.7
    this.pickLeg.lower.rotation.x = Math.abs(this.pickLeg.root.rotation.x) * 0.7
    this.fretLeg.end.rotation.x = -this.fretLeg.lower.rotation.x * 0.8
    this.pickLeg.end.rotation.x = -this.pickLeg.lower.rotation.x * 0.8
  }

  /** Pose de quem segura um instrumento de cordas. */
  private poseStrings(playing: boolean, halfBeat: number, energy: number, boost: number) {
    // As mãos são posicionadas, não anguladas: os alvos abaixo dizem onde
    // elas precisam estar sobre a guitarra, e a cinemática inversa resolve
    // ombro e cotovelo. Escolher os ângulos à mão dava braços cruzados.
    const anchor = this.instrumentAnchor.position

    // Mão da escala: corre ao longo do braço da guitarra, cuja direção sai
    // da pose do instrumento e não de números soltos.
    const slide = playing ? Math.sin(this.clock * 2.2) * 0.5 + 0.5 : 0.4
    const along = GUITAR_NECK_REACH * (0.62 + slide * 0.32)
    this.fretTarget.set(
      anchor.x + GUITAR_BODY_OFFSET.x + Math.sin(GUITAR_TILT) * along,
      anchor.y + GUITAR_BODY_OFFSET.y + Math.cos(GUITAR_TILT) * along,
      anchor.z + GUITAR_BODY_OFFSET.z + 0.07,
    )
    this.elbowPole.set(0.25, -1, -0.55)
    solveTwoBone(this.fretChain, this.fretTarget, this.elbowPole)
    this.fretArm.end.rotation.set(0.25, 0, -1.0)

    // Mão da palheta: sobe e desce sobre o corpo da guitarra.
    const stroke = playing ? halfBeat * 0.075 * energy * boost : 0
    this.pickTarget.set(
      anchor.x + GUITAR_BODY_OFFSET.x + 0.04,
      anchor.y + GUITAR_BODY_OFFSET.y + 0.02 + stroke,
      anchor.z + GUITAR_BODY_OFFSET.z + 0.1,
    )
    this.elbowPole.set(-0.9, -0.45, -0.6)
    solveTwoBone(this.pickChain, this.pickTarget, this.elbowPole)
    this.pickArm.end.rotation.set(-0.55, 0, 0.45)
  }

  /**
   * Baterista: as duas mãos batem para baixo, alternadas, meio compasso
   * fora de fase uma da outra — que é como qualquer levada básica funciona.
   */
  private poseDrums(dt: number, beatPhase: number, energy: number, boost: number) {
    const swing = 0.16 + energy * 0.12 * boost

    // A mão direita marca o chimbal (toda batida), a esquerda a caixa
    // (contratempo): alturas e fases diferentes.
    const hat = Math.max(0, Math.cos(beatPhase * Math.PI * 2))
    const snare = Math.max(0, Math.cos((beatPhase + 0.5) * Math.PI * 2))

    this.pickTarget.set(-0.34, 0.2 + hat * swing, 0.34)
    this.elbowPole.set(-1, -0.3, -0.5)
    solveTwoBone(this.pickChain, this.pickTarget, this.elbowPole)
    this.pickArm.end.rotation.set(-1.1, 0, 0.2)

    this.fretTarget.set(0.3, 0.14 + snare * swing, 0.3)
    this.elbowPole.set(1, -0.3, -0.5)
    solveTwoBone(this.fretChain, this.fretTarget, this.elbowPole)
    this.fretArm.end.rotation.set(-1.1, 0, -0.2)

    void dt
  }

  /** Vocalista: uma mão no microfone junto à boca, a outra solta. */
  private poseVocals(dt: number, beatPhase: number, energy: number, playing: boolean) {
    const lift = playing ? Math.sin(beatPhase * Math.PI * 2) * 0.03 * energy : 0

    this.pickTarget.set(-0.1, 0.42 + lift, 0.28)
    this.elbowPole.set(-1, -0.7, -0.3)
    solveTwoBone(this.pickChain, this.pickTarget, this.elbowPole)
    this.pickArm.end.rotation.set(-1.3, 0, 0.3)

    // A mão livre gesticula: sobe no refrão, desce entre as frases.
    const gesture = playing ? Math.sin(this.clock * 0.9) : -0.6
    this.fretTarget.set(0.34, 0.1 + gesture * 0.3 * energy, 0.16)
    this.elbowPole.set(1, -0.6, -0.4)
    solveTwoBone(this.fretChain, this.fretTarget, this.elbowPole)
    this.fretArm.end.rotation.set(-0.3, 0, -0.4)

    void dt
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
