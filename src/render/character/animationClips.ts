/**
 * Animações prontas do Mixamo, aplicadas aos integrantes importados.
 *
 * Substituem a cinemática inversa nos modelos em que dá para usá-las, e o
 * motivo é honesto: a IK calcula onde a mão deveria estar e resolve um
 * triângulo; o que ela não tem é tudo que um animador põe — rotação de
 * pulso, ombro acompanhando, peso do corpo, respiração. Um clipe feito por
 * alguém traz isso pronto.
 *
 * ## Duas coisas que precisam de tradução
 *
 * **Os nomes das faixas.** Um clipe do Mixamo endereça `mixamorig:Hips`,
 * mas o GLTFLoader sanitiza nomes, e cada exportador acrescenta sufixos —
 * no modelo o mesmo osso é `mixamorigHips_01`. O casamento é feito pelo
 * nome reduzido a letras, o mesmo critério que acha os ossos do rig.
 *
 * **As faixas de posição são descartadas.** Elas vêm na escala em que o
 * clipe foi exportado, e o modelo foi reescalado para caber no palco:
 * aplicá-las esticaria o esqueleto ou faria o integrante sair andando para
 * fora do palco. Rotação não tem esse problema — é independente de escala, e
 * é o que carrega a pose.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'

const loader = new GLTFLoader()

/** Um clipe por papel no palco. */
export const CLIPS = {
  guitar: '/models/animations/guitar-playing.glb',
  bass: '/models/animations/bass-playing.glb',
  drums: '/models/animations/playing-drums.glb',
  vocals: '/models/animations/singing.glb',
} as const

export type ClipRole = keyof typeof CLIPS

/** O clipe e a cena de onde ele veio; a cena guarda a pose de repouso. */
export interface LoadedClip {
  clip: THREE.AnimationClip
  scene: THREE.Object3D
}

const cache = new Map<string, Promise<LoadedClip | null>>()

/**
 * Carrega o clipe de um papel, uma vez só.
 *
 * O palco tem quatro integrantes e pode trocar de personagem no meio da
 * música; recarregar o mesmo arquivo a cada troca seria desperdício.
 */
export function loadClip(role: ClipRole): Promise<LoadedClip | null> {
  const url = CLIPS[role]
  let pending = cache.get(url)
  if (!pending) {
    pending = loader
      .loadAsync(url)
      .then((gltf) => {
        const clip = gltf.animations.find((a) => a.tracks.length > 0)
        return clip ? { clip, scene: gltf.scene } : null
      })
      .catch((erro) => {
        console.error(`não deu para carregar ${url}`, erro)
        return null
      })
    cache.set(url, pending)
  }
  return pending
}

/** Só as letras: o mesmo critério usado para achar ossos no rig. */
function key(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, '')
}

/**
 * Reescreve um clipe para os ossos de um modelo.
 *
 * Devolve `null` quando quase nada casa — um esqueleto de outra convenção
 * receberia meia dúzia de faixas e ficaria pior do que sem animação
 * nenhuma.
 */
export function retarget(clip: THREE.AnimationClip, root: THREE.Object3D): THREE.AnimationClip | null {
  const byKey = new Map<string, string>()
  root.traverse((node) => {
    if (node.name) byKey.set(key(node.name), node.name)
  })

  const tracks: THREE.KeyframeTrack[] = []
  let wanted = 0

  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.')
    if (dot < 0) continue
    const property = track.name.slice(dot + 1)
    // Ver o comentário do topo: posição vem na escala do clipe.
    if (property !== 'quaternion') continue
    wanted++

    const target = byKey.get(key(track.name.slice(0, dot)))
    if (!target) continue

    const copy = track.clone()
    copy.name = `${target}.${property}`
    tracks.push(copy)
  }

  // Metade das faixas é o piso: abaixo disso o esqueleto é de outra
  // família, e aplicar o pouco que casou produz um boneco torto.
  if (!wanted || tracks.length < wanted * 0.5) return null

  return new THREE.AnimationClip(clip.name, clip.duration, tracks)
}

