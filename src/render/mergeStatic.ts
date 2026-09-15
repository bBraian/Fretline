/**
 * Fusão das partes imóveis de um modelo num desenho por material.
 *
 * Uma guitarra montada em código tem umas oitenta peças: vinte e dois
 * trastes, seis tarraxas, seis cordas, seis rastilhos, marcadores, botões.
 * Cada peça é uma chamada de desenho, e com três instrumentos em cena isso
 * passa de duzentas só de guitarra — antes de contar os quatro integrantes
 * da banda. O gargalo não é o número de triângulos, é o número de chamadas.
 *
 * Como nada disso se mexe em relação ao instrumento, as peças que dividem o
 * mesmo material podem virar uma geometria só, com as transformações já
 * aplicadas aos vértices. O modelo fica idêntico na tela e desenha em um
 * punhado de chamadas.
 *
 * O que se mexe — a alavanca, as mãos, qualquer coisa animada — fica de
 * fora, marcado por `userData.animated`.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Marca uma subárvore como animada, para a fusão não tocar nela. */
export function keepAnimated(object: THREE.Object3D) {
  object.userData.animated = true
  return object
}

function isAnimated(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object
  while (node) {
    if (node.userData.animated) return true
    node = node.parent
  }
  return false
}

export function mergeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const inverseRoot = root.matrixWorld.clone().invert()

  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const consumed: THREE.Mesh[] = []

  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return
    if (isAnimated(mesh)) return
    if (Array.isArray(mesh.material)) return

    const material = mesh.material as THREE.Material
    const local = inverseRoot.clone().multiply(mesh.matrixWorld)

    // Sem índice em todas: misturar geometria indexada com não indexada faz
    // a fusão falhar, e o custo de expandir é pago uma vez só, na montagem.
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
    geometry.applyMatrix4(local)

    // Atributos extras variam entre primitivas e impedem a fusão; só
    // posição, normal e UV interessam aqui.
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') {
        geometry.deleteAttribute(name)
      }
    }

    const list = batches.get(material)
    if (list) list.push(geometry)
    else batches.set(material, [geometry])

    consumed.push(mesh)
  })

  for (const mesh of consumed) mesh.removeFromParent()

  for (const [material, geometries] of batches) {
    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false)
    if (!merged) {
      // Geometrias incompatíveis: melhor devolver as peças separadas do que
      // perder pedaços do modelo.
      for (const geometry of geometries) root.add(new THREE.Mesh(geometry, material))
      continue
    }
    if (geometries.length > 1) for (const geometry of geometries) geometry.dispose()

    const mesh = new THREE.Mesh(merged, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    root.add(mesh)
  }
}

/**
 * Funde os filhos diretos de cada grupo, sem achatar a hierarquia.
 *
 * Serve para modelos animados por esqueleto, onde `mergeStatic` não pode ser
 * usado: os ossos precisam continuar existindo para girar. Mas *dentro* de
 * cada osso nada se mexe — a cabeça tem crânio, orelhas, olhos,
 * sobrancelhas, nariz e umas onze mechas de cabelo, e as onze mechas giram
 * junto com a cabeça, nunca entre si.
 *
 * Fundindo por material dentro de cada grupo, um personagem cai de umas
 * sessenta chamadas de desenho para uma dúzia, e a animação continua idêntica.
 */
export function mergeChildren(root: THREE.Object3D) {
  const groups: THREE.Object3D[] = []
  root.traverse((object) => groups.push(object))

  for (const group of groups) {
    const meshes = group.children.filter(
      (child): child is THREE.Mesh =>
        (child as THREE.Mesh).isMesh &&
        !(child as unknown as THREE.InstancedMesh).isInstancedMesh &&
        !Array.isArray((child as THREE.Mesh).material) &&
        child.children.length === 0,
    )
    if (meshes.length < 2) continue

    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>()
    for (const mesh of meshes) {
      mesh.updateMatrix()
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
      geometry.applyMatrix4(mesh.matrix)
      for (const name of Object.keys(geometry.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name)
      }

      const material = mesh.material as THREE.Material
      const list = batches.get(material)
      if (list) list.push(geometry)
      else batches.set(material, [geometry])
    }

    // Só vale trocar quando há de fato o que juntar.
    const merges = [...batches.values()].filter((list) => list.length > 1)
    if (merges.length === 0) {
      for (const list of batches.values()) for (const geometry of list) geometry.dispose()
      continue
    }

    for (const [material, geometries] of batches) {
      const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false)
      if (!merged) {
        for (const geometry of geometries) geometry.dispose()
        continue
      }
      if (geometries.length > 1) for (const geometry of geometries) geometry.dispose()

      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = true
      group.add(mesh)
    }

    for (const mesh of meshes) mesh.removeFromParent()
  }
}
