import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { boneNameMap, retargetMapped } from './animationClips'

/**
 * Um esqueleto de brinquedo, com a forma mínima que o retargeting exige:
 * quadril → coluna → ombro → braço → antebraço → mão, dos dois lados só o
 * necessário para o teste.
 */
function buildChain(names: string[], asBone: boolean, boneLength = 1) {
  const nodes = names.map((name) => {
    const node = asBone ? new THREE.Bone() : new THREE.Object3D()
    node.name = name
    return node
  })
  for (let i = 1; i < nodes.length; i++) {
    nodes[i].position.set(0, boneLength, 0)
    nodes[i - 1].add(nodes[i])
  }
  nodes[0].updateMatrixWorld(true)
  return nodes
}

/**
 * Os nomes como chegam em runtime, não como estão no arquivo.
 *
 * Dentro do `.glb` o osso se chama `mixamorig:Hips`; o GLTFLoader **remove**
 * o dois-pontos ao sanitizar, e o que existe em memória é `mixamorigHips`.
 * Escrever o nome do arquivo aqui daria um teste verde contra um jogo
 * quebrado — foi exatamente o que aconteceu.
 */
const MIXAMO = [
  'mixamorigHips',
  'mixamorigSpine',
  'mixamorigLeftShoulder',
  'mixamorigLeftArm',
  'mixamorigLeftForeArm',
  'mixamorigLeftHand',
]

const BICEP = [
  'Bone_Pelvis_02',
  'Bone_Stomach_Lower_03',
  'Bone_Collar_L_053',
  'Bone_Bicep_L_054',
  'Bone_Forearm_L_055',
  'Bone_Palm_L_056',
]

describe('mapa de ossos', () => {
  it('liga os ossos do alvo aos do clipe pelo papel no corpo', () => {
    const alvo = buildChain(BICEP, true)[0]
    const fonte = buildChain(MIXAMO, false)[0]

    const map = boneNameMap(alvo, fonte)

    // A chave é o osso do alvo e o valor é o do clipe: é o sentido que o
    // `names` do SkeletonUtils espera.
    expect(map['Bone_Bicep_L_054']).toBe('mixamorigLeftArm')
    expect(map['Bone_Forearm_L_055']).toBe('mixamorigLeftForeArm')
    expect(map['Bone_Palm_L_056']).toBe('mixamorigLeftHand')

    // O quadril é reconhecido — é a referência de aprumo — mas **não** é
    // dirigido: quem manda no quadril é a pose de repouso do modelo. Ver
    // `DRIVEN`.
    expect(map['Bone_Pelvis_02']).toBeUndefined()
  })

  it('não inventa par quando o esqueleto é de outra família', () => {
    const alvo = buildChain(['osso_a', 'osso_b', 'osso_c'], true)[0]
    const fonte = buildChain(MIXAMO, false)[0]
    expect(Object.keys(boneNameMap(alvo, fonte))).toHaveLength(0)
  })

  /**
   * O GLTFLoader não trata todo caractere do mesmo jeito.
   *
   * Dois-pontos e ponto ele **remove** (`mixamorig:Hips` → `mixamorigHips`);
   * espaço ele **troca por sublinhado** (`Bip01 L Arm` → `Bip01_L_Arm`).
   * Tratar os dois igual faz o Biped do 3ds Max não casar com nada, e o
   * personagem fica parado sem um único aviso no console.
   */
  it('casa o esqueleto do 3ds Max, cujos nomes têm espaço', () => {
    const alvo = buildChain(
      [
        'Bip01_Pelvis_02',
        'Bip01_Spine_013',
        'Bip01_L_Arm_025',
        'Bip01_L_Arm1_026',
        'Bip01_L_Arm2_027',
        'Bip01_L_Hand_028',
      ],
      true,
    )[0]
    const fonte = buildChain(MIXAMO, false)[0]

    const map = boneNameMap(alvo, fonte)
    // São **quatro** ossos no braço do Biped, e o primeiro é a clavícula.
    // Contá-los como três desloca a cadeia em um e deixa o antebraço de
    // verdade sem animação — ver a tabela de comprimentos em `SKELETONS`.
    expect(map['Bip01_L_Arm_025']).toBe('mixamorigLeftShoulder')
    expect(map['Bip01_L_Arm1_026']).toBe('mixamorigLeftArm')
    expect(map['Bip01_L_Arm2_027']).toBe('mixamorigLeftForeArm')
    expect(map['Bip01_L_Hand_028']).toBe('mixamorigLeftHand')
  })
})