/**
 * ## Retargeting para esqueletos de outra convenção
 *
 * O `retarget` acima copia faixas de um esqueleto para outro **da mesma
 * família**: os nomes mudam de sufixo, mas os ossos repousam na mesma
 * orientação, então a rotação local de um serve no outro sem conta nenhuma.
 * É o caso de dois rigs Mixamo, e é rápido.
 *
 * Entre famílias diferentes isso não vale. A faixa de um clipe Mixamo guarda
 * a rotação **local** do osso, medida a partir da pose de repouso do rig
 * Mixamo. O mesmo número aplicado a um osso que repousa apontando para outro
 * lado não produz o mesmo gesto — produz um braço torcido. É por isso que
 * dois dos modelos importados ficavam parados: o clipe existia, mas aplicá-lo
 * cru teria sido pior que não animar.
 *
 * `SkeletonUtils.retargetClip` resolve isso do jeito certo: reproduz o clipe
 * na fonte quadro a quadro, lê a orientação de **mundo** de cada osso, e
 * resolve que rotação local o osso correspondente do alvo precisa ter para
 * chegar na mesma orientação — descontando a diferença entre as duas poses
 * de repouso. O que ele não faz é adivinhar quem corresponde a quem, e é o
 * que esta parte do arquivo acrescenta.
 */


/** Os papéis do corpo que um clipe de tocar realmente move. */
const SLOTS = [
  'hips', 'spine', 'spine1', 'spine2', 'neck', 'head',
  'leftShoulder', 'leftArm', 'leftForeArm', 'leftHand',
  'rightShoulder', 'rightArm', 'rightForeArm', 'rightHand',
  'leftUpLeg', 'leftLeg', 'leftFoot',
  'rightUpLeg', 'rightLeg', 'rightFoot',
] as const

type Slot = (typeof SLOTS)[number]

/**
 * Os ossos que a animação de fato dirige: os dois braços, e nada mais.
 *
 * O recorte saiu de tentativa em tela, não de teoria. O `retargetClip`
 * escreve em cada osso a orientação de **mundo** do osso correspondente da
 * fonte, e isso é exato demais para um corpo que não é o mesmo corpo:
 *
 * - **quadril** — é a raiz de tudo. Dirigi-lo escreve nele a posição e o
 *   aprumo do quadril do rig Mixamo, e o corpo inteiro pendura daí. Em tela
 *   isso deitou um modelo no chão e dobrou o outro no ar.
 * - **pernas** — mesmo problema, com o agravante de que cada ferramenta
 *   orienta a coxa de um jeito. Rendeu um chute alto no meio da música.
 * - **coluna, pescoço e cabeça** — o corpo fica de pé, mas curvado para a
 *   frente com a cabeça baixa: a rotação do quadril da fonte, que o alvo
 *   não acompanha, sobra toda na coluna.
 *
 * O que fica é o que "tocar guitarra" quer dizer, e é o que sobrevive à
 * diferença entre os esqueletos: os braços. O personagem fica **plantado**
 * na pose de repouso e toca — que é como um guitarrista de pé diante do
 * microfone se comporta de qualquer forma.
 *
 * O quadril continua no mapa acima mesmo sem ser dirigido, porque é a
 * **referência de aprumo**: é dele que sai o giro que alinha os dois corpos
 * (ver `alignRestPose`). Nos dois modelos medidos esse giro é de 90 graus —
 * sem ele nada disto fica de pé.
 */
const DRIVEN: readonly Slot[] = [
  'leftShoulder', 'leftArm', 'leftForeArm', 'leftHand',
  'rightShoulder', 'rightArm', 'rightForeArm', 'rightHand',
]

