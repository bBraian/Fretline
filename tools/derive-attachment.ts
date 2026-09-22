/**
 * Mede onde a guitarra tem que ficar no corpo de cada personagem importado.
 *
 *   npm run attachment              # todo o elenco importado e animado
 *   npm run attachment lara soldier # só quem casar com esses pedaços de id
 *
 * Imprime blocos prontos para colar em `CHARACTER_ADJUSTMENTS`, em
 * `src/render/character/bandRig.ts`. Para quem já tem entrada, imprime também
 * o quanto o medido discorda do que está na tabela — é o auto-teste da conta.
 *
 * ## Por que isto existe
 *
 * Os números do encaixe já foram achados arrastando controle no painel de
 * `?rig`, e dava para continuar assim. Deixou de ser necessário quando o
 * retargeting passou a pôr as mãos no mesmo lugar em todos os corpos (ver
 * `render/character/animationClips.ts`): a partir daí o lugar da guitarra é
 * uma **consequência** de onde as mãos caem, e consequência se calcula.
 *
 * ## A conta
 *
 * O Vermelhão é a calibração, porque é um rig Mixamo — ele passa pela cópia
 * direta de faixas, que não tem conta nenhuma para errar, e a entrada dele
 * está confirmada na tela. Dele saem as duas constantes:
 *
 * - **o braço** que vai do meio das mãos até a origem da guitarra, guardado
 *   no espaço **da guitarra**. Tem que ser nesse espaço, e não no do encaixe:
 *   a origem dela não fica nas cordas, então esse braço gira junto quando a
 *   guitarra gira. Guardá-lo no espaço do encaixe erra 30 cm num corpo virado
 *   meia volta — foi medido.
 * - **o referencial de três eixos** da pose: o braço da guitarra corre entre
 *   as duas mãos, e o para-frente do corpo resolve o giro em torno dele. Só a
 *   linha das mãos não basta — ela fixa dois graus de liberdade, e o terceiro
 *   escolhido ao acaso virava a guitarra de costas.
 *
 * Para cada personagem, então: toca-se o clipe, tira-se a média das duas mãos
 * ao longo dele, e aplica-se as duas constantes.
 *
 * ## Quanto dá para confiar
 *
 * O Kairos serve de prova: a entrada dele foi achada à mão, e a conta chega a
 * 16 graus e 11 cm dela sem nunca tê-la visto. É a margem em que dois ajustes
 * bons discordam. Um personagem novo que saia muito fora dessa faixa é sinal
 * de que o **rig** dele não foi reconhecido certo — o lugar de olhar é
 * `SKELETONS`, não este arquivo.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { readFileSync } from 'node:fs'
import { CHARACTERS } from '../src/content/characters'
import { CLIPS, retarget, retargetMapped } from '../src/render/character/animationClips'
import { ImportedCharacter } from '../src/render/character/characterGlb'
import { attachToBone, WAIST_FRACTION } from '../src/render/character/bandMember'
import { ATTACHMENTS, CHARACTER_ADJUSTMENTS } from '../src/render/character/bandRig'

/** De quem saem as constantes. Rig Mixamo, conferido na tela. */
const REFERENCIA = 'glb-dead_pool'

/**
 * Onde o clipe é amostrado.
 *
 * Espalhado ao longo da música de propósito: a mão da palhetada sobe e desce
 * e a da escala corre pelo braço, então um instante só daria um lugar que
 * vale para aquele instante.
 */
const INSTANTES = [0.6, 1.2, 1.8, 2.5, 3.1, 3.7, 4.3]

// O GLTFLoader quer DOM. Isto é o mínimo para ele não explodir em Node.
;(globalThis as Record<string, unknown>).self = globalThis
if (!globalThis.createImageBitmap) {
  ;(globalThis as Record<string, unknown>).createImageBitmap = async () => ({
    width: 1,
    height: 1,
    close() {},
  })
}

const loader = new GLTFLoader()

function carregar(caminho: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  const bytes = readFileSync(caminho)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return new Promise((ok, erro) => loader.parse(buffer as ArrayBuffer, '', ok as never, erro))
}

/**
 * Um candidato de nome por família de esqueleto.
 *
 * É a mesma lista de `SKELETONS`, reduzida aos quatro papéis que esta conta
 * precisa. Um rig de família nova precisa de uma entrada aqui **e** lá.
 */