/**
 * ## Os testes do retargeting entre convenções
 *
 * O que se mede aqui é a **direção dos segmentos do braço**, e não a
 * orientação de mundo dos ossos. A diferença não é de gosto: copiar
 * orientação de mundo foi exatamente o defeito que estes testes passaram a
 * existir para impedir. Orientação de mundo é a base local do osso, que cada
 * ferramenta escolhe como quer; direção de segmento é a mesma coisa em
 * qualquer rig, e é o que decide se a mão chega na guitarra.
 *
 * As fixtures têm os **dois** braços de propósito. O referencial do corpo sai
 * do eixo entre eles, então um esqueleto de um lado só não exercita a conta
 * que interessa.
 */

interface Lado {
  shoulder: string
  arm: string
  foreArm: string
  hand: string
}

interface Convencao {
  hips: string
  left: Lado
  right: Lado
}

const MIXAMO_BODY: Convencao = {
  hips: 'mixamorigHips',
  left: {
    shoulder: 'mixamorigLeftShoulder',
    arm: 'mixamorigLeftArm',
    foreArm: 'mixamorigLeftForeArm',
    hand: 'mixamorigLeftHand',
  },
  right: {
    shoulder: 'mixamorigRightShoulder',
    arm: 'mixamorigRightArm',
    foreArm: 'mixamorigRightForeArm',
    hand: 'mixamorigRightHand',
  },
}

/**
 * Os nomes do esqueleto do Unreal, como eles vêm no arquivo do Teixeira.
 *
 * Copiados do modelo de verdade, sufixo numérico incluído: é o rig em que o
 * defeito aparecia, e um nome inventado não provaria nada sobre ele.
 */
const UNREAL_BODY: Convencao = {
  hips: 'pelvis_06',
  left: { shoulder: 'clavicle_l_055', arm: 'upperarm_l_056', foreArm: 'lowerarm_l_057', hand: 'hand_l_058' },
  right: { shoulder: 'clavicle_r_0119', arm: 'upperarm_r_0141', foreArm: 'lowerarm_r_0150', hand: 'hand_r_0157' },
}

interface Forma {
  /**
   * A direção, **no espaço do osso**, em que o osso seguinte pendura.
   *
   * É a convenção que cada ferramenta escolhe, e a única coisa que o
   * retargeting não pode assumir: o Mixamo faz o osso correr no +Y do pai, e
   * o esqueleto do Unreal no +X. Dois rigs com a mesma geometria e eixos
   * diferentes precisam receber o mesmo gesto.
   */
  axis: THREE.Vector3
  /** Quanto o braço cai abaixo da horizontal: 0 é T-pose, π/4 é A-pose. */
  droop?: number
  length?: number
}

/** Quadril e, de cada lado, clavícula → braço → antebraço → mão. */
function buildBody(convencao: Convencao, forma: Forma) {
  const length = forma.length ?? 1
  const droop = forma.droop ?? 0

  const hips = new THREE.Bone()
  hips.name = convencao.hips
  const todos: THREE.Bone[] = [hips]
  const lados: Record<'left' | 'right', THREE.Bone[]> = { left: [], right: [] }

  for (const lado of ['left', 'right'] as const) {
    const sinal = lado === 'left' ? 1 : -1
    // Para onde o braço aponta em **mundo**. Com droop = 0 fica na
    // horizontal, que é a T-pose do clipe.
    const paraOLado = new THREE.Vector3(sinal * Math.cos(droop), -Math.sin(droop), 0).normalize()
    // O giro que leva o eixo do osso até essa direção. Com ele na clavícula,
    // a cadeia inteira se deita ao longo de `paraOLado`, porque os filhos
    // penduram no próprio eixo e herdam o giro.
    const giro = new THREE.Quaternion().setFromUnitVectors(forma.axis, paraOLado)

    const nomes = [convencao[lado].shoulder, convencao[lado].arm, convencao[lado].foreArm, convencao[lado].hand]
    let pai: THREE.Bone = hips
    nomes.forEach((nome, i) => {
      const osso = new THREE.Bone()
      osso.name = nome
      if (i === 0) {
        osso.position.set(sinal * 0.2, 1.4, 0)
        osso.quaternion.copy(giro)
      } else {
        osso.position.copy(forma.axis).multiplyScalar(length)
      }
      pai.add(osso)
      pai = osso
      todos.push(osso)
      lados[lado].push(osso)
    })
  }

  hips.updateMatrixWorld(true)
  return { hips, todos, lados }
}

