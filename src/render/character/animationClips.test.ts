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
      ['Bip01_Pelvis_02', 'Bip01_Spine_013', 'Bip01_L_Arm_025', 'Bip01_L_Arm1_026', 'Bip01_L_Hand_028'],
      true,
    )[0]
    const fonte = buildChain(MIXAMO, false)[0]

    const map = boneNameMap(alvo, fonte)
    expect(map['Bip01_L_Arm_025']).toBe('mixamorigLeftArm')
    expect(map['Bip01_L_Arm1_026']).toBe('mixamorigLeftForeArm')
    expect(map['Bip01_L_Hand_028']).toBe('mixamorigLeftHand')
  })
})

describe('retargeting para esqueleto de outra convenção', () => {
  /**
   * O teste que decide se a conta está certa.
   *
   * Fonte e alvo têm a **mesma pose de repouso** e nomes diferentes. Nessa
   * condição o retargeting é bem definido: o osso do alvo precisa terminar
   * na mesma orientação de mundo que o osso correspondente da fonte. Se a
   * conta trocar a ordem de alguma multiplicação, ou aplicar a rotação no
   * espaço errado, o braço vai parar em outro lugar e isto falha.
   */
  it('põe o osso do alvo na mesma orientação de mundo que a da fonte', () => {
    // Escalas bem diferentes, de propósito: um rig Mixamo mede dezenas e o
    // modelo do jogo mede frações. É essa diferença que torna visível
    // qualquer posição da fonte que vaze para o alvo.
    const fonteNodes = buildChain(MIXAMO, false, 20)
    const alvoNodes = buildChain(BICEP, true, 0.4)
    const fonte = fonteNodes[0]
    const alvo = alvoNodes[0]

    // Uma malha com esqueleto, que é o que o retargeting exige do alvo.
    // A malha e o esqueleto são **irmãos**, não mãe e filho: num `.glb` de
    // verdade os ossos penduram na raiz da cena, e a `SkinnedMesh` só os
    // referencia pelo `skeleton`. Percorrer a malha não acha osso nenhum.
    const skeleton = new THREE.Skeleton(alvoNodes as THREE.Bone[])
    const scene = new THREE.Group()
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.Material())
    scene.add(mesh, alvo)
    mesh.bind(skeleton)
    scene.updateMatrixWorld(true)

    // O clipe levanta o braço meia volta em torno de Z.
    const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
    const clip = new THREE.AnimationClip('tocar', 1, [
      new THREE.QuaternionKeyframeTrack(
        'mixamorigLeftArm.quaternion',
        [0, 1],
        [...giro.toArray(), ...giro.toArray()],
      ),
    ])

    const restos = alvoNodes.map((b) => b.position.clone())

    const pronto = retargetMapped(clip, fonte, mesh)
    expect(pronto).not.toBeNull()

    // A adaptação escreve nos ossos do alvo enquanto assa os quadros — e o
    // que ela escreve são as posições **da fonte**, na escala da fonte. Um
    // esqueleto Mixamo mede dezenas e este mede frações, então deixar isso
    // para trás estica o personagem até ele sumir da tela. O que sai daqui
    // é um clipe, não uma pose: o alvo tem que voltar como estava.
    for (let i = 0; i < alvoNodes.length; i++) {
      expect(alvoNodes[i].position.distanceTo(restos[i])).toBeLessThan(1e-6)
    }

    // Onde a fonte põe o braço, com o mesmo clipe.
    const fonteBraço = fonteNodes[3]
    fonteBraço.quaternion.copy(giro)
    fonte.updateMatrixWorld(true)
    const esperado = fonteBraço.getWorldQuaternion(new THREE.Quaternion())

    // A pose volta ao repouso antes de tocar. Sem isto o teste passaria com
    // o clipe sem casar faixa nenhuma: o alvo teria ficado na pose que a
    // adaptação deixou para trás, que é justamente a pose certa — e o
    // acerto viria do efeito colateral, não do clipe.
    for (const osso of alvoNodes) osso.quaternion.identity()
    scene.updateMatrixWorld(true)

    // Ligado à **raiz da cena**, que é o que o jogo faz: um modelo partido
    // em dezoito malhas não tem uma `SkinnedMesh` óbvia para servir de
    // âncora. Faixas nomeadas `.bones[...]` só casam contra a malha, e
    // contra a raiz falham em silêncio.
    const mixer = new THREE.AnimationMixer(scene)
    mixer.clipAction(pronto!).play()
    mixer.update(0.5)
    scene.updateMatrixWorld(true)
    const obtido = alvoNodes[3].getWorldQuaternion(new THREE.Quaternion())

    expect(Math.abs(obtido.dot(esperado))).toBeCloseTo(1, 3)
  })

  /**
   * E quando os dois corpos não apontam para o mesmo lado.
   *
   * É a situação de verdade: o esqueleto do clipe fica em pé na orientação
   * que o Mixamo exporta, e o modelo do jogo foi girado e reescalado pelo
   * carregador para caber no palco. Sem alinhar as duas poses de repouso, o
   * retargeting põe cada osso na orientação de mundo da fonte — e o
   * personagem inteiro deita no chão, que foi o que aconteceu.
   *
   * O certo é o gesto ser o mesmo **em relação ao próprio corpo**: a
   * orientação final do braço do alvo é a da fonte, girada pela diferença
   * entre os dois repousos.
   */
  it('mantém o gesto relativo ao corpo quando os repousos apontam para lados diferentes', () => {
    const fonteNodes = buildChain(MIXAMO, false, 20)
    const alvoNodes = buildChain(BICEP, true, 0.4)
    const fonte = fonteNodes[0]
    const alvo = alvoNodes[0]

    // O alvo nasce virado um quarto de volta em relação à fonte.
    const viradaDoCorpo = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 2,
    )
    alvo.quaternion.copy(viradaDoCorpo)
    // As matrizes de mundo precisam estar atualizadas **antes** do
    // `Skeleton`: ele calcula as inversas de ligação a partir delas, e o
    // retargeting começa devolvendo o esqueleto a essa pose. Montado com
    // matrizes velhas, o corpo perde a virada logo no primeiro quadro.
    alvo.updateMatrixWorld(true)

    const skeleton = new THREE.Skeleton(alvoNodes as THREE.Bone[])
    const scene = new THREE.Group()
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.Material())
    scene.add(mesh, alvo)
    mesh.bind(skeleton)
    scene.updateMatrixWorld(true)

    const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 3)
    const clip = new THREE.AnimationClip('tocar', 1, [
      new THREE.QuaternionKeyframeTrack(
        'mixamorigLeftArm.quaternion',
        [0, 1],
        [...giro.toArray(), ...giro.toArray()],
      ),
    ])

    const pronto = retargetMapped(clip, fonte, mesh)
    expect(pronto).not.toBeNull()

    // Onde a fonte põe o braço…
    fonteNodes[3].quaternion.copy(giro)
    fonte.updateMatrixWorld(true)
    const naFonte = fonteNodes[3].getWorldQuaternion(new THREE.Quaternion())
    // …e o mesmo gesto, girado pela diferença entre os corpos.
    const esperado = viradaDoCorpo.clone().multiply(naFonte)

    for (const osso of alvoNodes) osso.quaternion.identity()
    alvo.quaternion.copy(viradaDoCorpo)
    scene.updateMatrixWorld(true)

    const mixer = new THREE.AnimationMixer(scene)
    mixer.clipAction(pronto!).play()
    mixer.update(0.5)
    scene.updateMatrixWorld(true)

    const obtido = alvoNodes[3].getWorldQuaternion(new THREE.Quaternion())
    expect(Math.abs(obtido.dot(esperado))).toBeCloseTo(1, 3)
  })

  /**
   * O quadril da fonte não pode vazar para a coluna do alvo.
   *
   * O personagem fica plantado: o quadril dele não é dirigido. Mas o clipe
   * do Mixamo gira o quadril dele, e os ossos acima recebem orientação de
   * **mundo**. Sem tirar essa rotação do caminho, ela é contada duas vezes
   * — uma no osso de cima, outra que não existe embaixo — e o personagem
   * toca a música dobrado para a frente, que foi o que apareceu na tela.
   */
  it('ignora a rotação de quadril do clipe, que o alvo não acompanha', () => {
    const fonteNodes = buildChain(MIXAMO, false, 20)
    const alvoNodes = buildChain(BICEP, true, 0.4)
    const fonte = fonteNodes[0]
    const alvo = alvoNodes[0]

    const skeleton = new THREE.Skeleton(alvoNodes as THREE.Bone[])
    const scene = new THREE.Group()
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.Material())
    scene.add(mesh, alvo)
    mesh.bind(skeleton)
    scene.updateMatrixWorld(true)

    const doBraço = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4)
    const doQuadril = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 5)

    const faixa = (osso: string, q: THREE.Quaternion) =>
      new THREE.QuaternionKeyframeTrack(`${osso}.quaternion`, [0, 1], [...q.toArray(), ...q.toArray()])

    const clip = new THREE.AnimationClip('tocar', 1, [
      faixa('mixamorigHips', doQuadril),
      faixa('mixamorigLeftArm', doBraço),
    ])

    const pronto = retargetMapped(clip, fonte, mesh)
    expect(pronto).not.toBeNull()

    // O esperado é o braço **com o quadril parado**: é assim que o alvo está.
    fonteNodes[3].quaternion.copy(doBraço)
    fonte.updateMatrixWorld(true)
    const esperado = fonteNodes[3].getWorldQuaternion(new THREE.Quaternion())

    for (const osso of alvoNodes) osso.quaternion.identity()
    scene.updateMatrixWorld(true)

    const mixer = new THREE.AnimationMixer(scene)
    mixer.clipAction(pronto!).play()
    mixer.update(0.5)
    scene.updateMatrixWorld(true)

    const obtido = alvoNodes[3].getWorldQuaternion(new THREE.Quaternion())
    expect(Math.abs(obtido.dot(esperado))).toBeCloseTo(1, 3)
  })
})