/**
 * Onde cada papel mora, em cada convenção de esqueleto.
 *
 * São as mesmas três famílias que `characterGlb.ts` já reconhece para a
 * cinemática inversa, estendidas do braço para o corpo inteiro. Um nome
 * ausente aqui simplesmente não recebe animação, e o osso fica na pose de
 * repouso — o que é bem melhor que recebê-la errada.
 */
const SKELETONS: Record<string, Partial<Record<Slot, string>>> = {
  mixamo: {
    hips: 'mixamorig:Hips', spine: 'mixamorig:Spine', spine1: 'mixamorig:Spine1',
    spine2: 'mixamorig:Spine2', neck: 'mixamorig:Neck', head: 'mixamorig:Head',
    leftShoulder: 'mixamorig:LeftShoulder', leftArm: 'mixamorig:LeftArm',
    leftForeArm: 'mixamorig:LeftForeArm', leftHand: 'mixamorig:LeftHand',
    rightShoulder: 'mixamorig:RightShoulder', rightArm: 'mixamorig:RightArm',
    rightForeArm: 'mixamorig:RightForeArm', rightHand: 'mixamorig:RightHand',
    leftUpLeg: 'mixamorig:LeftUpLeg', leftLeg: 'mixamorig:LeftLeg', leftFoot: 'mixamorig:LeftFoot',
    rightUpLeg: 'mixamorig:RightUpLeg', rightLeg: 'mixamorig:RightLeg', rightFoot: 'mixamorig:RightFoot',
  },
  // Maya/Autodesk. Não tem osso de cabeça próprio: `Head_` são a mandíbula e
  // o topo do crânio, e quem carrega a cabeça é a última junta do pescoço.
  'maya-shjnt': {
    hips: 'ROOTSHJnt', spine: 'Spine_01', spine1: 'Spine_02', spine2: 'Spine_03',
    neck: 'Neck_01', head: 'Neck_Top',
    leftShoulder: 'l_Arm_Clavicle', leftArm: 'l_Arm_Shoulder',
    leftForeArm: 'l_Arm_Elbow', leftHand: 'l_Arm_Wrist',
    rightShoulder: 'r_Arm_Clavicle', rightArm: 'r_Arm_Shoulder',
    rightForeArm: 'r_Arm_Elbow', rightHand: 'r_Arm_Wrist',
    leftUpLeg: 'l_Leg_Hip', leftLeg: 'l_Leg_Knee', leftFoot: 'l_Leg_Ankle',
    rightUpLeg: 'r_Leg_Hip', rightLeg: 'r_Leg_Knee', rightFoot: 'r_Leg_Ankle',
  },
  // Rigify, do Blender. **Os ossos que deformam são os `DEF-`**, não os
  // `ORG-`: no Rigify os DEF copiam os ORG por restrição, e restrição não
  // existe em glTF. Medido no Darth Vader: das 707 juntas, as 150 que
  // carregam peso são todas DEF. Animar os ORG não move um pixel.
  rigify: {
    hips: 'DEF-spine', spine: 'DEF-spine.001', spine1: 'DEF-spine.002',
    spine2: 'DEF-spine.003', neck: 'DEF-spine.005', head: 'DEF-spine.006',
    leftShoulder: 'DEF-shoulder.L', leftArm: 'DEF-upper_arm.L',
    leftForeArm: 'DEF-forearm.L', leftHand: 'DEF-hand.L',
    rightShoulder: 'DEF-shoulder.R', rightArm: 'DEF-upper_arm.R',
    rightForeArm: 'DEF-forearm.R', rightHand: 'DEF-hand.R',
    leftUpLeg: 'DEF-thigh.L', leftLeg: 'DEF-shin.L', leftFoot: 'DEF-foot.L',
    rightUpLeg: 'DEF-thigh.R', rightLeg: 'DEF-shin.R', rightFoot: 'DEF-foot.R',
  },
  // Biped do 3ds Max. O braço não se chama "UpperArm": é `Arm`, `Arm1` e
  // `Arm2`, e nenhuma busca por "upper" ou "fore" acharia.
  'max-biped': {
    hips: 'Bip01 Pelvis', spine: 'Bip01 Spine', spine1: 'Bip01 Spine1',
    spine2: 'Bip01 Spine2', neck: 'Bip01 Neck', head: 'Bip01 Head',
    leftArm: 'Bip01 L Arm', leftForeArm: 'Bip01 L Arm1', leftHand: 'Bip01 L Hand',
    rightArm: 'Bip01 R Arm', rightForeArm: 'Bip01 R Arm1', rightHand: 'Bip01 R Hand',
    leftUpLeg: 'Bip01 L Thigh', leftLeg: 'Bip01 L Calf', leftFoot: 'Bip01 L Foot',
    rightUpLeg: 'Bip01 R Thigh', rightLeg: 'Bip01 R Calf', rightFoot: 'Bip01 R Foot',
  },
  // Biped da Valve, o do Source. Mesma árvore do Max, com outro prefixo.
  'valve-biped': {
    hips: 'ValveBiped.Bip01_Pelvis', spine: 'ValveBiped.Bip01_Spine',
    spine1: 'ValveBiped.Bip01_Spine1', spine2: 'ValveBiped.Bip01_Spine2',
    neck: 'ValveBiped.Bip01_Neck1', head: 'ValveBiped.Bip01_Head1',
    leftShoulder: 'ValveBiped.Bip01_L_Clavicle', leftArm: 'ValveBiped.Bip01_L_UpperArm',
    leftForeArm: 'ValveBiped.Bip01_L_Forearm', leftHand: 'ValveBiped.Bip01_L_Hand',
    rightShoulder: 'ValveBiped.Bip01_R_Clavicle', rightArm: 'ValveBiped.Bip01_R_UpperArm',
    rightForeArm: 'ValveBiped.Bip01_R_Forearm', rightHand: 'ValveBiped.Bip01_R_Hand',
    leftUpLeg: 'ValveBiped.Bip01_L_Thigh', leftLeg: 'ValveBiped.Bip01_L_Calf',
    leftFoot: 'ValveBiped.Bip01_L_Foot', rightUpLeg: 'ValveBiped.Bip01_R_Thigh',
    rightLeg: 'ValveBiped.Bip01_R_Calf', rightFoot: 'ValveBiped.Bip01_R_Foot',
  },
  // Unreal Engine, o esqueleto padrão. Tudo minúsculo, lado no sufixo.
  unreal: {
    hips: 'pelvis', spine: 'spine_01', spine1: 'spine_02', spine2: 'spine_03',
    neck: 'neck_01', head: 'head',
    leftShoulder: 'clavicle_l', leftArm: 'upperarm_l',
    leftForeArm: 'lowerarm_l', leftHand: 'hand_l',
    rightShoulder: 'clavicle_r', rightArm: 'upperarm_r',
    rightForeArm: 'lowerarm_r', rightHand: 'hand_r',
    leftUpLeg: 'thigh_l', leftLeg: 'calf_l', leftFoot: 'foot_l',
    rightUpLeg: 'thigh_r', rightLeg: 'calf_r', rightFoot: 'foot_r',
  },
  'bone-bicep': {
    hips: 'Bone_Pelvis', spine: 'Bone_Stomach_Lower', spine1: 'Bone_Stomach_Upper',
    spine2: 'Bone_Chest', neck: 'Bone_Neck', head: 'Bone_Head',
    leftShoulder: 'Bone_Collar_L', leftArm: 'Bone_Bicep_L',
    leftForeArm: 'Bone_Forearm_L', leftHand: 'Bone_Palm_L',
    rightShoulder: 'Bone_Collar_R', rightArm: 'Bone_Bicep_R',
    rightForeArm: 'Bone_Forearm_R', rightHand: 'Bone_Palm_R',
    leftUpLeg: 'Bone_Thigh_L', leftLeg: 'Bone_Knee_L', leftFoot: 'Bone_Ankle_L',
    rightUpLeg: 'Bone_Thigh_R', rightLeg: 'Bone_Knee_R', rightFoot: 'Bone_Ankle_R',
  },
}

