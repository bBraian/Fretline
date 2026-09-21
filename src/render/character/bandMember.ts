/**
 * Integrante fixo da banda: baixista, cantor e baterista.
 *
 * Diferente do guitarrista, estes **não são escolhidos pelo jogador** — são
 * elenco de apoio. E diferente de tudo que veio antes, cada arquivo já traz
 * personagem, esqueleto e animação juntos, o que dispensa a parte mais
 * frágil do caminho anterior: não há clipe para adaptar a outro esqueleto,
 * porque o clipe é do próprio esqueleto.
 *
 * O que sobra fazer é pouco: pôr na escala do palco, tocar a animação em
 * laço e pendurar o instrumento no osso certo.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ATTACHMENTS } from './bandRig'
import type { PerformanceState, StageRole } from './characterModel'

/** Altura de um integrante, a mesma da marionete. */
const TARGET_HEIGHT = 1.78

/** Onde fica a cintura, como fração da altura — é ali que um instrumento pendura. */
export const WAIST_FRACTION = 0.53

const loader = new GLTFLoader()

/** Escala neutra, para o encaixe não herdar a do modelo. */
const UNIT_SCALE = new THREE.Vector3(1, 1, 1)

export const BAND = {
  bass: '/models/band/playing_bass.glb',
  vocals: '/models/band/singing.glb',
  drums: '/models/band/playing_drums.glb',
} as const

export type BandRole = keyof typeof BAND

export async function loadBandMember(role: BandRole): Promise<BandMember> {
  const gltf = await loader.loadAsync(BAND[role])
  return new BandMember(gltf.scene, gltf.animations, role)
}

export class BandMember {
  readonly group = new THREE.Group()
  /** Onde o instrumento pendura; qual osso sai de `bandRig.ts`. */
  instrumentAnchor = new THREE.Group()
  readonly pickHand: THREE.Object3D

  private attachment: BoneAttachment | null = null
  private mixer: THREE.AnimationMixer | null = null
  private disposed = false

  constructor(
    private root: THREE.Object3D,
    clips: THREE.AnimationClip[],
    role: BandRole,
  ) {
    normalizeHeight(root)
    this.group.add(root)

    // A animação vem no próprio arquivo, já casada com este esqueleto — mas
    // sem as faixas de translação.
    //
    // Clipes do Mixamo carregam *root motion*: o quadril se desloca junto
    // com a pose. Essas faixas estão na escala em que o arquivo foi
    // exportado, e o modelo foi reescalado para caber no palco — aplicá-las
    // mandava o integrante (e o instrumento pendurado nele) para vinte
    // unidades atrás do palco. A rotação carrega a pose inteira e não tem
    // esse problema, porque não depende de escala.
    const clip = clips.find((c) => c.tracks.length > 0)
    if (clip) {
      const parado = new THREE.AnimationClip(
        clip.name,
        clip.duration,
        clip.tracks.filter((t) => t.name.endsWith('.quaternion')),
      )
      this.mixer = new THREE.AnimationMixer(root)
      this.mixer.clipAction(parado).play()
    }

    root.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      // Malha animada por ossos sai do quadro do ponto de vista da câmera de
      // sombra, e o three a descarta cedo demais se confiar na caixa
      // calculada em repouso.
      mesh.frustumCulled = false
    })

    // O osso de encaixe sai da mesma tabela que o resto: o microfone vai na
    // mão, o baixo na cintura.
    const chave = role === 'vocals' ? 'mic' : 'bass'
    this.attachment = attachToBone(
      root,
      this.group,
      ATTACHMENTS[chave].bone,
      chave === 'mic' ? null : WAIST_FRACTION,
    )
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
    this.pickHand = this.instrumentAnchor
  }

  setRole(_role: StageRole) {
    // O papel já veio decidido no arquivo: é o que o clipe faz.
  }

  setState(_state: PerformanceState) {
    // Um integrante de apoio toca sempre igual; quem reage ao desempenho é
    // o protagonista.
  }

  setIntensity(_value: number) {}

  update(dt: number, _beatPhase: number) {
    this.mixer?.update(dt)
    // Depois da animação: o encaixe lê a pose que ela acabou de escrever.
    this.attachment?.update()
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

  get isDisposed() {
    return this.disposed
  }
}

/** Escala uniforme para a altura do palco, com os pés em y=0. */
function normalizeHeight(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true)
  const height = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y || 1
  root.scale.multiplyScalar(TARGET_HEIGHT / height)
  root.updateWorldMatrix(true, true)

  const box = new THREE.Box3().setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= box.min.y
}

/** Só as letras: os exportadores acrescentam sufixos e trocam `:` por `_`. */
function boneKey(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, '')
}

export function findBone(root: THREE.Object3D, wanted: string): THREE.Object3D | null {
  const key = boneKey(wanted)
  let exact: THREE.Object3D | null = null
  let prefixed: THREE.Object3D | null = null
  root.traverse((node) => {
    if (!node.name || exact) return
    const name = boneKey(node.name)
    if (name === key) exact = node
    else if (!prefixed && name.endsWith(key)) prefixed = node
  })
  return exact ?? prefixed
}

