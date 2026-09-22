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
 * ## Por que não dá para copiar a orientação de mundo
 *
 * A saída óbvia — e o que o `SkeletonUtils.retargetClip` do three faz — é
 * pôr cada osso do alvo na orientação de **mundo** do osso correspondente da
 * fonte. Está no `retarget` de lá, e é literalmente isto:
 *
 * ```js
 * globalMatrix.makeRotationFromQuaternion(quat.setFromRotationMatrix(relativeMatrix))
 * bone.matrix.copy(bone.parent.matrixWorld).invert().multiply(globalMatrix)
 * ```
 *
 * Não há desconto de pose de repouso em lugar nenhum: a orientação de mundo
 * é copiada crua. E orientação de mundo de um osso **não** é a direção do
 * osso — é a base local dele, que cada ferramenta escolhe como quer. O
 * Mixamo faz o úmero correr no +Y do osso; o esqueleto do Unreal faz correr
 * no +X; o do Maya, em outro. Forçar as duas bases a coincidir alinha eixos
 * que não são homólogos, e o braço aponta para um lado arbitrário — medido:
 * a mão direita do Douglas e a do Teixeira atravessavam para o lado esquerdo
 * do corpo.
 *
 * ## Nem dá para somar o gesto ao repouso
 *
 * A correção clássica seria aplicar só a **variação** desde o repouso
 * (`Rs(t)·Rs_repouso⁻¹` sobre o repouso do alvo). Aqui isso também está
 * errado, e a medida diz por quê: o esqueleto do clipe está em **T** (braços
 * na horizontal, 0°) e os modelos do elenco repousam todos em **A** (de -42°
 * a -48°). Somar ao repouso do alvo o gesto que sai de uma T-pose baixaria o
 * braço 45 graus além da conta.
 *
 * E não é isso que os modelos que funcionam fazem. Vermelhão e Kairos são
 * rigs Mixamo, passam pelo `retarget` acima — cópia direta da rotação
 * **local** — e com isso a pose de repouso deles é simplesmente
 * **substituída** pela do clipe. Medido: a direção dos braços deles bate com
 * a do clipe a menos de 0,03. A semântica correta, portanto, é
 * *substituição*, não soma.
 *
 * ## O que este arquivo faz
 *
 * Reproduz a **geometria** do membro, e não a base dos ossos: para cada
 * segmento do braço, gira o osso do alvo até ele apontar na mesma direção
 * que o segmento correspondente da fonte, medida no referencial do corpo de
 * cada um. Direção é homóloga entre rigs; base local não é.
 *
 * O referencial do corpo sai da anatomia, não de nome de osso: o eixo dos
 * ombros e a vertical do mundo. É o que torna a conta independente de
 * ferramenta, e o que substituiu o antigo alinhamento pelo quadril — que
 * mantinha o corpo de pé mas não dizia nada sobre os eixos dos braços.
 *
 * Para a mão não há segmento seguinte que sirva de mira, então ela recebe a
 * orientação que tem **em relação ao antebraço** na fonte, corrigida pela
 * diferença entre os dois repousos. É a única parte em que a base local
 * entra, e entra onde é legítima: o pulso repousa neutro nos dois rigs.
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
 * Estão em **cadeia, da raiz para a ponta**, e a ordem é parte da conta: o
 * ombro é mirado primeiro porque girá-lo move o braço, e mirar o braço antes
 * disso seria mirar de um lugar onde ele não vai ficar. Um papel que o
 * esqueleto não tem sai da cadeia — o Biped do 3ds Max, por exemplo, tem os
 * quatro, mas um rig sem clavícula começa no úmero.
 *
 * O recorte saiu de tentativa em tela, não de teoria. O resto do corpo fica
 * de fora porque a diferença entre dois esqueletos sobra justamente nele:
 *
 * - **quadril** — é a raiz de tudo, e o corpo inteiro pendura daí. Dirigi-lo
 *   deitou um modelo no chão e dobrou o outro no ar.
 * - **pernas** — mesmo problema, com o agravante de que cada ferramenta
 *   orienta a coxa de um jeito. Rendeu um chute alto no meio da música.
 * - **coluna, pescoço e cabeça** — o corpo fica de pé, mas curvado para a
 *   frente com a cabeça baixa: a rotação de quadril da fonte, que o alvo não
 *   acompanha, sobra toda na coluna.
 *
 * O que fica é o que "tocar guitarra" quer dizer, e é o que sobrevive à
 * diferença entre os esqueletos: os braços. O personagem fica **plantado**
 * na pose de repouso e toca — que é como um guitarrista de pé diante do
 * microfone se comporta de qualquer forma.
 *
 * O quadril continua no mapa de papéis mesmo sem ser dirigido, porque é a
 * **referência de aprumo**: é dele que sai o para-cima do tronco com que os
 * dois corpos são comparados (ver `bodyBasis`).
 */