/**
 * Nome comparável, **preservando dígitos e sublinhados**.
 *
 * Diferente do `key` acima, que joga fora tudo que não é letra. Ali isso é
 * desejável: `mixamorig:LeftArm` e `mixamorigLeftArm_09` são o mesmo osso.
 * Aqui seria fatal — `Spine_01SHJnt` e `Spine_02SHJnt` virariam a mesma
 * chave, e os quatro níveis de coluna de um rig Maya colapsariam num só.
 *
 * Então normaliza-se só o que é ruído de ferramenta, e cada descarte tem um
 * motivo medido:
 *
 * - **o sufixo numérico do fim** (`_021`), que o exportador acrescenta para
 *   desempatar nomes e que muda de arquivo para arquivo;
 * - **o dois-pontos e o ponto**, que o GLTFLoader *remove* ao sanitizar:
 *   `mixamorig:Hips` vira `mixamorigHips` e `ValveBiped.Bip01_Pelvis` vira
 *   `ValveBipedBip01_Pelvis`;
 * - **o espaço**, que ele *troca por sublinhado* — e não remove. O Biped do
 *   3ds Max chama o braço de `Bip01 L Arm`, que em memória é
 *   `Bip01_L_Arm`.
 *
 * Os dois últimos casos parecem o mesmo e não são, e tratá-los igual custou
 * um personagem: o Gokê carregava, aparecia e ficava parado, sem um único
 * aviso no console, porque nenhum osso dele casava.
 */
