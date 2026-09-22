/**
 * Carrega um integrante da banda de um arquivo glTF/GLB.
 *
 * Expõe a mesma porta que `CharacterModel`, então palco e prévia não sabem
 * se o personagem foi construído em código ou veio de arquivo.
 *
 * ## Por que isto é diferente de importar uma guitarra
 *
 * Guitarra é adereço rígido: basta pôr na escala e na orientação certas. Um
 * integrante precisa **se mexer** — as duas mãos ficam sobre o instrumento,
 * e é a cinemática inversa que as leva até lá.
 *
 * O que torna isso possível sem reescrever nada: `solveTwoBone` recebe
 * `THREE.Object3D`, e **`THREE.Bone` herda de `Object3D`**. A mesma IK que
 * anima a marionete construída em código opera sobre o esqueleto de um
 * arquivo importado, sem uma linha de diferença.
 *
 * O que muda é achar quais ossos são quais, e aí não há padrão: cada
 * ferramenta nomeia do seu jeito. Os perfis abaixo cobrem os que apareceram.
 *
 * ## Modelo sem esqueleto
 *
 * Nem todo arquivo traz rig — e sem ele o personagem é uma estátua, como o
 * README sempre avisou. Esses continuam carregando e aparecendo, parados,
 * com a guitarra pendurada num ponto fixo do tronco. É honesto: dá para
 * usá-los na loja e no palco, só não tocam.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { TwoBoneChain } from './ik'
import { loadClip, retarget, retargetMapped, type ClipRole } from './animationClips'
import { attachToBone, WAIST_FRACTION, type BoneAttachment } from './bandMember'
import { ATTACHMENTS } from './bandRig'
import {
  GUITAR_BODY_OFFSET,
  GUITAR_NECK_REACH,
  GUITAR_TILT,
  type PerformanceState,
  type StageRole,
} from './characterModel'

/** Altura de um integrante, em unidades de mundo — a mesma da marionete. */
const TARGET_HEIGHT = 1.78

const loader = new GLTFLoader()

/** Ajustes por modelo, quando a normalização automática não basta. */
export interface CharacterGlbAdjust {
  /** Giro em torno da vertical, em radianos: põe o personagem de frente. */
  turn?: number
  /** Multiplica a altura final. */
  scale?: number
}

/**
 * Os papéis que a animação precisa encontrar no esqueleto.
 *
 * `fret` é o braço que corre a escala e `pick` o que fica sobre o corpo da
 * guitarra — os mesmos nomes que a marionete usa.
 */
interface Rig {
  hips: THREE.Object3D | null
  chest: THREE.Object3D | null
  head: THREE.Object3D | null
  fret: RestChain | null
  pick: RestChain | null
  fretHand: THREE.Object3D | null
  pickHand: THREE.Object3D | null
}

/**
 * Perfis de nomenclatura de esqueleto.
 *
 * Um por ferramenta, porque não existe convenção compartilhada. A ordem
 * importa: o primeiro perfil que achar uma cadeia de braço completa vence.
 *
 * A mão esquerda vira o braço da escala porque é assim que um destro toca —
 * e todos os modelos vêm montados para destro.
 */
const PROFILES: Array<{ nome: string; upper: string; lower: string; hand: string; shoulder: string }> = [
  // Mixamo, de longe o mais comum em banco público.
  {
    nome: 'mixamo',
    shoulder: '{lado}Shoulder',
    upper: '{lado}Arm',
    lower: '{lado}ForeArm',
    hand: '{lado}Hand',
  },
  // Maya/Autodesk, com sufixo SHJnt.
  {
    nome: 'maya-shjnt',
    shoulder: '{l}_Arm_Clavicle',
    upper: '{l}_Arm_Shoulder',
    lower: '{l}_Arm_Elbow',
    hand: '{l}_Arm_Wrist',
  },
  // Rig próprio com prefixo Bone_ e sufixo de lado. O braço se chama
  // "Bicep", que nenhuma busca por "arm" encontraria.
  {
    nome: 'bone-bicep',
    shoulder: 'Bone_Collar_{L}',
    upper: 'Bone_Bicep_{L}',
    lower: 'Bone_Forearm_{L}',
    hand: 'Bone_Palm_{L}',
  },
]

export interface ImportedCharacterOptions {
  url: string
  adjust?: CharacterGlbAdjust
}

export async function loadCharacterGlb({
  url,
  adjust = {},
}: ImportedCharacterOptions): Promise<ImportedCharacter> {
  const gltf = await loader.loadAsync(url)
  return new ImportedCharacter(gltf.scene, adjust)
}

