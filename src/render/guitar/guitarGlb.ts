/**
 * Carrega uma guitarra de um arquivo glTF/GLB.
 *
 * Devolve o mesmo `GuitarModel` que `buildGuitar()` monta em código, então
 * a cena e a prévia não sabem de onde veio o instrumento.
 *
 * O trabalho de verdade aqui não é carregar, é **normalizar**. Modelos de
 * banco público não seguem convenção nenhuma: entre os oito primeiros que
 * este projeto importou havia guitarras deitadas no eixo X, no Z e no Y,
 * com comprimentos de 2 a 1055 unidades — quinhentas vezes de diferença.
 * Pedir que o arquivo respeite a convenção do `shapes.ts` não funciona,
 * porque quem exportou não sabia dela. Então o carregador mede o que
 * recebeu e conserta.
 *
 * A convenção de destino é a do `shapes.ts`: corpo centrado na origem, +Y
 * apontando para o braço, guitarra inteira medindo perto de 2,5 unidades.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GlbAdjust, Guitar } from '../../content/guitars'
import type { GuitarModel } from './guitarModel'

/** Comprimento final, na escala do jogo: da ponta do corpo à do headstock. */
const TARGET_LENGTH = 2.5

/** Um vértice a cada N ao decidir onde está o corpo; 94 mil não são precisos. */
const SAMPLE_STRIDE = 7

const AXIS_X = new THREE.Vector3(1, 0, 0)
const AXIS_Y = new THREE.Vector3(0, 1, 0)
const AXIS_Z = new THREE.Vector3(0, 0, 1)

/**
 * Gira em torno de um eixo do **mundo**, e não do objeto.
 *
 * `rotateX` e companhia giram em torno dos eixos locais, que as etapas
 * anteriores já mexeram — então cada passo dependeria da ordem dos outros, e
 * um ajuste manual no começo desalinhava tudo que vinha depois. Cada etapa
 * abaixo decide olhando os eixos do mundo, e é neles que precisa girar.
 */
function turn(object: THREE.Object3D, axis: THREE.Vector3, radians: number) {
  object.rotateOnWorldAxis(axis, radians)
  object.updateWorldMatrix(true, true)
}

const loader = new GLTFLoader()

export async function loadGuitarGlb(
  url: string,
  guitar: Guitar,
  adjust: GlbAdjust = {},
): Promise<GuitarModel> {
  const gltf = await loader.loadAsync(url)
  const root = gltf.scene

  normalize(root, adjust)

  // Sem convenção de nomes no arquivo, o brilho do star power vai em todos
  // os materiais. Um `glow_` no nome da malha restringe aos marcados, que é
  // o que um modelo feito para este jogo deveria trazer.
  const marked: THREE.Material[] = []
  const all: THREE.Material[] = []
  let whammyPivot: THREE.Object3D | null = null

  root.traverse((node) => {
    if (/whammy[_-]?pivot/i.test(node.name)) whammyPivot = node
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    for (const material of materialsOf(mesh)) {
      all.push(material)
      if (/^glow[_-]/i.test(mesh.name)) marked.push(material)
    }
  })

  const glowing = (marked.length ? marked : all).filter(
    (m): m is THREE.MeshStandardMaterial => 'emissive' in m,
  )
  for (const material of glowing) {
    material.emissive = new THREE.Color(0xffffff)
    material.emissiveIntensity = 0
  }

  const group = new THREE.Group()
  group.add(root)

  // Pose de repouso, para a alavanca voltar exatamente ao lugar.
  const baseRoll = root.rotation.z
  const baseLift = root.position.y

  return {
    group,
    setGlow(amount: number) {
      const glow = amount * guitar.aura
      for (const material of glowing) material.emissiveIntensity = glow * 0.85
    },
    setWhammy(amount: number) {
      if (whammyPivot) {
        whammyPivot.rotation.z = -amount * 0.45
        return
      }
      // Nenhum modelo de banco público traz pivô de alavanca. Sem um
      // retorno visual o jogador não sabe se a alavanca está sendo lida, e
      // esse era o caso: a guitarra ficava imóvel por mais que ele puxasse.
      // Balançar o corpo inteiro é o gesto disponível — é pequeno, mas
      // aparece, e é o que um braço de guitarra faz quando alguém o puxa.
      root.rotation.z = baseRoll - amount * 0.07
      root.position.y = baseLift - amount * 0.015
    },
    dispose() {
      root.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.geometry.dispose()
        for (const material of materialsOf(mesh)) {
          // As texturas precisam ser descartadas à mão: dispensar o material
          // não solta os mapas, e o caminho procedural nunca teve textura
          // nenhuma, então o dispose de lá não trata disso.
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose()
          }
          material.dispose()
        }
      })
    },
  }
}

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

/**
 * Põe o modelo na convenção do jogo, em quatro passos.
 */