function slotKey(name: string) {
  return name
    .replace(/_\d+$/, '')
    .replace(/\s/g, '_')
    .replace(/[:.]/g, '')
    .toLowerCase()
}

/** Quantos papéis precisam casar para acreditar que é aquela família. */
const MIN_SLOTS = 3

/**
 * Os ossos de um objeto, para indexar.
 *
 * Numa `SkinnedMesh` eles vêm do `skeleton`, e **não** de percorrer a
 * árvore: num `.glb` de verdade os ossos penduram na raiz da cena e a malha
 * só os referencia. Percorrer a malha devolve a própria malha e mais nada —
 * era o que fazia o mapa sair vazio para todo modelo importado.
 */
function bonesOf(root: THREE.Object3D): THREE.Object3D[] {
  const skinned = root as THREE.SkinnedMesh
  if (skinned.isSkinnedMesh && skinned.skeleton) return skinned.skeleton.bones

  const out: THREE.Object3D[] = []
  root.traverse((node) => out.push(node))
  return out
}

function indexBones(root: THREE.Object3D) {
  const byName = new Map<string, string>()
  for (const node of bonesOf(root)) {
    if (node.name && !byName.has(slotKey(node.name))) byName.set(slotKey(node.name), node.name)
  }
  return byName
}

/** Exato primeiro: `LeftHand` não pode casar com `LeftHandRing1`. */
function findBone(index: Map<string, string>, pattern: string): string | null {
  const wanted = slotKey(pattern)
  const exact = index.get(wanted)
  if (exact) return exact
  for (const [name, original] of index) {
    if (name.startsWith(wanted)) return original
  }
  return null
}

/**
 * Liga os ossos do alvo aos do clipe, pelo papel de cada um no corpo.
 *
 * Devolve `{ osso do alvo: osso da fonte }`, que é o sentido que o `names`
 * do `SkeletonUtils` espera. Vazio quando nenhuma família é reconhecida.
 */