const PAPEIS = {
  maoEsquerda: ['mixamorigLeftHand', 'l_Arm_Wrist', 'hand_l', 'DEF-hand.L', 'Bip01_L_Hand', 'Bone_Palm_L', 'ValveBiped.Bip01_L_Hand'],
  maoDireita: ['mixamorigRightHand', 'r_Arm_Wrist', 'hand_r', 'DEF-hand.R', 'Bip01_R_Hand', 'Bone_Palm_R', 'ValveBiped.Bip01_R_Hand'],
  bracoEsquerdo: ['mixamorigLeftArm', 'l_Arm_Shoulder', 'upperarm_l', 'DEF-upper_arm.L', 'Bip01_L_Arm1', 'Bone_Bicep_L', 'ValveBiped.Bip01_L_UpperArm'],
  bracoDireito: ['mixamorigRightArm', 'r_Arm_Shoulder', 'upperarm_r', 'DEF-upper_arm.R', 'Bip01_R_Arm1', 'Bone_Bicep_R', 'ValveBiped.Bip01_R_UpperArm'],
  quadril: ['mixamorigHips', 'ROOTSHJnt', 'pelvis_0', 'DEF-spine', 'Bip01_Pelvis', 'Bone_Pelvis', 'ValveBiped.Bip01_Pelvis'],
} as const

/** A mesma normalização do `slotKey` do retargeting: preserva dígitos. */
const chave = (nome: string) =>
  nome.replace(/_\d+$/, '').replace(/\s/g, '_').replace(/[:.]/g, '').toLowerCase()

function buscador(raiz: THREE.Object3D) {
  const indice = new Map<string, THREE.Object3D>()
  raiz.traverse((no) => {
    if (no.name && !indice.has(chave(no.name))) indice.set(chave(no.name), no)
  })
  return (candidatos: readonly string[]) => {
    for (const candidato of candidatos) {
      const querido = chave(candidato)
      const exato = indice.get(querido)
      if (exato) return exato
      for (const [nome, no] of indice) if (nome.startsWith(querido)) return no
    }
    return null
  }
}

const posicao = (no: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(no.matrixWorld)

interface Medida {
  meio: THREE.Vector3
  linha: THREE.Vector3
  frente: THREE.Vector3
}

async function medir(arquivo: string, clip: THREE.AnimationClip, fonte: THREE.Object3D): Promise<Medida> {
  const gltf = await carregar(`public${arquivo}`)
  const raiz = gltf.scene
  const personagem = new ImportedCharacter(raiz, {})
  const achar = buscador(raiz)

  for (const [papel, candidatos] of Object.entries(PAPEIS)) {
    if (!achar(candidatos)) throw new Error(`não achei o osso de ${papel} — família de rig nova?`)
  }

  let comPele: THREE.SkinnedMesh | null = null
  raiz.traverse((no) => {
    if (!comPele && (no as THREE.SkinnedMesh).isSkinnedMesh) comPele = no as THREE.SkinnedMesh
  })

  const direto = retarget(clip, raiz)
  const pronto = direto ?? (comPele ? retargetMapped(clip, fonte, comPele) : null)
  if (!pronto) throw new Error('o clipe não casou com este esqueleto')

  const mixer = new THREE.AnimationMixer(raiz)
  mixer.clipAction(pronto).play()

  const cena = new THREE.Scene()
  cena.add(personagem.group)
  // Um encaixe igual ao que o palco cria, para medir no mesmo referencial em
  // que os números da tabela são aplicados.
  const suporte = new THREE.Group()
  personagem.group.add(suporte)
  const encaixe = attachToBone(raiz, suporte, ATTACHMENTS.guitar.bone, WAIST_FRACTION)

  const meio = new THREE.Vector3()
  const linha = new THREE.Vector3()
  const frente = new THREE.Vector3()

  for (const instante of INSTANTES) {
    mixer.setTime(instante)
    cena.updateMatrixWorld(true)
    encaixe?.update()
    cena.updateMatrixWorld(true)

    const ancora = encaixe ? encaixe.group : personagem.instrumentAnchor
    ancora.updateWorldMatrix(true, false)
    const inversa = ancora.matrixWorld.clone().invert()

    const esquerda = posicao(achar(PAPEIS.maoEsquerda)!).applyMatrix4(inversa)
    const direita = posicao(achar(PAPEIS.maoDireita)!).applyMatrix4(inversa)
    meio.add(esquerda).add(direita)
    linha.add(esquerda.clone().sub(direita).normalize())

    // O para-frente do corpo, pela anatomia: eixo dos ombros e para-cima do
    // tronco. Nenhum dos dois depende de como a ferramenta orienta osso.
    const ombroE = posicao(achar(PAPEIS.bracoEsquerdo)!)
    const ombroD = posicao(achar(PAPEIS.bracoDireito)!)
    const lado = ombroE.clone().sub(ombroD).normalize()
    const cima = ombroE.clone().add(ombroD).multiplyScalar(0.5).sub(posicao(achar(PAPEIS.quadril)!))
    const paraFrente = new THREE.Vector3().crossVectors(lado, cima).normalize()
    // Só o giro do encaixe: é direção, não ponto.
    const giro = new THREE.Matrix4().extractRotation(ancora.matrixWorld).invert()
    frente.add(paraFrente.applyMatrix4(giro).normalize())
  }

  meio.divideScalar(INSTANTES.length * 2)
  return { meio, linha: linha.normalize(), frente: frente.normalize() }
}

/** O referencial de três eixos da pose, a partir de uma medida. */
function referencial({ linha, frente }: Medida) {
  const e1 = linha.clone().normalize()
  const e2 = frente.clone().sub(e1.clone().multiplyScalar(frente.dot(e1))).normalize()
  const e3 = new THREE.Vector3().crossVectors(e1, e2).normalize()
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(e1, e2, e3))
}