export class ImportedCharacter {
  readonly group = new THREE.Group()
  instrumentAnchor = new THREE.Group()

  /** Existe para cumprir a porta; um importado não tem mão nomeada. */
  get pickHand() {
    return this.rig.pickHand ?? this.instrumentAnchor
  }
  get fretHand() {
    return this.rig.fretHand ?? this.instrumentAnchor
  }

  /** Verdadeiro quando o esqueleto tem braços utilizáveis. */
  readonly animated: boolean

  private rig: Rig
  private clock = 0
  private state: PerformanceState = 'idle'
  private intensity = 0
  private fretTarget = new THREE.Vector3()
  private pickTarget = new THREE.Vector3()
  private elbowPole = new THREE.Vector3()
  private spin = new THREE.Quaternion()
  private disposed = false
  private baseY = 0
  private attachment: BoneAttachment | null = null
  private mixer: THREE.AnimationMixer | null = null

  constructor(
    private root: THREE.Object3D,
    adjust: CharacterGlbAdjust,
  ) {
    normalize(root, adjust)
    this.group.add(root)

    this.rig = findRig(root)
    this.animated = !!(this.rig.fret && this.rig.pick)

    // Mesmo ponto de encaixe dos integrantes fixos: no osso, com os eixos
    // do palco e a escala do mundo. Onde a guitarra fica em relação a ele
    // sai da tabela de `bandRig.ts`, aplicada pelo palco.
    this.attachment = attachToBone(root, this.group, ATTACHMENTS.guitar.bone, WAIST_FRACTION)
    if (this.attachment) {
      this.instrumentAnchor = this.attachment.group
    } else {
      // Sem osso utilizável o instrumento não acompanha a animação, mas ao
      // menos fica na cintura: pendurado na origem do grupo, ele apareceria
      // nos pés.
      this.group.add(this.instrumentAnchor)
      const box = new THREE.Box3().setFromObject(root)
      this.instrumentAnchor.position.set(0, box.min.y + (box.max.y - box.min.y) * WAIST_FRACTION, 0)
    }
  }

  /**
   * Escolhe o papel e, com ele, a animação.
   *
   * O clipe chega depois; até lá o integrante fica na pose de repouso com a
   * cinemática inversa segurando o instrumento. Quando ele chega e casa com
   * o esqueleto, **a IK sai de cena**: as duas disputando os mesmos ossos
   * produziriam uma mistura que não é nem uma coisa nem outra.
   *
   * São dois caminhos, e a ordem importa. O primeiro é a cópia direta das
   * faixas, que só vale entre esqueletos da **mesma família** — dois rigs
   * Mixamo repousam iguais, e a rotação local de um serve no outro sem
   * conta nenhuma. É o caminho barato, e é o que os modelos Mixamo já
   * usavam. Quando ele não casa, entra a adaptação de verdade, que
   * reconhece o esqueleto pelo papel de cada osso e desconta a diferença
   * entre as duas poses de repouso.
   */
  setRole(role: StageRole) {
    void loadClip(role as ClipRole).then((loaded) => {
      if (!loaded || this.disposed) return

      const direto = retarget(loaded.clip, this.root)
      const fitted = direto ?? this.retargetAcrossFamilies(loaded.clip, loaded.scene)
      if (!fitted) return

      this.mixer = new THREE.AnimationMixer(this.root)
      this.mixer.clipAction(fitted).play()
    })
  }

  /**
   * Adapta o clipe quando o esqueleto é de outra convenção.
   *
   * Precisa da malha com esqueleto, e não da raiz: é dela que sai a lista de
   * ossos e a pose de ligação. Um modelo partido em várias malhas — há
   * arquivos com mais de uma dezena — compartilha o mesmo esqueleto entre
   * todas, então a primeira serve.
   */
  private retargetAcrossFamilies(clip: THREE.AnimationClip, source: THREE.Object3D) {
    let skinned: THREE.SkinnedMesh | null = null
    this.root.traverse((node) => {
      if (!skinned && (node as THREE.SkinnedMesh).isSkinnedMesh) skinned = node as THREE.SkinnedMesh
    })
    return skinned ? retargetMapped(clip, source, skinned) : null
  }

  setState(state: PerformanceState) {
    this.state = state
  }

  setIntensity(value: number) {
    this.intensity = value
  }