function resolveSlots(target: THREE.Object3D, source: THREE.Object3D) {
  const targetIndex = indexBones(target)
  const sourceIndex = indexBones(source)

  let best: Partial<Record<Slot, { target: string; source: string }>> = {}
  for (const skeleton of Object.values(SKELETONS)) {
    const found: Partial<Record<Slot, { target: string; source: string }>> = {}
    for (const slot of SLOTS) {
      const targetPattern = skeleton[slot]
      const sourcePattern = SKELETONS.mixamo[slot]
      if (!targetPattern || !sourcePattern) continue
      const targetBone = findBone(targetIndex, targetPattern)
      const sourceBone = findBone(sourceIndex, sourcePattern)
      if (targetBone && sourceBone) found[slot] = { target: targetBone, source: sourceBone }
    }
    if (Object.keys(found).length > Object.keys(best).length) best = found
  }

  return Object.keys(best).length >= MIN_SLOTS ? best : {}
}

/**
 * Liga os ossos do alvo aos do clipe, pelo papel de cada um no corpo.
 *
 * Devolve `{ osso do alvo: osso da fonte }`, que é o sentido que o `names`
 * do `SkeletonUtils` espera, e só para os ossos que a animação dirige —
 * ver `DRIVEN`. Vazio quando nenhuma família é reconhecida.
 */
export function boneNameMap(
  target: THREE.Object3D,
  source: THREE.Object3D,
): Record<string, string> {
  const slots = resolveSlots(target, source)
  const map: Record<string, string> = {}
  for (const slot of DRIVEN) {
    const pair = slots[slot]
    if (pair) map[pair.target] = pair.source
  }
  return map
}

/**
 * Gira a fonte até o corpo dela apontar para onde o corpo do alvo aponta.
 *
 * O `retargetClip` põe cada osso do alvo na orientação de **mundo** do osso
 * correspondente da fonte. Isso só dá o gesto certo se os dois corpos
 * estiverem virados para o mesmo lado em repouso — e nunca estão: o
 * esqueleto do clipe fica na orientação que o Mixamo exporta, e o modelo do
 * jogo já passou pelo giro e pela escala que o carregador aplica para ele
 * caber no palco.
 *
 * Sem este alinhamento o personagem não fica torto: ele **deita no chão**,
 * porque a diferença entre os dois repousos é aplicada ao quadril e daí
 * desce para o corpo inteiro.
 *
 * Só a rotação importa. A posição é descartada das faixas depois, e a
 * escala o próprio `retargetClip` já ignora ao extrair a rotação.
 */
function alignRestPose(source: THREE.Object3D, target: THREE.Object3D) {
  // O quadril é a referência de aprumo, mesmo não sendo dirigido: é dele
  // que o corpo inteiro pendura, nos dois esqueletos.
  const par = resolveSlots(target, source).hips
  if (!par) return

  const sourceHips = bonesOf(source).find((b) => b.name === par.source)
  const targetHips = bonesOf(target).find((b) => b.name === par.target)
  if (!sourceHips || !targetHips) return

  source.updateMatrixWorld(true)
  target.updateMatrixWorld(true)

  // A conta é no espaço do alvo, e não no mundo, porque é assim que o
  // `retargetClip` compara os dois: ele traz o osso da fonte para dentro da
  // matriz da malha do alvo antes de ler a orientação.
  const noAlvo = target
    .getWorldQuaternion(new THREE.Quaternion())
    .invert()
    .multiply(targetHips.getWorldQuaternion(new THREE.Quaternion()))
  const naFonte = sourceHips.getWorldQuaternion(new THREE.Quaternion())

  source.quaternion.premultiply(noAlvo.multiply(naFonte.invert()))
  source.updateMatrixWorld(true)
}

/**
 * Adapta um clipe Mixamo a um esqueleto de outra convenção.
 *
 * `target` precisa ser a malha com esqueleto (`SkinnedMesh`), porque é dela
 * que o `SkeletonUtils` lê os ossos. `source` é a cena do arquivo do clipe.
 *
 * Devolve `null` quando o esqueleto não é de nenhuma família conhecida.
 */