/**
 * O alvo, como o retargeting o exige: uma `SkinnedMesh` com esqueleto.
 *
 * A malha e os ossos são **irmãos**, não mãe e filho. Num `.glb` de verdade
 * os ossos penduram na raiz da cena e a malha só os referencia pelo
 * `skeleton`; percorrer a malha não acha osso nenhum.
 */
function asTarget(corpo: ReturnType<typeof buildBody>) {
  const scene = new THREE.Group()
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.Material())
  scene.add(mesh, corpo.hips)
  scene.updateMatrixWorld(true)
  mesh.bind(new THREE.Skeleton(corpo.todos))
  scene.updateMatrixWorld(true)
  return { scene, mesh }
}

const posDe = (n: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(n.matrixWorld)

/**
 * A direção de um segmento, medida no referencial do corpo que o carrega.
 *
 * É a única forma de comparar dois rigs: em mundo, dois corpos virados para
 * lados diferentes dariam números diferentes para o mesmo gesto.
 */
function dirNoCorpo(corpo: ReturnType<typeof buildBody>, de: THREE.Object3D, para: THREE.Object3D) {
  const esquerda = posDe(corpo.lados.left[1]).sub(posDe(corpo.lados.right[1])).setY(0).normalize()
  const cima = new THREE.Vector3(0, 1, 0)
  const frente = new THREE.Vector3().crossVectors(esquerda, cima).normalize()
  const v = posDe(para).sub(posDe(de)).normalize()
  return new THREE.Vector3(v.dot(esquerda), v.dot(cima), v.dot(frente))
}

function faixa(osso: string, q: THREE.Quaternion) {
  return new THREE.QuaternionKeyframeTrack(`${osso}.quaternion`, [0, 1], [...q.toArray(), ...q.toArray()])
}

/** Toca o clipe adaptado e devolve o corpo do alvo na pose do quadro. */
function tocar(scene: THREE.Object3D, pronto: THREE.AnimationClip, t = 0.5) {
  const mixer = new THREE.AnimationMixer(scene)
  mixer.clipAction(pronto).play()
  mixer.update(t)
  scene.updateMatrixWorld(true)
}

describe('retargeting para esqueleto de outra convenção', () => {
  /**
   * O teste que prende o defeito.
   *
   * Fonte e alvo têm a **mesma geometria** — dois braços na horizontal — e
   * bases de osso diferentes: a fonte corre no +Y do osso, o alvo no +X. É a
   * diferença entre um rig Mixamo e o esqueleto do Unreal do Teixeira.
   *
   * Copiar a orientação de mundo, que é o que o `SkeletonUtils` faz, alinha
   * o +X do alvo com o +X da fonte — dois eixos que não são homólogos — e
   * joga o braço 90 graus para fora. Aqui se exige o contrário: o braço do
   * alvo aponta para onde o da fonte aponta, cada um no seu corpo.
   */
  it('reproduz a direção do braço num rig cuja base de osso é outra', () => {
    const fonte = buildBody(MIXAMO_BODY, { axis: new THREE.Vector3(0, 1, 0), length: 20 })
    const alvo = buildBody(UNREAL_BODY, { axis: new THREE.Vector3(1, 0, 0), length: 0.4 })
    const { scene, mesh } = asTarget(alvo)

    // O clipe baixa o braço esquerdo, como um guitarrista faz.
    const baixa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 3)
    const clip = new THREE.AnimationClip('tocar', 1, [faixa(MIXAMO_BODY.left.arm, baixa)])

    const pronto = retargetMapped(clip, fonte.hips, mesh)
    expect(pronto).not.toBeNull()

    // Onde a fonte põe o antebraço, com o mesmo clipe.
    fonte.lados.left[1].quaternion.copy(baixa)
    fonte.hips.updateMatrixWorld(true)
    const esperado = dirNoCorpo(fonte, fonte.lados.left[1], fonte.lados.left[2])

    tocar(scene, pronto!)
    const obtido = dirNoCorpo(alvo, alvo.lados.left[1], alvo.lados.left[2])

    expect(obtido.distanceTo(esperado)).toBeLessThan(0.02)
  })

  /**
   * A pose de repouso do alvo não entra na conta.
   *
   * O esqueleto do clipe está em **T** e todo modelo do elenco repousa em
   * **A** — medido, de -42 a -48 graus. Um retargeting que somasse o gesto ao
   * repouso baixaria o braço 45 graus além da conta; o que se quer é
   * substituição, que é o que os rigs Mixamo já ganham de graça na cópia
   * direta.
   */
  it('não soma o gesto à pose de repouso: um alvo em A-pose chega onde a fonte em T-pose manda', () => {
    const fonte = buildBody(MIXAMO_BODY, { axis: new THREE.Vector3(0, 1, 0), length: 20 })
    // O alvo nasce com os braços caídos 45 graus, como os modelos de verdade.
    const alvo = buildBody(UNREAL_BODY, {
      axis: new THREE.Vector3(1, 0, 0),
      length: 0.4,
      droop: Math.PI / 4,
    })
    const { scene, mesh } = asTarget(alvo)

    const baixa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 3)
    const clip = new THREE.AnimationClip('tocar', 1, [faixa(MIXAMO_BODY.left.arm, baixa)])

    const pronto = retargetMapped(clip, fonte.hips, mesh)
    expect(pronto).not.toBeNull()

    fonte.lados.left[1].quaternion.copy(baixa)
    fonte.hips.updateMatrixWorld(true)
    const esperado = dirNoCorpo(fonte, fonte.lados.left[1], fonte.lados.left[2])

    tocar(scene, pronto!)
    const obtido = dirNoCorpo(alvo, alvo.lados.left[1], alvo.lados.left[2])

    expect(obtido.distanceTo(esperado)).toBeLessThan(0.02)
  })

  /**
   * O que sai daqui é um clipe, não uma pose.
   *
   * A adaptação reproduz o clipe na fonte e escreve nos ossos do alvo quadro
   * a quadro. Deixar essa pose para trás congelaria o personagem no último
   * quadro assado até o mixer começar a tocar — e as posições, que vêm na
   * escala da fonte, esticariam o esqueleto até ele sumir da tela: um rig
   * Mixamo mede dezenas e o modelo do jogo mede frações.
   */
  it('devolve os ossos do alvo à pose de repouso', () => {
    const fonte = buildBody(MIXAMO_BODY, { axis: new THREE.Vector3(0, 1, 0), length: 20 })
    const alvo = buildBody(UNREAL_BODY, { axis: new THREE.Vector3(1, 0, 0), length: 0.4 })
    const { mesh } = asTarget(alvo)

    const posicoes = alvo.todos.map((b) => b.position.clone())
    const giros = alvo.todos.map((b) => b.quaternion.clone())

    const baixa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 3)
    const clip = new THREE.AnimationClip('tocar', 1, [faixa(MIXAMO_BODY.left.arm, baixa)])

    expect(retargetMapped(clip, fonte.hips, mesh)).not.toBeNull()

    for (let i = 0; i < alvo.todos.length; i++) {
      expect(alvo.todos[i].position.distanceTo(posicoes[i])).toBeLessThan(1e-6)
      expect(Math.abs(alvo.todos[i].quaternion.dot(giros[i]))).toBeCloseTo(1, 5)
    }
  })

  /**
   * E quando os dois corpos não olham para o mesmo lado.
   *
   * É a situação de verdade, e não uma hipótese: o esqueleto do clipe fica na
   * orientação que o Mixamo exporta, e o modelo do jogo já passou pelo giro
   * do carregador. Medido, o Kairos nasce virado meia volta em relação ao
   * Vermelhão.
   *
   * O gesto tem que ser o mesmo **em relação ao próprio corpo**. Sem o
   * referencial anatômico, um braço que a fonte manda para a frente sairia
   * para o lado no alvo.
   */
  it('mantém o gesto relativo ao corpo quando os corpos olham para lados diferentes', () => {
    const fonte = buildBody(MIXAMO_BODY, { axis: new THREE.Vector3(0, 1, 0), length: 20 })
    const alvo = buildBody(UNREAL_BODY, { axis: new THREE.Vector3(1, 0, 0), length: 0.4 })

    // O alvo nasce virado um quarto de volta em relação à fonte.
    const viradaDoCorpo = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    alvo.hips.quaternion.copy(viradaDoCorpo)
    alvo.hips.updateMatrixWorld(true)

    const { scene, mesh } = asTarget(alvo)

    // Um gesto que sai do plano dos ombros: se o referencial errar, ele vira
    // para o lado em vez de para a frente, e o teste vê.
    const paraFrente = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI / 4,
    )
    const clip = new THREE.AnimationClip('tocar', 1, [faixa(MIXAMO_BODY.left.arm, paraFrente)])

    const pronto = retargetMapped(clip, fonte.hips, mesh)
    expect(pronto).not.toBeNull()

    fonte.lados.left[1].quaternion.copy(paraFrente)
    fonte.hips.updateMatrixWorld(true)
    const esperado = dirNoCorpo(fonte, fonte.lados.left[1], fonte.lados.left[2])

    tocar(scene, pronto!)
    const obtido = dirNoCorpo(alvo, alvo.lados.left[1], alvo.lados.left[2])

    expect(obtido.distanceTo(esperado)).toBeLessThan(0.02)
  })

  /**
   * O quadril **acompanha**, mas só o quanto o tronco balançou.
   *
   * Durante muito tempo ele ficava parado, e havia motivo: o método antigo
   * escrevia nele a orientação de **mundo** do quadril do rig Mixamo, o que
   * deitou um modelo no chão. Mas deixá-lo parado custava o resto — a
   * guitarra pendura no quadril, então ela ficava imóvel enquanto o Vermelhão,
   * que recebe o clipe osso a osso, balançava com ela.
   *
   * O que entra agora é o **balanço relativo ao repouso**: o quanto o tronco
   * da fonte girou desde onde começou. É por isso que o corpo do alvo, virado
   * para outro lado, continua virado para o outro lado — ele gira o mesmo
   * tanto, a partir de onde estava.
   */
  it('dá ao quadril o balanço do tronco, e não a orientação absoluta da fonte', () => {
    const fonte = buildBody(MIXAMO_BODY, { axis: new THREE.Vector3(0, 1, 0), length: 20 })
    const alvo = buildBody(UNREAL_BODY, { axis: new THREE.Vector3(1, 0, 0), length: 0.4 })

    // O alvo nasce virado um quarto de volta. É o que separa "girou o mesmo
    // tanto" de "foi parar na mesma orientação".
    const viradaDoCorpo = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    alvo.hips.quaternion.copy(viradaDoCorpo)
    alvo.hips.updateMatrixWorld(true)

    const { scene, mesh } = asTarget(alvo)

    const balanco = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 9)
    const clip = new THREE.AnimationClip('tocar', 1, [faixa(MIXAMO_BODY.hips, balanco)])

    const pronto = retargetMapped(clip, fonte.hips, mesh)
    expect(pronto).not.toBeNull()

    tocar(scene, pronto!)
    const obtido = alvo.hips.getWorldQuaternion(new THREE.Quaternion())

    // Onde estava, mais o balanço.
    const esperado = viradaDoCorpo.clone().multiply(balanco)
    expect(Math.abs(obtido.dot(esperado))).toBeCloseTo(1, 3)

    // E **não** a orientação absoluta do quadril da fonte: se fosse essa, o
    // alvo teria perdido a própria virada, que é o defeito antigo.
    expect(Math.abs(obtido.dot(balanco))).toBeLessThan(0.99)
  })
})