const CHAINS: readonly (readonly Slot[])[] = [
  ['leftShoulder', 'leftArm', 'leftForeArm', 'leftHand'],
  ['rightShoulder', 'rightArm', 'rightForeArm', 'rightHand'],
]

/** Os mesmos ossos, soltos — é a forma que o mapa de nomes quer. */
const DRIVEN: readonly Slot[] = CHAINS.flat()

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
  /**
   * Biped do 3ds Max. O braço não se chama "UpperArm": é `Arm`, `Arm1` e
   * `Arm2`, e nenhuma busca por "upper" ou "fore" acharia.
   *
   * **São quatro ossos, e o primeiro é a clavícula.** Contá-los como três —
   * `Arm` de úmero, `Arm1` de antebraço — desloca a cadeia inteira em um, e
   * deixa `Arm2`, que é o antebraço de verdade, sem receber nada. Medido no
   * Gokê, contra o rig Mixamo do Vermelhão, os comprimentos não deixam
   * dúvida:
   *
   * | Biped | | Mixamo | |
   * |---|---|---|---|
   * | `Arm` → `Arm1` | 0,102 m | `Shoulder` → `Arm` | 0,132 m |
   * | `Arm1` → `Arm2` | 0,236 m | `Arm` → `ForeArm` | 0,229 m |
   * | `Arm2` → `Hand` | 0,219 m | `ForeArm` → `Hand` | 0,234 m |
   *
   * O `Arm` do Biped pendura no **pescoço** e mede 10 cm: é clavícula, não
   * braço. Com o deslocamento, o Gokê tocava com os dois punhos a meio metro
   * um do outro, porque o que se dirigia como antebraço era o úmero inteiro.
   */
  'max-biped': {
    hips: 'Bip01 Pelvis', spine: 'Bip01 Spine', spine1: 'Bip01 Spine1',
    spine2: 'Bip01 Spine2', neck: 'Bip01 Neck', head: 'Bip01 Head',
    leftShoulder: 'Bip01 L Arm', leftArm: 'Bip01 L Arm1',
    leftForeArm: 'Bip01 L Arm2', leftHand: 'Bip01 L Hand',
    rightShoulder: 'Bip01 R Arm', rightArm: 'Bip01 R Arm1',
    rightForeArm: 'Bip01 R Arm2', rightHand: 'Bip01 R Hand',
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
 * Devolve `{ papel: { alvo, fonte } }`, com o nome de osso de cada lado.
 * Vazio quando nenhuma família é reconhecida — e é de propósito: meia dúzia
 * de ossos casados de um esqueleto de outra convenção produz um boneco
 * torto, que é pior do que não animar.
 *
 * A família é escolhida por **maioria**: tenta-se cada convenção conhecida e
 * fica a que casar mais papéis. Não há como perguntar ao arquivo de que
 * ferramenta ele saiu.
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
 * O mesmo, achatado: `{ osso do alvo: osso da fonte }`.
 *
 * Só para os ossos que a animação dirige — ver `CHAINS`. Vazio quando
 * nenhuma família é reconhecida.
 *
 * O `retargetMapped` não usa este mapa: ele precisa dos nós, e em cadeia.
 * Isto aqui é a forma legível do casamento, e é por ela que os testes
 * verificam que cada convenção de nome foi reconhecida.
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

/** Os ossos de um objeto, indexados pelo nome exato. */
function nodesByName(root: THREE.Object3D) {
  const byName = new Map<string, THREE.Object3D>()
  for (const node of bonesOf(root)) if (node.name) byName.set(node.name, node)
  return byName
}

const _up = new THREE.Vector3(0, 1, 0)

/**
 * Os pares de ossos que servem de eixo esquerda-direita, em ordem de
 * preferência.
 *
 * O primeiro é o melhor porque é o mais perto dos ossos que se vai dirigir:
 * a raiz dos dois braços. Os outros entram quando o esqueleto não nomeia
 * clavícula, ou quando o rig só traz as pernas com nome reconhecível.
 */
const SIDE_PAIRS: ReadonlyArray<readonly [Slot, Slot]> = [
  ['leftArm', 'rightArm'],
  ['leftShoulder', 'rightShoulder'],
  ['leftUpLeg', 'rightUpLeg'],
]

/**
 * O referencial do corpo, tirado da anatomia.
 *
 * Duas medidas, e nenhuma delas depende de como a ferramenta nomeia ou
 * orienta osso:
 *
 * - **o eixo esquerda-direita**, entre dois ossos simétricos;
 * - **o para-cima do tronco**, do quadril até o meio desse par.
 *
 * O para-cima sai do tronco, e não do +Y do mundo, porque o mundo não sabe
 * que o tronco se inclinou. Um clipe que curva o corpo para a frente gira o
 * quadril em torno do eixo lateral — e uma rotação em torno do eixo lateral
 * **não mexe no eixo lateral**. Medido com a vertical do mundo, o corpo
 * parecia parado enquanto se curvava, e a inclinação vazava toda para dentro
 * do braço do alvo, que fica plantado. Com o tronco de referência, ela é
 * descontada.
 *
 * Sem quadril reconhecível cai na vertical do mundo, que é a hipótese certa
 * para um modelo de pé — e o carregador põe todos de pé (ver `normalize` em
 * `characterGlb.ts`).
 *
 * Devolve o quaternion que leva coordenadas **do corpo para o mundo**. É com
 * ele que uma direção medida na fonte é transportada para o alvo: tira-se do
 * mundo da fonte para o corpo dela, e põe-se do corpo do alvo para o mundo
 * dele. Sem isso o gesto sairia girado pela diferença de para onde cada
 * modelo olha — e eles olham para lados diferentes: o Kairos nasce virado
 * meia volta em relação ao Vermelhão.
 */
function bodyBasis(pick: (slot: Slot) => THREE.Object3D | null): THREE.Quaternion | null {
  const hips = pick('hips')

  for (const [leftSlot, rightSlot] of SIDE_PAIRS) {
    const left = pick(leftSlot)
    const right = pick(rightSlot)
    if (!left || !right) continue

    const a = new THREE.Vector3().setFromMatrixPosition(left.matrixWorld)
    const b = new THREE.Vector3().setFromMatrixPosition(right.matrixWorld)
    const sideways = a.clone().sub(b)
    if (sideways.lengthSq() < 1e-12) continue
    sideways.normalize()

    const up = hips
      ? a
          .add(b)
          .multiplyScalar(0.5)
          .sub(new THREE.Vector3().setFromMatrixPosition(hips.matrixWorld))
      : _up.clone()
    if (up.lengthSq() < 1e-12) up.copy(_up)

    // `lado × cima` é o para-frente, nesta ordem: com lado em +X e cima em
    // +Y, o produto dá +Z, que é a plateia. Trocar a ordem daria uma base
    // canhota, e o quaternion sairia de uma matriz que não é rotação.
    const forward = new THREE.Vector3().crossVectors(sideways, up)
    if (forward.lengthSq() < 1e-12) continue
    forward.normalize()

    // O para-cima do tronco não é exatamente perpendicular ao eixo dos
    // ombros; refazê-lo pelo produto dos outros dois deixa a base ortonormal,
    // que é o que `makeBasis` precisa para virar rotação.
    const trueUp = new THREE.Vector3().crossVectors(forward, sideways).normalize()

    const basis = new THREE.Matrix4().makeBasis(sideways, trueUp, forward)
    return new THREE.Quaternion().setFromRotationMatrix(basis)
  }
  return null
}

/** A direção de um osso para o seguinte, em mundo. */
function segmentDir(from: THREE.Object3D, to: THREE.Object3D) {
  const a = new THREE.Vector3().setFromMatrixPosition(from.matrixWorld)
  const b = new THREE.Vector3().setFromMatrixPosition(to.matrixWorld)
  return b.sub(a)
}

const _cur = new THREE.Vector3()
const _spin = new THREE.Quaternion()
const _world = new THREE.Quaternion()
const _parent = new THREE.Quaternion()

/**
 * Gira um osso até o segmento dele apontar para `want`.
 *
 * O giro é calculado e aplicado **em mundo**, e só depois convertido para o
 * espaço do pai — que é onde o quaternion do osso vive. Fazer a conta no
 * espaço local exigiria saber como esta ferramenta orienta o osso, que é
 * justamente o que não se quer saber.
 */
function aimBone(bone: THREE.Object3D, child: THREE.Object3D, want: THREE.Vector3) {
  bone.updateWorldMatrix(true, true)
  _cur.copy(segmentDir(bone, child))
  if (_cur.lengthSq() < 1e-12) return
  _cur.normalize()

  _spin.setFromUnitVectors(_cur, want)
  bone.getWorldQuaternion(_world)
  _spin.multiply(_world)

  if (bone.parent) {
    bone.parent.getWorldQuaternion(_parent)
    bone.quaternion.copy(_parent.invert()).multiply(_spin)
  } else {
    bone.quaternion.copy(_spin)
  }
  bone.updateWorldMatrix(false, true)
}

/** Orientação de um osso em relação a outro, os dois em mundo. */
function relativeTo(parent: THREE.Object3D, child: THREE.Object3D) {
  return parent
    .getWorldQuaternion(new THREE.Quaternion())
    .invert()
    .multiply(child.getWorldQuaternion(new THREE.Quaternion()))
}

/** A pose de um esqueleto, para guardar e devolver. */
function snapshot(bones: THREE.Object3D[]) {
  return bones.map((b) => b.quaternion.clone())
}

function restore(bones: THREE.Object3D[], pose: THREE.Quaternion[], root: THREE.Object3D) {
  for (let i = 0; i < bones.length; i++) bones[i].quaternion.copy(pose[i])
  root.updateMatrixWorld(true)
}

/**
 * Adapta um clipe Mixamo a um esqueleto de outra convenção.
 *
 * `target` precisa ser a malha com esqueleto (`SkinnedMesh`), porque é dela
 * que sai a lista de ossos. `source` é a cena do arquivo do clipe.
 *
 * Devolve `null` quando o esqueleto não é de nenhuma família conhecida.
 *
 * A conta está no bloco de doc do meio do arquivo; o resumo é que se mira a
 * **direção** de cada segmento do braço, e não a base local do osso.
 */
export function retargetMapped(
  clip: THREE.AnimationClip,
  original: THREE.Object3D,
  target: THREE.SkinnedMesh,
): THREE.AnimationClip | null {
  // Reproduzir o clipe **mexe** nos nós da fonte, e a cena do clipe fica em
  // cache compartilhada entre os quatro papéis do palco. Sem a cópia, o
  // segundo integrante a carregar leria a pose que o primeiro deixou para
  // trás em vez da pose de repouso.
  const source = original.clone(true)
  source.updateMatrixWorld(true)

  const slots = resolveSlots(target, source)
  if (Object.keys(slots).length < MIN_SLOTS) return null

  const sourceNodes = nodesByName(source)
  const targetNodes = nodesByName(target)
  const pair = (slot: Slot) => {
    const p = slots[slot]
    if (!p) return null
    const t = targetNodes.get(p.target)
    const s = sourceNodes.get(p.source)
    return t && s ? { target: t, source: s } : null
  }

  // As cadeias que dá para dirigir neste par de esqueletos. Uma cadeia com
  // menos de dois ossos não tem segmento nenhum para mirar.
  const chains = CHAINS.map((slotsOfChain) =>
    slotsOfChain.map(pair).filter((p): p is NonNullable<typeof p> => !!p),
  ).filter((chain) => chain.length >= 2)
  if (chains.length === 0) return null

  const targetBones = bonesOf(target)
  const sourceBones = bonesOf(source)
  const targetRest = snapshot(targetBones)
  const sourceRest = snapshot(sourceBones)

  /**
   * O referencial do corpo do alvo, lido **uma vez, na pose de repouso**.
   *
   * Uma vez basta porque o tronco do alvo não é dirigido: ele fica plantado
   * no repouso e só os braços se mexem (ver `DRIVEN`).
   */
  const targetBasis = bodyBasis((slot) => pair(slot)?.target ?? null)

  /**
   * O da fonte é relido **a cada quadro**, e aí está a diferença.
   *
   * O clipe do Mixamo gira o quadril, e o tronco inteiro vai com ele. Como o
   * tronco do alvo fica parado, medir a direção do braço no mundo da fonte
   * carregaria esse giro para dentro do braço do alvo — e a guitarra pendura
   * no quadril, que não acompanha. As mãos iriam saindo de cima dela ao longo
   * da música.
   *
   * Relendo o referencial a cada quadro, a direção passa a ser medida em
   * relação ao tronco da fonte, e o balanço de quadril sai da conta sozinho.
   * Neste clipe ele é pequeno — medido, no máximo 2,1 graus, e o eixo dos
   * ombros o acompanha dentro de 2 — mas de graça não há motivo para deixar.
   */
  const sourceBasisNow = () => bodyBasis((slot) => pair(slot)?.source ?? null)

  /**
   * Sem um par simétrico não dá para medir para onde um corpo olha.
   *
   * Acontece em esqueleto de um braço só, que na prática é fixture de teste.
   * A escolha neutra é assumir que os dois olham para o mesmo lado: é o que
   * o transporte identidade faz.
   */
  const transport = (source: THREE.Quaternion | null) =>
    source && targetBasis
      ? targetBasis.clone().multiply(source.clone().invert())
      : new THREE.Quaternion()

  // A mão não tem segmento seguinte para mirar: ela recebe a orientação que
  // tem em relação ao antebraço, corrigida pela diferença entre os repousos.
  const wristFix = chains.map((chain) => {
    if (chain.length < 3) return null
    const fore = chain[chain.length - 2]
    const hand = chain[chain.length - 1]
    const naFonte = relativeTo(fore.source, hand.source)
    const noAlvo = relativeTo(fore.target, hand.target)
    return { fore, hand, fix: naFonte.invert().multiply(noAlvo) }
  })

  // Amostragem uniforme, na cadência da faixa mais densa do clipe: é a
  // mesma régua que o clipe original usa, então nada de movimento se perde.
  const perSecond = Math.max(...clip.tracks.map((t) => t.times.length)) / clip.duration
  const frames = Math.max(2, Math.round(clip.duration * perSecond))
  const step = clip.duration / (frames - 1)

  const mixer = new THREE.AnimationMixer(source)
  mixer.clipAction(clip).play()

  // Uma pista de rotação por osso dirigido.
  const driven = new Map<THREE.Object3D, { name: string; values: number[] }>()
  for (const chain of chains) {
    for (const bone of chain) {
      if (!driven.has(bone.target)) driven.set(bone.target, { name: bone.target.name, values: [] })
    }
  }
  const times: number[] = []

  for (let frame = 0; frame < frames; frame++) {
    const time = frame * step
    times.push(time)

    mixer.setTime(time)
    source.updateMatrixWorld(true)
    const carry = transport(sourceBasisNow())

    // O alvo volta ao repouso a cada quadro: o que se escreve nele é uma
    // pose absoluta, não um acréscimo à do quadro anterior.
    restore(targetBones, targetRest, target)

    for (let c = 0; c < chains.length; c++) {
      const chain = chains[c]
      // Da raiz para a ponta: girar o ombro move o braço, então o braço só
      // pode ser mirado depois.
      for (let i = 0; i < chain.length - 1; i++) {
        const want = segmentDir(chain[i].source, chain[i + 1].source)
        if (want.lengthSq() < 1e-12) continue
        want.normalize().applyQuaternion(carry)
        aimBone(chain[i].target, chain[i + 1].target, want)
      }

      const wrist = wristFix[c]
      if (wrist) {
        const { fore, hand, fix } = wrist
        const desired = relativeTo(fore.source, hand.source).multiply(fix)
        const world = fore.target.getWorldQuaternion(new THREE.Quaternion()).multiply(desired)
        const parent = hand.target.parent
        hand.target.quaternion.copy(
          parent
            ? parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)
            : world,
        )
        hand.target.updateWorldMatrix(false, true)
      }
    }

    for (const [bone, track] of driven) {
      track.values.push(bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w)
    }
  }

  // O que sai daqui é um clipe, não uma pose: os dois esqueletos voltam como
  // estavam. Sem isto o personagem ficaria congelado no último quadro assado
  // até o mixer começar a tocar.
  restore(targetBones, targetRest, target)
  restore(sourceBones, sourceRest, source)
  mixer.stopAllAction()

  // As faixas são endereçadas **pelo nome do osso**, e não como
  // `.bones[Osso].quaternion`: esta última só casa quando o mixer está ligado
  // a uma `SkinnedMesh`, e o jogo liga o mixer à raiz do modelo, porque um
  // personagem partido em dezoito malhas não tem uma malha óbvia para servir
  // de âncora. Pelo nome do osso o mesmo clipe casa nos dois casos.
  const tracks: THREE.KeyframeTrack[] = []
  for (const track of driven.values()) {
    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${track.name}.quaternion`,
        new Float32Array(times),
        new Float32Array(track.values),
      ),
    )
  }
  if (tracks.length === 0) return null

  return new THREE.AnimationClip(clip.name, clip.duration, tracks)
}