export function retargetMapped(
  clip: THREE.AnimationClip,
  original: THREE.Object3D,
  target: THREE.SkinnedMesh,
): THREE.AnimationClip | null {
  // A adaptação reproduz o clipe na fonte, quadro a quadro, e com isso
  // **mexe** nos nós dela. A cena do clipe é compartilhada entre os quatro
  // papéis do palco e fica em cache, então trabalha-se sobre uma cópia —
  // senão o segundo integrante a carregar leria a pose que o primeiro
  // deixou para trás, em vez da pose de repouso.
  const source = original.clone(true)
  const sourceIndex = indexBones(source)
  const names = boneNameMap(target, source)
  if (Object.keys(names).length < MIN_SLOTS) return null

  // O arquivo do clipe vem **sem skin**: a malha do boneco cinza é jogada
  // fora na preparação, e com ela some o `Skeleton`. Os nós continuam lá com
  // a pose de repouso, que é tudo que o retargeting precisa, então o
  // esqueleto é remontado aqui a partir deles.
  source.updateMatrixWorld(true)
  const sourceBones = bonesOf(source).filter((node) => node.name)
  const sourceSkeleton = new THREE.Skeleton(sourceBones as THREE.Bone[])

  alignRestPose(source, target)

  // `hip` é o nome do osso **na fonte**: é por ele que o SkeletonUtils
  // reconhece a raiz e trata o deslocamento do quadril à parte.
  const hip = findBone(sourceIndex, 'mixamorig:Hips') ?? undefined

  // A adaptação **escreve nos ossos do alvo** enquanto assa os quadros, e o
  // que escreve são as posições da fonte, na escala da fonte. O que sai
  // daqui é um clipe, não uma pose, então a pose de repouso é guardada
  // antes e devolvida depois.
  const targetBones = bonesOf(target)
  const rest = targetBones.map((b) => ({
    position: b.position.clone(),
    quaternion: b.quaternion.clone(),
    scale: b.scale.clone(),
  }))

  let retargeted: THREE.AnimationClip
  try {
    retargeted = SkeletonUtils.retargetClip(target, sourceSkeleton, clip, { names, hip })
  } catch (erro) {
    console.warn('não deu para adaptar o clipe a este esqueleto', erro)
    return null
  } finally {
    for (let i = 0; i < targetBones.length; i++) {
      targetBones[i].position.copy(rest[i].position)
      targetBones[i].quaternion.copy(rest[i].quaternion)
      targetBones[i].scale.copy(rest[i].scale)
    }
    target.updateMatrixWorld(true)
  }

  // Duas limpezas nas faixas que saem.
  //
  // **As de posição saem**, pelo motivo de sempre: vêm na escala do clipe, e
  // o modelo foi reescalado para caber no palco.
  //
  // **As de rotação são renomeadas.** O SkeletonUtils as endereça como
  // `.bones[Osso].quaternion`, forma que só casa quando o mixer está ligado
  // a uma `SkinnedMesh` — ela é quem tem `.skeleton`. O jogo liga o mixer à
  // raiz do modelo, porque um personagem partido em dezoito malhas não tem
  // uma malha óbvia para servir de âncora. Endereçado pelo nome do osso, o
  // mesmo clipe casa nos dois casos. Sem isto ele não casa em lugar nenhum,
  // e falha **em silêncio**: o mixer avisa no console e a animação some.
  const tracks: THREE.KeyframeTrack[] = []
  for (const track of retargeted.tracks) {
    if (!track.name.endsWith('.quaternion')) continue
    const bone = track.name.match(/^\.bones\[(.+)\]\.quaternion$/)?.[1]
    const copy = track.clone()
    copy.name = bone ? `${bone}.quaternion` : track.name
    tracks.push(copy)
  }
  if (tracks.length === 0) return null

  return new THREE.AnimationClip(clip.name, retargeted.duration, tracks)
}