/**
 * Ponto de encaixe que acompanha um osso **onde o corpo aparece**.
 *
 * Numa malha com skinning, a posição crua do osso não é onde ele está na
 * tela. O esqueleto vive num espaço próprio, e quem põe a malha no lugar é a
 * matriz inversa de *bind* guardada no `Skeleton`: um vértice preso ao osso
 * `b` é transformado por `bone.matrixWorld × boneInverse[b]`. Nos modelos
 * deste projeto a diferença não é pequena — o quadril do guitarrista fica a
 * vinte unidades atrás do palco enquanto o corpo aparece no lugar certo.
 *
 * Por isso o encaixe não é parenteado ao osso: ele é um objeto solto cuja
 * matriz é recalculada a cada quadro por essa mesma composição. O resultado
 * acompanha a animação e cai onde o corpo está.
 */
export class BoneAttachment {
  readonly group = new THREE.Group()

  private readonly matrix = new THREE.Matrix4()
  private readonly inverseParent = new THREE.Matrix4()
  private readonly position = new THREE.Vector3()
  private readonly quaternion = new THREE.Quaternion()
  private readonly scale = new THREE.Vector3()

  /**
   * Correção de altura, medida uma vez.
   *
   * A altura que o osso do quadril entrega varia demais entre rigs: nos
   * modelos deste projeto ela caiu a 0,77m num personagem e a 1,65m noutro —
   * cintura num, pescoço no outro, e a guitarra aparecia dentro da cabeça.
   * O osso continua mandando na direção e no acompanhamento da animação; só
   * a altura é trazida para onde o corpo diz que ela está.
   */
  private heightFix = 0

  constructor(
    private readonly bone: THREE.Object3D,
    private readonly bindInverse: THREE.Matrix4,
    private readonly parent: THREE.Object3D,
    targetHeight: number | null,
  ) {
    this.group.matrixAutoUpdate = false
    parent.add(this.group)
    this.update()

    if (targetHeight != null) {
      this.heightFix = targetHeight - this.group.matrix.elements[13]
      this.update()
    }
  }

  update() {
    // Onde o osso põe a malha, em coordenadas de mundo.
    this.matrix.multiplyMatrices(this.bone.matrixWorld, this.bindInverse)
    // E de volta para o espaço do pai, que é quem desenha o encaixe.
    this.parent.updateWorldMatrix(true, false)
    this.inverseParent.copy(this.parent.matrixWorld).invert()
    this.group.matrix.multiplyMatrices(this.inverseParent, this.matrix)

    // A escala sai fora.
    //
    // A matriz composta carrega a escala do modelo, que é diferente em cada
    // arquivo — os personagens são reescalados para 1,78m a partir de
    // tamanhos que iam de 1,8 a 167 unidades. Herdada pelo encaixe, ela
    // encolhia o instrumento na proporção de cada modelo: uma guitarra de
    // `scale: 0.36` virava 0,115 num e 0,045 noutro, pequena demais para
    // aparecer. Só posição e giro interessam aqui; o tamanho do instrumento
    // é o que a tabela de `bandRig.ts` diz, e mais nada.
    this.group.matrix.decompose(this.position, this.quaternion, this.scale)
    this.position.y += this.heightFix
    this.group.matrix.compose(this.position, this.quaternion, UNIT_SCALE)
  }
}

/**
 * Monta um encaixe para um osso pelo nome.
 *
 * Devolve `null` quando o modelo não tem esqueleto ou o osso não existe —
 * quem chama decide o que fazer, normalmente pendurar num ponto fixo.
 */
export function attachToBone(
  root: THREE.Object3D,
  parent: THREE.Object3D,
  boneName: string,
  /**
   * Altura desejada do encaixe, como fração da altura do corpo. `null`
   * mantém a altura do osso — que é o certo para uma mão, onde o osso já
   * está onde se quer.
   */
  heightFraction: number | null = null,
): BoneAttachment | null {
  const key = boneKey(boneName)
  let bone: THREE.Bone | null = null
  let inverse: THREE.Matrix4 | null = null

  root.traverse((node) => {
    const mesh = node as THREE.SkinnedMesh
    if (bone || !mesh.isSkinnedMesh || !mesh.skeleton) return
    const bones = mesh.skeleton.bones
    let index = bones.findIndex((b) => boneKey(b.name) === key)
    if (index < 0) index = bones.findIndex((b) => boneKey(b.name).endsWith(key))
    if (index < 0) return
    bone = bones[index]
    inverse = mesh.skeleton.boneInverses[index]
  })

  if (!bone || !inverse) return null

  let targetHeight: number | null = null
  if (heightFraction != null) {
    root.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(root)
    targetHeight = box.min.y + (box.max.y - box.min.y) * heightFraction
  }

  return new BoneAttachment(bone, inverse, parent, targetHeight)
}