const filtros = process.argv.slice(2)

const elenco = CHARACTERS.filter(
  (c) =>
    c.model &&
    c.animated !== false &&
    (filtros.length === 0 || filtros.some((f) => c.id.includes(f) || c.name.toLowerCase().includes(f.toLowerCase()))),
)

// O `loadClip` do jogo busca por URL de navegador; aqui o arquivo vem do
// disco, do mesmo caminho que o `public/` serve.
const carregado = await carregar(`public${CLIPS.guitar}`)

// A referência entra sempre, mesmo filtrada: é dela que saem as constantes.
const clip = (carregado as unknown as { animations: THREE.AnimationClip[] }).animations.find(
  (a) => a.tracks.length > 0,
)
if (!clip) {
  console.error(`${CLIPS.guitar} não tem faixa de animação`)
  process.exit(1)
}

const precisa = new Set([REFERENCIA, ...elenco.map((c) => c.id)])
const medidas = new Map<string, Medida>()
for (const personagem of CHARACTERS) {
  if (!precisa.has(personagem.id) || !personagem.model) continue
  try {
    medidas.set(personagem.id, await medir(personagem.model, clip, carregado.scene))
  } catch (erro) {
    console.error(`${personagem.name}: ${(erro as Error).message}`)
  }
}

const base = medidas.get(REFERENCIA)
const ajusteBase = CHARACTER_ADJUSTMENTS[REFERENCIA]
if (!base || !ajusteBase?.position || !ajusteBase?.rotation) {
  console.error(`sem a referência ${REFERENCIA}, não há de onde tirar as constantes`)
  process.exit(1)
}

const posicaoBase = new THREE.Vector3(...ajusteBase.position)
const giroBase = new THREE.Quaternion().setFromEuler(new THREE.Euler(...ajusteBase.rotation, 'XYZ'))
// O braço do meio das mãos até a origem da guitarra, no espaço dela.
const bracoLocal = posicaoBase.clone().sub(base.meio).applyQuaternion(giroBase.clone().invert())
const referencialBase = referencial(base)

const arredonda = (n: number) => Number(n.toFixed(3))

console.log(`\nreferência: ${REFERENCIA}\ncole em CHARACTER_ADJUSTMENTS, em src/render/character/bandRig.ts:\n`)

for (const personagem of elenco) {
  const medida = medidas.get(personagem.id)
  if (!medida) continue

  const giro = referencial(medida).multiply(referencialBase.clone().invert()).multiply(giroBase)
  const pos = medida.meio.clone().add(bracoLocal.clone().applyQuaternion(giro))
  const euler = new THREE.Euler().setFromQuaternion(giro, 'XYZ')

  const escala = CHARACTER_ADJUSTMENTS[personagem.id]?.scale ?? ATTACHMENTS.guitar.scale
  console.log(`  // ${personagem.name}`)
  console.log(
    `  '${personagem.id}': {\n` +
      `    position: [${arredonda(pos.x)}, ${arredonda(pos.y)}, ${arredonda(pos.z)}],\n` +
      `    rotation: [${arredonda(euler.x)}, ${arredonda(euler.y)}, ${arredonda(euler.z)}],\n` +
      `    scale: ${escala},\n` +
      `  },`,
  )

  const naTabela = CHARACTER_ADJUSTMENTS[personagem.id]
  if (naTabela?.position && naTabela?.rotation) {
    const giroTabela = new THREE.Quaternion().setFromEuler(new THREE.Euler(...naTabela.rotation, 'XYZ'))
    const distancia = pos.distanceTo(new THREE.Vector3(...naTabela.position))
    const angulo = (2 * Math.acos(Math.min(1, Math.abs(giro.dot(giroTabela))))* 180) / Math.PI
    const folgado = distancia > 0.15 || angulo > 20
    console.log(
      `  //   contra a tabela: ${distancia.toFixed(3)} m e ${angulo.toFixed(1)}°` +
        (folgado ? '  <-- fora da faixa de 0,15 m / 20°: confira o rig antes de colar' : ''),
    )
  }
}

console.log('')