  update(dt: number, beatPhase: number) {
    this.clock += dt

    // Com clipe tocando, ele manda no esqueleto inteiro e o resto não roda.
    if (this.mixer) {
      this.mixer.update(dt)
      this.attachment?.update()
      return
    }
    this.attachment?.update()

    const energy = 0.35 + this.intensity * 0.65
    const beat = Math.sin(beatPhase * Math.PI * 2)
    const idle = Math.sin(this.clock * 1.6)
    const playing = this.state === 'playing' || this.state === 'solo' || this.state === 'starPower'
    const boost = this.state === 'solo' ? 1.5 : this.state === 'starPower' ? 1.3 : 1

    // Peso do corpo na batida, como na marionete.
    const bounce = playing ? beat * 0.03 * energy * boost : idle * 0.012
    this.root.position.y = this.baseY + bounce

    if (this.rig.chest) this.rig.chest.rotation.z = idle * 0.03 + (playing ? beat * 0.02 : 0)
    if (this.rig.head) this.rig.head.rotation.y = idle * 0.12

    if (!this.animated) return

    // Mão da escala: corre ao longo do braço da guitarra. Os alvos saem da
    // mesma pose de instrumento que a marionete usa, então as duas formas de
    // personagem seguram a guitarra do mesmo jeito.
    const slide = playing ? Math.sin(this.clock * 2.2) * 0.5 + 0.5 : 0.4
    const along = GUITAR_NECK_REACH * (0.62 + slide * 0.32)
    this.fretTarget.set(
      GUITAR_BODY_OFFSET.x + Math.sin(GUITAR_TILT) * along,
      GUITAR_BODY_OFFSET.y + Math.cos(GUITAR_TILT) * along,
      GUITAR_BODY_OFFSET.z + 0.07,
    )
    this.toChainSpace(this.fretTarget, this.rig.fret!)
    // Cotovelo para baixo e para trás, em coordenadas do palco.
    this.elbowPole.set(0.3, -1, -0.45)
    this.dirToChainSpace(this.elbowPole, this.rig.fret!)
    solveRestChain(this.rig.fret!, this.fretTarget, this.elbowPole)

    const stroke = playing ? Math.sin(beatPhase * Math.PI) * 0.075 * energy * boost : 0
    this.pickTarget.set(
      GUITAR_BODY_OFFSET.x + 0.04,
      GUITAR_BODY_OFFSET.y + 0.02 + stroke,
      GUITAR_BODY_OFFSET.z + 0.1,
    )
    this.toChainSpace(this.pickTarget, this.rig.pick!)
    this.elbowPole.set(-0.6, -1, -0.45)
    this.dirToChainSpace(this.elbowPole, this.rig.pick!)
    solveRestChain(this.rig.pick!, this.pickTarget, this.elbowPole)
  }

  /**
   * Leva um alvo das coordenadas do instrumento para as da cadeia do braço.
   *
   * `solveTwoBone` subtrai `root.position` do alvo, e `root.position` é a
   * posição do osso **dentro do pai** — ou seja, a função espera o alvo no
   * espaço do pai da cadeia, não no do mundo. Parar no mundo, como esta
   * conversão fazia, deixava a IK resolvendo um triângulo entre unidades
   * incompatíveis: os ossos de um rig Mixamo medem dezenas, e um alvo em
   * unidades de jogo mede frações.
   *
   * Passar pelo mundo e voltar resolve escala e giro de uma vez, porque
   * `worldToLocal` traz a matriz inversa inteira.
   */
  private toChainSpace(target: THREE.Vector3, chain: TwoBoneChain) {
    this.instrumentAnchor.updateWorldMatrix(true, false)
    target.applyMatrix4(this.instrumentAnchor.matrixWorld)
    const parent = chain.root.parent
    if (!parent) return
    parent.updateWorldMatrix(true, false)
    parent.worldToLocal(target)
  }

  /**
   * Leva uma **direção** de mundo para o espaço da cadeia.
   *
   * O vetor de polo — que diz para que lado o cotovelo aponta — é uma
   * direção, não um ponto: não leva translação nem escala, só o giro. E
   * precisa ser convertido, porque "para baixo" no palco não é "para baixo"
   * no espaço de um ombro Mixamo, que chega com a orientação da ferramenta
   * que exportou. Passar o polo em coordenadas de mundo, como este código
   * fazia, mandava o cotovelo para uma direção arbitrária em cada rig — e
   * era o que deixava os braços abertos na horizontal.
   */
  private dirToChainSpace(dir: THREE.Vector3, chain: TwoBoneChain) {
    const parent = chain.root.parent
    if (!parent) return
    parent.updateWorldMatrix(true, false)
    parent.getWorldQuaternion(this.spin)
    dir.applyQuaternion(this.spin.invert()).normalize()
  }

  dispose() {
    this.disposed = true
    this.mixer?.stopAllAction()
    this.mixer = null
    this.root.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose()
        }
        material.dispose()
      }
    })
  }
}

