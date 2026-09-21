/**
 * Adereços de palco importados: bateria e microfone.
 *
 * Diferente de guitarras e integrantes, estes não são escolhidos pelo
 * jogador — são cenário. Por isso não têm entrada em `content/`: o palco
 * sabe quais são e os carrega direto.
 *
 * A normalização é mais simples que a de uma guitarra, porque um adereço não
 * precisa de eixo de braço nem de face de frente: basta caber no tamanho
 * certo e assentar onde deve. O que ele compartilha é o motivo de existir —
 * arquivo de banco público não respeita escala nenhuma, e medir o que
 * chegou é mais barato que pedir que venha certo.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const loader = new GLTFLoader()

export interface PropOptions {
  url: string
  /** Maior dimensão final, em unidades de mundo. */
  size: number
  /**
   * Onde fica a origem depois de normalizar.
   *
   * `bottom` assenta a base em y=0, para o que fica no chão; `center`
   * centraliza, para o que é preso na mão de alguém.
   */
  anchor?: 'bottom' | 'center'
  /** Giro depois da normalização, em radianos por eixo. */
  rotate?: [number, number, number]
}

export interface PropModel {
  group: THREE.Group
  dispose(): void
}

export async function loadProp({
  url,
  size,
  anchor = 'bottom',
  rotate,
}: PropOptions): Promise<PropModel> {
  const gltf = await loader.loadAsync(url)
  const root = gltf.scene

  if (rotate) root.rotation.set(...rotate)
  root.updateWorldMatrix(true, true)

  // Escala uniforme pela maior dimensão: esticar um eixo só deformaria o
  // objeto, e o ponto é caber no palco mantendo a forma.
  const measured = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
  const longest = Math.max(measured.x, measured.y, measured.z) || 1
  root.scale.multiplyScalar(size / longest)
  root.updateWorldMatrix(true, true)

  const box = new THREE.Box3().setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= anchor === 'bottom' ? box.min.y : center.y

  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
  })

  const group = new THREE.Group()
  group.add(root)

  return {
    group,
    dispose() {
      root.traverse((node) => {
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
    },
  }
}

/**
 * Os arquivos do palco.
 *
 * Ficam aqui, e não em `content/`, porque nenhum deles é escolha do
 * jogador — trocar um é trocar o cenário, não um item.
 */
export const STAGE_PROPS = {
  /**
   * Entre os dois kits baixados, este tem 62 mil vértices contra 355 mil do
   * outro, e a diferença é só geometria — as texturas dos dois somam quase
   * nada. Para uma bateria que fica no fundo do palco, o kit pesado seria
   * mais polígonos que o jogo inteiro desenha por quadro.
   */
  drums: '/models/props/drum_set_with_blender_armature.glb',
  mic: '/models/props/microphone.glb',
  /** Baixo elétrico comum; o outro arquivo é um baixo de percussão. */
  bass: '/models/props/bass_guitar.glb',
} as const
