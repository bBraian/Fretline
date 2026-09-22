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
  'leftUpLeg', 'leftLeg', 'leftFoot', 'leftToe',
  'rightUpLeg', 'rightLeg', 'rightFoot', 'rightToe',
  // A base dos dedos. Não são dirigidos — servem de **marco**, para dar à
  // mão um referencial que não dependa de como o rig orienta o osso do
  // pulso. Ver `handBasis`.
  'leftIndex', 'leftMiddle', 'leftRing', 'leftLittle', 'leftThumb',
  'rightIndex', 'rightMiddle', 'rightRing', 'rightLittle', 'rightThumb',
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

/**
 * O tronco e as pernas, dirigidos **antes** dos braços.
 *
 * Ficaram de fora por muito tempo, e o motivo não valia mais: era o método
 * antigo, que escrevia em cada osso a orientação de **mundo** do osso da
 * fonte. Aquilo deitava um modelo no chão, dobrava outro no ar e dava um
 * chute alto no meio da música, porque cada ferramenta orienta coxa e coluna
 * de um jeito. Mirar direção de elo não tem esse problema — direção é a mesma
 * coisa em qualquer rig —, e com ela o corpo inteiro acompanha, que é o que
 * separava um personagem que **toca** de um que só mexe o braço.
 *
 * **O quadril continua fora, e agora por um motivo estrutural:** ele é o pai
 * dos três, e as três cadeias discordariam sobre para onde girá-lo. Ele segue
 * sendo a referência de aprumo (ver `bodyBasis`), e o personagem fica
 * plantado — que é como um guitarrista diante do microfone se comporta.
 *
 * A ordem importa: a clavícula pendura na coluna, então a coluna tem de parar
 * antes de o braço ser mirado. Como a mira é **absoluta em mundo**, o braço
 * não herda duas vezes o giro do tronco — ele simplesmente vai para onde tem
 * de ir, seja qual for a pose da coluna.
 */
const BODY_CHAINS: readonly (readonly Slot[])[] = [
  ['spine', 'spine1', 'spine2', 'neck', 'head'],
  ['leftUpLeg', 'leftLeg', 'leftFoot', 'leftToe'],
  ['rightUpLeg', 'rightLeg', 'rightFoot', 'rightToe'],
]