/**
 * Põe o modelo na escala e na pose do palco.
 *
 * Escala **uniforme**: um personagem esticado em um eixo só fica deformado,
 * e o ponto de normalizar é que todos tenham o mesmo tamanho sem perder as
 * proporções de cada um.
 */
function normalize(root: THREE.Object3D, adjust: CharacterGlbAdjust) {
  root.updateWorldMatrix(true, true)

  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())

  // Modelo deitado: o eixo mais longo é a altura de uma pessoa em pé.
  if (size.z > size.y && size.z > size.x) {
    root.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
    root.updateWorldMatrix(true, true)
  }

  const height = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y || 1
  root.scale.multiplyScalar((TARGET_HEIGHT * (adjust.scale ?? 1)) / height)
  root.updateWorldMatrix(true, true)

  if (adjust.turn) {
    root.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), adjust.turn)
    root.updateWorldMatrix(true, true)
  }

  // Pés no chão e centrado no eixo vertical. O palco põe todo mundo em y=0,
  // e um modelo com a origem na cintura afundaria metade no piso.
  const placed = new THREE.Box3().setFromObject(root)
  const center = placed.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= placed.min.y
}

/** Procura os ossos que a animação precisa, perfil por perfil. */
function findRig(root: THREE.Object3D): Rig {
  /**
   * Só as letras, em minúsculas.
   *
   * Duas coisas atrapalham comparar nomes de osso direto. Os exportadores
   * acrescentam sufixos numéricos (`_09`, `_011`), e o GLTFLoader do three
   * **sanitiza os nomes**, trocando `:` por `_` — então o
   * `mixamorig:LeftArm` que está dentro do arquivo chega aqui como
   * `mixamorig_LeftArm`, e um padrão escrito com dois-pontos nunca casa.
   * Jogar fora tudo que não é letra resolve os dois de uma vez.
   */
  const key = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '')

  const byName = new Map<string, THREE.Object3D>()
  root.traverse((node) => {
    if (node.name) byName.set(key(node.name), node)
  })

  const find = (needle: string) => {
    const wanted = key(needle)
    // Exato primeiro: `Head` não pode casar com `HeadTopEnd` quando existe
    // um `Head` de verdade.
    const exact = byName.get(wanted)
    if (exact) return exact
    for (const [name, node] of byName) {
      if (name.startsWith(wanted)) return node
    }
    return null
  }

  const chainFor = (profile: (typeof PROFILES)[number], side: 'left' | 'right') => {
    const fill = (pattern: string) =>
      pattern
        .replace('{lado}', side === 'left' ? 'mixamorig:Left' : 'mixamorig:Right')
        .replace('{l}', side === 'left' ? 'l' : 'r')
        .replace('{L}', side === 'left' ? 'L' : 'R')

    const upper = find(fill(profile.upper))
    const lower = find(fill(profile.lower))
    const hand = find(fill(profile.hand))
    if (!upper || !lower || !hand) return null

    // Os comprimentos precisam estar no **espaço do pai da cadeia**, que é
    // onde o alvo chega.
    //
    // A primeira versão usava `lower.position.length()`, a posição local do
    // osso. Parece a medida certa — num esqueleto a posição de um osso é o
    // comprimento do segmento acima dele —, mas essa medida vive no espaço
    // do *braço*, e o alvo vive no espaço do *ombro*. Quando os dois têm
    // escalas diferentes, como num rig Mixamo, a IK compara números de
    // grandezas diferentes: os ossos do Kairos somavam 176 contra um alvo a
    // 10 de distância, e a mão era empurrada para o limite do alcance.
    //
    // Medir em mundo e dividir pela escala do pai dá os dois na mesma régua.
    upper.updateWorldMatrix(true, false)
    lower.updateWorldMatrix(true, false)
    hand.updateWorldMatrix(true, false)
    const a = new THREE.Vector3().setFromMatrixPosition(upper.matrixWorld)
    const b = new THREE.Vector3().setFromMatrixPosition(lower.matrixWorld)
    const c = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld)
    const parentScale = upper.parent
      ? upper.parent.getWorldScale(new THREE.Vector3()).x || 1
      : 1
    const upperLength = a.distanceTo(b) / parentScale
    const lowerLength = b.distanceTo(c) / parentScale
    if (upperLength <= 0 || lowerLength <= 0) return null

    // A pose de repouso é lida uma vez, agora: é dela que todo giro é
    // medido, e ela é a única informação que diz como esta ferramenta
    // orienta os ossos.
    const chain: RestChain = {
      root: upper,
      lower,
      upperLength,
      lowerLength,
      upperRest: upper.quaternion.clone(),
      lowerRest: lower.quaternion.clone(),
      upperDir: lower.position.clone().normalize().applyQuaternion(upper.quaternion),
      lowerDir: hand.position.clone().normalize().applyQuaternion(lower.quaternion),
    }
    return { chain, hand }
  }

  let fret: RestChain | null = null
  let pick: RestChain | null = null
  let fretHand: THREE.Object3D | null = null
  let pickHand: THREE.Object3D | null = null
  for (const profile of PROFILES) {
    const left = chainFor(profile, 'left')
    const right = chainFor(profile, 'right')
    if (left && right) {
      fret = left.chain
      pick = right.chain
      fretHand = left.hand
      pickHand = right.hand
      break
    }
  }

  return {
    hips: find('mixamorig:Hips') ?? find('Bone_Pelvis') ?? find('Hips') ?? null,
    chest: find('mixamorig:Spine2') ?? find('Bone_Chest') ?? find('Spine_01') ?? find('mixamorig:Spine') ?? null,
    head: find('mixamorig:Head') ?? find('Bone_Head') ?? find('Head_') ?? null,
    fret,
    pick,
    fretHand,
    pickHand,
  }
}