function normalize(root: THREE.Object3D, adjust: GlbAdjust) {
  if (adjust.preRotate) root.rotation.set(...adjust.preRotate)
  root.updateWorldMatrix(true, true)

  // 1. O eixo mais longo é o do braço — uma guitarra é comprida nessa
  //    direção e estreita nas outras duas. Vira Y.
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const longest = size.x > size.y && size.x > size.z ? 'x' : size.y >= size.z ? 'y' : 'z'
  if (longest === 'x') turn(root, AXIS_Z, Math.PI / 2)
  else if (longest === 'z') turn(root, AXIS_X, -Math.PI / 2)

  // 2. Qual ponta é o corpo. O braço é fino e o corpo é largo, então a
  //    metade com maior área transversal é o corpo — e ele tem que ficar
  //    embaixo, porque +Y é a direção do braço.
  root.updateWorldMatrix(true, true)
  if (adjust.flip ?? bodyIsOnTop(root)) turn(root, AXIS_X, Math.PI)

  // 2b. O tampo de frente. Alinhado o braço em Y, sobram dois eixos: a
  //     largura do corpo e a espessura. A espessura é sempre a menor das
  //     duas, e a convenção do `shapes.ts` é largura em X, espessura em Z.
  //     Sem isto, metade dos modelos aparece de perfil, mostrando o canto
  //     em vez do tampo.
  const spread = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
  if (spread.z > spread.x) turn(root, AXIS_Y, Math.PI / 2)

  // 2c. O braço exatamente na vertical.
  //
  //     Os passos acima alinham a **caixa** do modelo, e a caixa não é a
  //     guitarra: se o braço estiver alguns graus torto dentro do arquivo, a
  //     caixa fica reta e o instrumento não. Na loja isso aparecia como oito
  //     guitarras cada uma com uma inclinação própria, quando o ponto era
  //     todas saírem iguais.
  alignNeck(root)

  if (adjust.roll) turn(root, AXIS_Y, adjust.roll)

  // 3. Escala, por último.
  //
  //    Aqui, e não antes dos giros: a medida sai de uma caixa alinhada aos
  //    eixos, e cada rotação muda essa caixa. Escalando no meio do caminho,
  //    o mesmo alvo de 2,5 produzia comprimentos de 2,40 a 2,62 conforme os
  //    giros que ainda faltavam — e o ponto de importar é que todas saiam do
  //    mesmo tamanho.
  //
  //    `spanY` já é medido no mundo, com a escala da raiz aplicada, então o
  //    fator é a razão direta. Multiplicar também por `root.scale.x` — como
  //    este cálculo fazia — aplicava a escala duas vezes, e passou
  //    despercebido porque quase todo arquivo vem com escala 1 na raiz.
  root.updateWorldMatrix(true, true)
  const spanY = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y || 1
  root.scale.multiplyScalar((TARGET_LENGTH * (adjust.scale ?? 1)) / spanY)

  // 4. O corpo vai para a origem — não o centro da caixa. A convenção do
  //    `shapes.ts` é o corpo em (0,0), e é dele que saem as distâncias que
  //    posicionam as mãos.
  root.updateWorldMatrix(true, true)
  const final = new THREE.Box3().setFromObject(root)
  const center = final.getCenter(new THREE.Vector3())
  root.position.sub(new THREE.Vector3(center.x, final.min.y + bodyRadius(root), center.z))
}

/**
 * Descobre se o corpo ficou para cima, olhando onde está o ponto mais largo.
 *
 * A primeira versão comparava a largura **média** de cada metade, e errava
 * em três dos oito primeiros modelos importados: o braço é fino e ocupa mais
 * da metade do comprimento, então ele dilui a média do lado onde está o
 * corpo. O ponto mais largo não dilui — ele está no corpo, sempre, porque
 * nenhuma parte de uma guitarra é mais larga que o corpo.
 *
 * Amostra os vértices em vez de usar a caixa: a caixa das metades seria
 * decidida pelo vértice mais extremo de qualquer coisa, inclusive uma
 * alavanca esticada para o lado.
 */
function bodyIsOnTop(root: THREE.Object3D): boolean {
  const box = new THREE.Box3().setFromObject(root)
  const middle = (box.min.y + box.max.y) / 2
  let topWidest = 0
  let bottomWidest = 0

  const vertex = new THREE.Vector3()
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const position = mesh.geometry.getAttribute('position')
    if (!position) return
    for (let i = 0; i < position.count; i += SAMPLE_STRIDE) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
      const spread = Math.abs(vertex.x)
      if (vertex.y >= middle) topWidest = Math.max(topWidest, spread)
      else bottomWidest = Math.max(bottomWidest, spread)
    }
  })

  return topWidest > bottomWidest
}

/**
 * Endireita o braço, medindo para onde ele de fato aponta.
 *
 * Do centro de massa do terço de baixo (corpo) ao do terço de cima
 * (headstock) sai o eixo real do instrumento. Alinhar esse vetor com +Y põe
 * todo modelo na mesma vertical, independente de como foi exportado.
 *
 * Usa centro de massa, e não os vértices extremos: um extremo é um ponto só,
 * e a ponta de um headstock pontudo ou de uma alavanca mandaria o eixo para
 * o lado errado.
 */
function alignNeck(root: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(root)
  const min = box.min.y
  const span = box.max.y - min
  if (span <= 0) return

  const bottom = new THREE.Vector3()
  const top = new THREE.Vector3()
  let bottomCount = 0
  let topCount = 0
  const vertex = new THREE.Vector3()

  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const position = mesh.geometry.getAttribute('position')
    if (!position) return
    for (let i = 0; i < position.count; i += SAMPLE_STRIDE) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
      const t = (vertex.y - min) / span
      if (t < 0.33) {
        bottom.add(vertex)
        bottomCount++
      } else if (t > 0.67) {
        top.add(vertex)
        topCount++
      }
    }
  })

  if (!bottomCount || !topCount) return
  bottom.divideScalar(bottomCount)
  top.divideScalar(topCount)

  const axis = top.sub(bottom)
  if (axis.lengthSq() < 1e-8) return
  axis.normalize()

  const correction = new THREE.Quaternion().setFromUnitVectors(axis, AXIS_Y)
  // Pré-multiplicar gira em torno do mundo, como as outras etapas.
  root.quaternion.premultiply(correction)
  root.updateWorldMatrix(true, true)
}

/** Meia altura do corpo, para assentá-lo na origem. */
function bodyRadius(root: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(root)
  return (box.max.y - box.min.y) * 0.22
}