/** Os mesmos ossos, soltos — é a forma que o mapa de nomes quer. */
const DRIVEN: readonly Slot[] = [...CHAINS, ...BODY_CHAINS].flat()

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
    leftIndex: 'mixamorig:LeftHandIndex1', leftMiddle: 'mixamorig:LeftHandMiddle1',
    leftRing: 'mixamorig:LeftHandRing1', leftLittle: 'mixamorig:LeftHandPinky1', leftThumb: 'mixamorig:LeftHandThumb1',
    rightIndex: 'mixamorig:RightHandIndex1', rightMiddle: 'mixamorig:RightHandMiddle1',
    rightRing: 'mixamorig:RightHandRing1', rightLittle: 'mixamorig:RightHandPinky1', rightThumb: 'mixamorig:RightHandThumb1',
    leftUpLeg: 'mixamorig:LeftUpLeg', leftLeg: 'mixamorig:LeftLeg', leftFoot: 'mixamorig:LeftFoot',
    leftToe: 'mixamorig:LeftToeBase', rightToe: 'mixamorig:RightToeBase',
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
    // `Finger_01` a `Finger_04` não dizem qual dedo é qual. A ordem saiu de
    // medir a distância ao polegar: o `01` é o mais perto dele (5,8 cm) e o
    // `04` o mais longe (7,7 cm), então é índice → mindinho.
    leftIndex: 'l_Finger_01_01SHJnt', leftMiddle: 'l_Finger_02_01SHJnt',
    leftRing: 'l_Finger_03_01SHJnt', leftLittle: 'l_Finger_04_01SHJnt', leftThumb: 'l_Thumb_01_01SHJnt',
    rightIndex: 'r_Finger_01_01SHJnt', rightMiddle: 'r_Finger_02_01SHJnt',
    rightRing: 'r_Finger_03_01SHJnt', rightLittle: 'r_Finger_04_01SHJnt', rightThumb: 'r_Thumb_01_01SHJnt',
    leftUpLeg: 'l_Leg_Hip', leftLeg: 'l_Leg_Knee', leftFoot: 'l_Leg_Ankle',
    leftToe: 'l_Leg_Ball', rightToe: 'r_Leg_Ball',
    rightUpLeg: 'r_Leg_Hip', rightLeg: 'r_Leg_Knee', rightFoot: 'r_Leg_Ankle',
  },
  // Rigify, do Blender. **Os ossos que deformam são os `DEF-`**, não os
  // `ORG-`: no Rigify os DEF copiam os ORG por restrição, e restrição não
  // existe em glTF. Medido no Darth Vader: das 707 juntas, as 150 que
  // carregam peso são todas DEF. Animar os ORG não move um pixel.
  rigify: {
    hips: 'DEF-spine', spine: 'DEF-spine.001', spine1: 'DEF-spine.002',
    // O Rigify parte o pescoço em três juntas (`.004`, `.005`, `.006`) onde o
    // Mixamo tem duas. Pelos comprimentos, o homólogo do pescoço do clipe é o
    // `.004` — o vão coluna→pescoço mede 0,169 lá e 0,168 aqui. Mas medido em
    // tela o `.005` sai melhor: com o `.004` a dobra da junta ia a 52 graus
    // contra 46. A junta que sobra sempre guarda uma diferença, e é menor
    // deixando-a **acima** do osso dirigido do que abaixo.
    spine2: 'DEF-spine.003', neck: 'DEF-spine.005', head: 'DEF-spine.006',
    leftShoulder: 'DEF-shoulder.L', leftArm: 'DEF-upper_arm.L',
    leftForeArm: 'DEF-forearm.L', leftHand: 'DEF-hand.L',
    rightShoulder: 'DEF-shoulder.R', rightArm: 'DEF-upper_arm.R',
    rightForeArm: 'DEF-forearm.R', rightHand: 'DEF-hand.R',
    leftIndex: 'DEF-f_index.01.L', leftMiddle: 'DEF-f_middle.01.L',
    leftRing: 'DEF-f_ring.01.L', leftLittle: 'DEF-f_pinky.01.L', leftThumb: 'DEF-thumb.01.L',
    rightIndex: 'DEF-f_index.01.R', rightMiddle: 'DEF-f_middle.01.R',
    rightRing: 'DEF-f_ring.01.R', rightLittle: 'DEF-f_pinky.01.R', rightThumb: 'DEF-thumb.01.R',
    leftUpLeg: 'DEF-thigh.L', leftLeg: 'DEF-shin.L', leftFoot: 'DEF-foot.L',
    leftToe: 'DEF-toe.L', rightToe: 'DEF-toe.R',
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
    // O Biped numera os dedos a partir do polegar, e este rig só trouxe dois:
    // `Finger0` é o polegar e `Finger1` o índice. Sem mindinho, o referencial
    // da palma sai do par polegar→índice — ver `handBasis`.
    leftIndex: 'Bip01 L Finger1', leftThumb: 'Bip01 L Finger0',
    rightIndex: 'Bip01 R Finger1', rightThumb: 'Bip01 R Finger0',
    // A perna segue a mesma numeração do braço, e pela mesma razão não se
    // chama "Thigh" nem "Calf": é `Leg`, `Leg1` e `Foot`.
    leftUpLeg: 'Bip01 L Leg', leftLeg: 'Bip01 L Leg1', leftFoot: 'Bip01 L Foot',
    rightUpLeg: 'Bip01 R Leg', rightLeg: 'Bip01 R Leg1', rightFoot: 'Bip01 R Foot',
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
    leftThumb: 'ValveBiped.Bip01_L_Finger0', leftIndex: 'ValveBiped.Bip01_L_Finger1',
    leftMiddle: 'ValveBiped.Bip01_L_Finger2', leftRing: 'ValveBiped.Bip01_L_Finger3', leftLittle: 'ValveBiped.Bip01_L_Finger4',
    rightThumb: 'ValveBiped.Bip01_R_Finger0', rightIndex: 'ValveBiped.Bip01_R_Finger1',
    rightMiddle: 'ValveBiped.Bip01_R_Finger2', rightRing: 'ValveBiped.Bip01_R_Finger3', rightLittle: 'ValveBiped.Bip01_R_Finger4',
    leftToe: 'ValveBiped.Bip01_L_Toe0', rightToe: 'ValveBiped.Bip01_R_Toe0',
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
    leftIndex: 'index_01_l', leftMiddle: 'middle_01_l',
    leftRing: 'ring_01_l', leftLittle: 'pinky_01_l', leftThumb: 'thumb_01_l',
    rightIndex: 'index_01_r', rightMiddle: 'middle_01_r',
    rightRing: 'ring_01_r', rightLittle: 'pinky_01_r', rightThumb: 'thumb_01_r',
    leftUpLeg: 'thigh_l', leftLeg: 'calf_l', leftFoot: 'foot_l',
    leftToe: 'ball_l', rightToe: 'ball_r',
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

/**
 * O mesmo, para um padrão **escrito à mão** aqui no arquivo.
 *
 * A diferença é uma só, e é decisiva: **não corta o sufixo numérico do fim.**
 * Esse corte existe para o ruído que o exportador acrescenta ao nome do osso
 * (`mixamorigHips_01`), e um padrão escrito aqui nunca tem esse ruído — o que
 * ele pode ter é um número que **faz parte do nome**.
 *
 * É o caso do esqueleto do Unreal, cuja coluna é `spine_01`, `spine_02` e
 * `spine_03`. Cortados, os três viram `spine` e casam todos com o primeiro
 * osso: a coluna inteira colapsa numa junta só, os elos ficam de comprimento
 * zero e o tronco não se mexe. Passou despercebido enquanto só os braços eram
 * dirigidos, porque nome de osso de braço não termina em número.
 */
function patternKey(name: string) {
  return name.replace(/\s/g, '_').replace(/[:.]/g, '').toLowerCase()
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
  const wanted = patternKey(pattern)
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
  let family = ''
  for (const [name, skeleton] of Object.entries(SKELETONS)) {
    const found: Partial<Record<Slot, { target: string; source: string }>> = {}
    for (const slot of SLOTS) {
      const targetPattern = skeleton[slot]
      const sourcePattern = SKELETONS.mixamo[slot]
      if (!targetPattern || !sourcePattern) continue
      const targetBone = findBone(targetIndex, targetPattern)
      const sourceBone = findBone(sourceIndex, sourcePattern)
      if (targetBone && sourceBone) found[slot] = { target: targetBone, source: sourceBone }
    }
    if (Object.keys(found).length > Object.keys(best).length) {
      best = found
      family = name
    }
  }

  const enough = Object.keys(best).length >= MIN_SLOTS
  return { pairs: enough ? best : {}, family: enough ? family : '' }
}

/**
 * Ossos que uma família prefere deixar **em repouso**, mesmo reconhecidos.
 *
 * Existe porque nem toda diferença de rig se resolve com conta. O Rigify
 * parte o pescoço em três juntas onde o clipe tem duas, e a que sobra não tem
 * homólogo de onde tirar orientação: tentando dirigi-las, o capacete do
 * Dartes ou tombava para trás ou abria a malha do colarinho, e nenhuma das
 * duas saídas ficou boa em tela.
 *
 * Parados, pescoço e cabeça acompanham o tronco rigidamente. Perde-se o
 * cabecear — o resto do corpo continua tocando igual, e foi a escolha feita
 * olhando a imagem.
 *
 * Um osso listado aqui continua servindo de **alvo de mira** para o osso
 * anterior: é o que mantém a coluna sendo dirigida até o peito. O que ele não
 * recebe é rotação própria.
 */
const RESTING: Record<string, readonly Slot[]> = {
  rigify: ['neck', 'head'],
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
  const { pairs: slots } = resolveSlots(target, source)
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

/**
 * Os marcos da palma que dão referencial à mão, de um lado do corpo.
 *
 * O `along` é para onde os dedos apontam e o par `across` atravessa a palma,
 * do lado do polegar para o do mindinho. Dois eixos independentes bastam para
 * fixar a orientação inteira.
 */
interface PalmMarks {
  along: Slot
  from: Slot
  to: Slot
}

/**
 * Escolhe os marcos da palma que **os dois** esqueletos têm.
 *
 * O clipe é Mixamo e traz os cinco dedos, então quem decide é o alvo. Um rig
 * com a mão inteira usa índice→mindinho, a maior travessia da palma.
 *
 * Um rig que só trouxe polegar e índice — é o caso do Biped do Gokê — usa
 * **polegar→pulso**, e não polegar→índice como seria natural escrever. O
 * motivo é condicionamento, e está medido: o eixo polegar→índice cai a 21°
 * do eixo dos dedos no clipe e a 52° no Gokê, quase paralelo nos dois e com
 * 31 graus de desacordo entre eles. Tirar uma perpendicular de dois vetores
 * quase paralelos amplia essa diferença, e a palma saía virada do avesso.
 * Polegar→pulso dá 142° e 132°: longe do paralelo, e com 10 graus de
 * desacordo.
 *
 * Os dois apontam **para o lado do mindinho**, afastando-se do polegar — é o
 * que mantém a mesma mão nas duas definições.
 *
 * A definição escolhida é aplicada **igual nos dois lados da conta**. Medir
 * de um jeito na fonte e de outro no alvo daria dois eixos que não são o
 * mesmo eixo, e a palma sairia girada.
 */
function palmMarks(side: 'left' | 'right', has: (slot: Slot) => boolean): PalmMarks | null {
  const index = `${side}Index` as Slot
  const middle = `${side}Middle` as Slot
  const little = `${side}Little` as Slot
  const thumb = `${side}Thumb` as Slot
  const wrist = `${side}Hand` as Slot

  if (!has(index)) return null
  const along = has(middle) ? middle : index
  if (has(little)) return { along, from: index, to: little }
  if (has(thumb)) return { along, from: thumb, to: wrist }
  return null
}

/**
 * O referencial da mão, tirado da anatomia dela.
 *
 * Mesma ideia do `bodyBasis`, um nível abaixo: duas direções que existem em
 * qualquer mão de qualquer rig — ao longo dos dedos, e atravessando a palma —
 * e delas sai a orientação inteira, **sem** passar pela base local do osso do
 * pulso, que cada ferramenta escolhe como quer.
 *
 * As bases dos dedos servem porque são **rígidas em relação à mão**: o osso
 * de um nó de dedo gira o dedo seguinte, não a si mesmo. Então este
 * referencial é o do osso do pulso, só expresso de um jeito que dá para
 * comparar entre esqueletos — que é exatamente o que falta na base local.
 */
function handBasis(
  wrist: THREE.Object3D,
  along: THREE.Object3D,
  from: THREE.Object3D,
  to: THREE.Object3D,
): THREE.Quaternion | null {
  const origem = new THREE.Vector3().setFromMatrixPosition(wrist.matrixWorld)
  const e1 = new THREE.Vector3().setFromMatrixPosition(along.matrixWorld).sub(origem)
  if (e1.lengthSq() < 1e-12) return null
  e1.normalize()

  const across = new THREE.Vector3()
    .setFromMatrixPosition(to.matrixWorld)
    .sub(new THREE.Vector3().setFromMatrixPosition(from.matrixWorld))
  if (across.lengthSq() < 1e-12) return null

  // A normal da palma, e depois a travessia refeita perpendicular: os dois
  // marcos não são exatamente ortogonais, e `makeBasis` precisa que sejam.
  const e3 = new THREE.Vector3().crossVectors(e1, across)
  if (e3.lengthSq() < 1e-12) return null
  e3.normalize()
  const e2 = new THREE.Vector3().crossVectors(e3, e1).normalize()

  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(e1, e2, e3))
}

/** Os dedos que o clipe move, por lado. O polegar entra junto. */
const FINGERS = ['Index', 'Middle', 'Ring', 'Little', 'Thumb'] as const

/**
 * A cadeia de ossos de um dedo, descendo da base para a ponta.
 *
 * Não precisa de tabela de nomes: um dedo é uma fila, e **em todos os rigs
 * medidos cada osso dela tem exatamente um filho**. Então basta descer. É o
 * que evita escrever cinco dedos vezes três juntas vezes dois lados vezes
 * sete convenções à mão.
 *
 * `allowed` existe para não sair da fila em rig que pendura ajudante no
 * dedo: no Rigify a mão tem `MCH-` e `ORG-` no meio dos filhos, e só os
 * `DEF-` estão no esqueleto.
 */
function fingerChain(root: THREE.Object3D, allowed: Set<string> | null, limit = 4) {
  const chain: THREE.Object3D[] = [root]
  let node: THREE.Object3D | undefined = root
  while (node && chain.length < limit) {
    node = node.children.find((child) => !allowed || allowed.has(child.name))
    if (node) chain.push(node)
  }
  return chain
}

/**
 * A ponta de uma fila: o osso que não tem elo seguinte para mirar.
 *
 * Cabeça, pé sem dedão, última junta de dedo. Aqui a mira por direção não
 * existe — **na própria fonte não há o osso seguinte**: o `Head` do clipe não
 * tem filho nenhum, e a última junta de dedo também não. Sem dois pontos não
 * se mede direção.
 *
 * Então a ponta recebe a rotação que tem **em relação a quem vem antes**,
 * corrigida pela diferença entre os dois repousos. É a saída que este arquivo
 * recusa para o braço, e com razão: lá a diferença entre repousos é a T-pose
 * contra a A-pose, 45 graus de erro embutido.
 *
 * Numa ponta a mesma conta é boa, e pelo motivo oposto: cabeça e dedo
 * repousam **alinhados com quem os carrega** em qualquer rig humanoide — a
 * cabeça olha para a frente do tronco, o dedo continua reto a partir da
 * junta anterior. A diferença entre repousos é perto de zero, e o que sobra é
 * o gesto.
 */
function tipRelative(chain: Array<{ target: THREE.Object3D; source: THREE.Object3D }>) {
  if (chain.length < 2) return null
  const tip = chain[chain.length - 1]
  return {
    tip,
    // Os dois repousos, lidos agora, antes de qualquer pose.
    naFonte: tip.source.getWorldQuaternion(new THREE.Quaternion()),
    noAlvo: tip.target.getWorldQuaternion(new THREE.Quaternion()),
  }
}

/**
 * Põe a ponta na orientação que a da fonte tem, medida a partir do repouso.
 *
 * O giro é montado **em mundo** e só então convertido para o espaço do pai. É
 * essa ordem que importa, e foi ela que consertou a cabeça: pendurar a ponta
 * na orientação **relativa ao pai** faz ela herdar a torção do pai em torno do
 * próprio eixo — e essa torção sai do `setFromUnitVectors` do `aimBone`, que
 * dá a rotação mínima, um valor sem significado anatômico.
 *
 * Medido, com a conta relativa: a cabeça do Vermelhão, que recebe o clipe osso
 * a osso, girava 23,8°; a do Teixeira 39,8°, a do Bené 46,0° e a do Dartes
 * 57,9°, esta quase toda em torno do eixo dos ombros — cabeceando para trás.
 * Montada em mundo, a torção do pai deixa de entrar e as quatro convergem.
 *
 * `transport` leva o giro do espaço da fonte para o do alvo: o do corpo para
 * cabeça e pé, o da mão para ponta de dedo.
 */
function applyTip(
  t: NonNullable<ReturnType<typeof tipRelative>>,
  transport: THREE.Quaternion,
) {
  // O quanto a ponta da fonte girou desde o repouso dela.
  const giro = t.tip.source
    .getWorldQuaternion(new THREE.Quaternion())
    .multiply(t.naFonte.clone().invert())

  // O mesmo giro, visto do lado do alvo, sobre o repouso dele.
  const world = transport
    .clone()
    .multiply(giro)
    .multiply(transport.clone().invert())
    .multiply(t.noAlvo)

  const pai = t.tip.target.parent
  t.tip.target.quaternion.copy(
    pai ? pai.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world) : world,
  )
  t.tip.target.updateWorldMatrix(false, true)
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

  const { pairs: slots, family } = resolveSlots(target, source)
  if (Object.keys(slots).length < MIN_SLOTS) return null
  const emRepouso = new Set<Slot>(RESTING[family] ?? [])

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
  const montar = (lista: readonly (readonly Slot[])[]) =>
    lista
      .map((slotsOfChain) =>
        slotsOfChain
          .map((slot) => {
            const p = pair(slot)
            return p && { ...p, slot }
          })
          .filter((p): p is NonNullable<typeof p> => !!p),
      )
      .filter((chain) => chain.length >= 2)

  const chains = montar(CHAINS)
  if (chains.length === 0) return null
  // O tronco e as pernas: entram se o esqueleto os nomear, e a falta de
  // qualquer um deles só significa que aquela parte fica em repouso.
  const bodyChains = montar(BODY_CHAINS)

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

  /** O mesmo na fonte, também em repouso: o clipe ainda não começou. */
  const sourceBasisRest = bodyBasis((slot) => pair(slot)?.source ?? null)

  /** O da fonte no quadro corrente, que é de onde sai o balanço do tronco. */
  const sourceBasisNow = () => bodyBasis((slot) => pair(slot)?.source ?? null)

  /**
   * Leva uma direção do mundo da fonte para o mundo do alvo, e é **constante**.
   *
   * Já foi relido a cada quadro, para tirar da conta o balanço de quadril do
   * clipe — o alvo ficava plantado, e sem isso as mãos iam saindo de cima da
   * guitarra, que pendura no quadril parado.
   *
   * Agora o quadril **é** dirigido (ver `swayOf` abaixo), e aí o certo é o
   * contrário: o balanço tem de atravessar o corpo inteiro, como atravessa no
   * Vermelhão e no Kairos, que recebem o clipe osso a osso. Com o quadril
   * acompanhando, a guitarra acompanha junto, e o transporte volta a ser a
   * diferença entre os dois **repousos** — uma constante.
   *
   * Sem um par simétrico não dá para medir para onde um corpo olha; acontece
   * em esqueleto de um braço só, que na prática é fixture de teste. A escolha
   * neutra é assumir que os dois olham para o mesmo lado.
   */
  const carry =
    targetBasis && sourceBasisRest
      ? targetBasis.clone().multiply(sourceBasisRest.clone().invert())
      : new THREE.Quaternion()

  /**
   * O balanço do tronco da fonte, medido a partir do repouso dela.
   *
   * É o que o quadril do alvo recebe. Note que é **relativo**: o que entra é
   * o quanto o tronco girou desde o repouso, nunca a orientação absoluta do
   * quadril do rig Mixamo. A diferença não é sutil — foi copiar orientação
   * absoluta que um dia deitou um modelo no chão.
   *
   * **E não é pouco: são cerca de 18 graus, quase constantes ao longo do
   * clipe.** Não é balanço, é *postura* — o animador pôs o guitarrista
   * inclinado, e é disso que vem boa parte da impressão de que o Vermelhão
   * está tocando enquanto um personagem plantado parece um manequim com o
   * braço se mexendo.
   *
   * O número merece cuidado porque é fácil errar: medido a partir do primeiro
   * quadro em vez da pose de repouso, o giro parece 2 graus — só a oscilação,
   * sem a inclinação que já estava lá no quadro zero. Foi esse engano que
   * manteve o quadril parado por tanto tempo.
   */
  const swayOf = () => {
    const agora = sourceBasisNow()
    if (!agora || !sourceBasisRest) return null
    return sourceBasisRest.clone().invert().multiply(agora)
  }

  /**
   * O quadril do alvo, na base dele, medido a partir do referencial do corpo.
   *
   * `K` é o que sobra da convenção da ferramenta depois de tirada a anatomia:
   * a mesma ideia do `K` do pulso.
   */
  const hipsPair = pair('hips')
  const hipsRest =
    hipsPair && targetBasis
      ? targetBasis.clone().invert().multiply(hipsPair.target.getWorldQuaternion(new THREE.Quaternion()))
      : null

  /**
   * A mão, que não tem segmento seguinte para mirar.
   *
   * Aqui não dá para usar a direção de um elo, porque o que decide o jeito da
   * mão não é para onde ela aponta — é o **giro em torno disso**: palma
   * virada para o corpo com os dedos para baixo, sobre as cordas, e para cima
   * na mão que corre a escala.
   *
   * Duas saídas foram descartadas, e por medida:
   *
   * - **relativa ao antebraço**, que era o que este arquivo fazia. Aplicar no
   *   antebraço do alvo a orientação que a mão tem no antebraço da fonte
   *   supõe que os dois antebraços tenham a mesma base local, e não têm. Pior:
   *   a torção do antebraço do alvo em torno do próprio eixo sai do
   *   `setFromUnitVectors` do `aimBone`, que dá a rotação **mínima** — um
   *   valor que não quer dizer nada anatomicamente. A palma pendurava desse
   *   número arbitrário.
   * - **somar a variação ao repouso**, que deixa em cada rig o erro constante
   *   da diferença entre os dois repousos de pulso. É a mesma armadilha do
   *   braço, e a mesma medida a descarta: o Vermelhão e o Kairos passam pela
   *   cópia direta, que **substitui** a pose, e são eles a referência.
   *
   * O que fica é o referencial anatômico da palma nos dois esqueletos, ligado
   * absoluto, do mesmo jeito que o corpo. `K` é o que sobra da base local do
   * osso do pulso depois de tirada a anatomia — constante do rig, e a única
   * parte em que a convenção da ferramenta entra.
   */
  const wristFix = chains.map((chain) => {
    if (chain.length < 3) return null
    const fore = chain[chain.length - 2]
    const hand = chain[chain.length - 1]
    const side = chain === chains[0] ? 'left' : 'right'

    const marks = palmMarks(side, (slot) => !!pair(slot))
    const marcos = marks && {
      along: pair(marks.along)!,
      from: pair(marks.from)!,
      to: pair(marks.to)!,
    }

    const noAlvo =
      marcos &&
      handBasis(hand.target, marcos.along.target, marcos.from.target, marcos.to.target)

    if (marcos && noAlvo) {
      // `K` leva do referencial da palma para a base do osso do pulso.
      const K = noAlvo
        .clone()
        .invert()
        .multiply(hand.target.getWorldQuaternion(new THREE.Quaternion()))
      return { modo: 'palma' as const, hand, marcos, K }
    }

    // Sem marcos de dedo suficientes não há anatomia de mão para medir, e
    // sobra a saída relativa ao antebraço — pior, mas melhor que a pose de
    // repouso. Nenhum rig do elenco cai aqui; é rede para o próximo.
    const naFonte = relativeTo(fore.source, hand.source)
    const doAlvo = relativeTo(fore.target, hand.target)
    return { modo: 'antebraco' as const, fore, hand, fix: naFonte.invert().multiply(doAlvo) }
  })

  /**
   * As pontas do tronco e das pernas, resolvidas em mundo.
   *
   * No tronco são **duas**, pescoço e cabeça, e não só a cabeça. O motivo é a
   * junta entre elas: pondo só a cabeça em mundo, ela vai para o lugar certo
   * mas pendura num pescoço cuja torção em torno do próprio eixo saiu da
   * rotação mínima do `aimBone` — um valor arbitrário. A diferença toda sobra
   * na junta, que abre: medido, 45,6 graus de dobra no Dartes contra os 30,9
   * da referência, e a malha do colarinho separando.
   *
   * Com os dois em mundo, a dobra passa a ser a da fonte por construção — o
   * arbitrário cancela entre um e outro. A ordem importa: o pescoço primeiro,
   * porque a cabeça é lida a partir dele.
   */
  const bodyTips = bodyChains.flatMap((chain) => {
    // Osso em repouso não recebe ponta: ele fica onde nasceu.
    const util = chain.filter((osso) => !emRepouso.has(osso.slot))
    if (util.length !== chain.length) return []
    const daPonta = tipRelative(chain)
    if (!daPonta) return []
    // Só o tronco tem junta de pescoço; perna acaba no pé ou no dedão.
    const pescoco = chain.length >= 3 && chain === bodyChains[0] ? tipRelative(chain.slice(0, -1)) : null
    return pescoco ? [pescoco, daPonta] : [daPonta]
  })

  /**
   * As cadeias de dedo, um par por dedo e por lado.
   *
   * É o que fecha a mão no braço da guitarra. O clipe traz **30 faixas de
   * dedo** — é de lá que sai o punho do Vermelhão, que recebe tudo pela cópia
   * direta. Sem dirigi-las, o modelo fica na pose de repouso da mão dele, que
   * no Douglas é a palma espalmada: pulso certo, mão de quem não está tocando.
   *
   * As filas são zipadas até a menor. O clipe traz três juntas por dedo e há
   * rig com quatro; as duas primeiras carregam quase toda a dobra, e a que
   * sobra fica em repouso, que é bem melhor que receber a junta errada.
   */
  const ossosDoAlvo = new Set(targetBones.map((b) => b.name))
  const fingers = chains.map((chain, lado) => {
    const side = lado === 0 ? 'left' : 'right'
    const hand = chain[chain.length - 1]
    const filas: Array<{ source: THREE.Object3D[]; target: THREE.Object3D[] }> = []

    for (const dedo of FINGERS) {
      const base = pair(`${side}${dedo}` as Slot)
      if (!base) continue
      const naFonte = fingerChain(base.source, null)
      const noAlvo = fingerChain(base.target, ossosDoAlvo)
      const passos = Math.min(naFonte.length, noAlvo.length)
      if (passos >= 2) filas.push({ source: naFonte.slice(0, passos), target: noAlvo.slice(0, passos) })
    }
    return filas.length ? { hand, filas } : null
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
  const registrar = (bone: THREE.Object3D) => {
    if (!driven.has(bone)) driven.set(bone, { name: bone.name, values: [] })
  }
  if (hipsPair && hipsRest) registrar(hipsPair.target)
  for (const chain of chains) for (const bone of chain) registrar(bone.target)
  // No tronco e nas pernas só o último de cada fila não recebe mira.
  for (const chain of bodyChains)
    for (let i = 0; i < chain.length - 1; i++) {
      if (!emRepouso.has(chain[i].slot)) registrar(chain[i].target)
    }
  for (const t of bodyTips) registrar(t.tip.target)
  // Só os ossos que de fato recebem mira: o último de cada fila de dedo não
  // tem para onde apontar e fica em repouso.
  for (const mao of fingers) {
    if (!mao) continue
    for (const fila of mao.filas) for (const osso of fila.target) registrar(osso)
  }
  const times: number[] = []

  for (let frame = 0; frame < frames; frame++) {
    const time = frame * step
    times.push(time)

    mixer.setTime(time)
    source.updateMatrixWorld(true)

    // O alvo volta ao repouso a cada quadro: o que se escreve nele é uma
    // pose absoluta, não um acréscimo à do quadro anterior.
    restore(targetBones, targetRest, target)

    // O quadril primeiro, porque tudo pendura nele — inclusive a guitarra.
    const sway = swayOf()
    if (hipsPair && hipsRest && targetBasis && sway) {
      const desejado = targetBasis.clone().multiply(sway).multiply(hipsRest)
      const pai = hipsPair.target.parent
      hipsPair.target.quaternion.copy(
        pai ? pai.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desejado) : desejado,
      )
      hipsPair.target.updateWorldMatrix(false, true)
    }

    // O tronco e as pernas primeiro: a clavícula pendura na coluna, e mirar o
    // braço a partir de uma coluna que ainda vai se mexer seria mirar de um
    // lugar onde ele não vai estar.
    for (const chain of bodyChains) {
      for (let i = 0; i < chain.length - 1; i++) {
        // Um osso em repouso não recebe giro, mas continua servindo de alvo
        // para o anterior — por isso o `continue` é aqui e não no laço todo.
        if (emRepouso.has(chain[i].slot)) continue
        const want = segmentDir(chain[i].source, chain[i + 1].source)
        if (want.lengthSq() < 1e-12) continue
        want.normalize().applyQuaternion(carry)
        aimBone(chain[i].target, chain[i + 1].target, want)
      }
    }
    for (const t of bodyTips) applyTip(t, carry)

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
        const { hand } = wrist
        let world: THREE.Quaternion | null = null

        if (wrist.modo === 'palma') {
          const naFonte = handBasis(
            hand.source,
            wrist.marcos.along.source,
            wrist.marcos.from.source,
            wrist.marcos.to.source,
          )
          // A palma do alvo fica onde a da fonte está, e o `K` devolve a base
          // do osso a partir dela.
          if (naFonte) world = carry.clone().multiply(naFonte).multiply(wrist.K)
        } else {
          const desired = relativeTo(wrist.fore.source, hand.source).multiply(wrist.fix)
          world = wrist.fore.target.getWorldQuaternion(new THREE.Quaternion()).multiply(desired)
        }

        if (world) {
          const parent = hand.target.parent
          hand.target.quaternion.copy(
            parent
              ? parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)
              : world,
          )
          hand.target.updateWorldMatrix(false, true)
        }
      }

      // Os dedos, agora que o pulso já está no lugar.
      //
      // O transporte aqui é **da mão**, e não do corpo: a dobra de um dedo é
      // medida em relação à palma que o carrega. Ele é lido depois do pulso
      // de propósito, e continua valendo enquanto os dedos fecham — a base de
      // um dedo não sai do lugar quando ela mesma gira, só leva a junta
      // seguinte.
      const dedos = fingers[c]
      if (dedos && wrist?.modo === 'palma') {
        const naFonte = handBasis(
          dedos.hand.source,
          wrist.marcos.along.source,
          wrist.marcos.from.source,
          wrist.marcos.to.source,
        )
        const noAlvo = handBasis(
          dedos.hand.target,
          wrist.marcos.along.target,
          wrist.marcos.from.target,
          wrist.marcos.to.target,
        )
        if (naFonte && noAlvo) {
          const daMao = noAlvo.multiply(naFonte.invert())
          for (const fila of dedos.filas) {
            for (let i = 0; i < fila.target.length - 1; i++) {
              const want = segmentDir(fila.source[i], fila.source[i + 1])
              if (want.lengthSq() < 1e-12) continue
              want.normalize().applyQuaternion(daMao)
              aimBone(fila.target[i], fila.target[i + 1], want)
            }
            const ponta = tipRelative(
              fila.target.map((target, i) => ({ target, source: fila.source[i] })),
            )
            if (ponta) applyTip(ponta, daMao)
          }
        }
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