/**
 * Cinemática inversa de dois ossos **relativa à pose de repouso**.
 *
 * `solveTwoBone`, que anima a marionete construída em código, escreve a
 * rotação absoluta do ombro assumindo que o osso aponta para -Y em repouso.
 * Isso vale para um esqueleto escrito à mão aqui dentro, e não vale para
 * nenhum arquivo importado: Mixamo, Maya e cada ferramenta orientam os
 * ossos do seu jeito. Aplicada a um rig de fora, aquela função levanta os
 * braços para cima da cabeça.
 *
 * Aqui a conta é a mesma — lei dos cossenos num triângulo —, mas o
 * resultado é aplicado **por cima** da orientação que o osso já tinha: o que
 * se calcula é o giro que leva o braço de onde ele repousa até onde ele
 * precisa estar. Assim a mesma rotina serve para qualquer convenção de
 * eixo, que é o que "retargeting" quer dizer.
 */
export interface RestChain extends TwoBoneChain {
  /** Orientação de repouso, de onde todo giro é medido. */
  upperRest: THREE.Quaternion
  lowerRest: THREE.Quaternion
  /** Direção do osso em repouso, no espaço do pai. */
  upperDir: THREE.Vector3
  /** Direção do antebraço em repouso, no espaço do braço. */
  lowerDir: THREE.Vector3
}

const _toTarget = new THREE.Vector3()
const _side = new THREE.Vector3()
const _desired = new THREE.Vector3()
const _axis = new THREE.Vector3()
const _turn = new THREE.Quaternion()

function clamp(value: number) {
  return Math.min(1, Math.max(-1, value))
}

export function solveRestChain(chain: RestChain, target: THREE.Vector3, pole: THREE.Vector3) {
  const { root, lower, upperLength: l1, lowerLength: l2 } = chain

  _toTarget.copy(target).sub(root.position)
  let distance = _toTarget.length()
  if (distance < 1e-6) return

  // Folga nos extremos: encostar trava o cotovelo em 0 ou 180 graus e a
  // articulação some.
  const min = Math.abs(l1 - l2) + l1 * 0.02
  const max = (l1 + l2) * 0.98
  distance = Math.min(max, Math.max(min, distance))
  _toTarget.normalize()

  const shoulder = Math.acos(clamp((l1 * l1 + distance * distance - l2 * l2) / (2 * l1 * distance)))
  const elbow = Math.acos(clamp((l1 * l1 + l2 * l2 - distance * distance) / (2 * l1 * l2)))

  // Para que lado o cotovelo aponta.
  _side.crossVectors(pole, _toTarget)
  if (_side.lengthSq() < 1e-8) _side.set(1, 0, 0)
  _side.normalize()

  // Direção que o braço precisa ter, e o giro que o leva da direção de
  // repouso até ela.
  _desired.copy(_toTarget).applyAxisAngle(_side, -shoulder)
  _turn.setFromUnitVectors(chain.upperDir, _desired)
  root.quaternion.copy(_turn).multiply(chain.upperRest)

  // O cotovelo dobra em torno do eixo perpendicular ao plano do triângulo,
  // trazido para o espaço do braço.
  _axis.copy(_side).applyQuaternion(root.quaternion.clone().invert()).normalize()
  _turn.setFromAxisAngle(_axis, -(Math.PI - elbow))
  lower.quaternion.copy(_turn).multiply(chain.lowerRest)
}
