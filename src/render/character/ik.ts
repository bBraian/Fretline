/**
 * Cinemática inversa de dois ossos.
 *
 * Posar um braço escolhendo ângulos de ombro e cotovelo é adivinhação: o
 * resultado depende de três rotações que interagem, e qualquer ajuste numa
 * delas estraga o encaixe da mão. O problema natural é o contrário — a mão
 * precisa estar *ali*, na escala da guitarra ou sobre a ponte —, e é isso
 * que esta função resolve.
 *
 * Com dois segmentos e um alvo, a solução é um triângulo: os lados são os
 * dois ossos e a distância até o alvo, e a lei dos cossenos dá os dois
 * ângulos. O que sobra é a rotação em torno do eixo ombro-mão, que o
 * triângulo não determina — para isso serve o vetor de polo, que diz para
 * onde o cotovelo aponta.
 */

import * as THREE from 'three'

const REST = new THREE.Vector3(0, -1, 0)

const toTarget = new THREE.Vector3()
const upperDirection = new THREE.Vector3()
const side = new THREE.Vector3()
const basisY = new THREE.Vector3()
const basisZ = new THREE.Vector3()
const matrix = new THREE.Matrix4()

export interface TwoBoneChain {
  root: THREE.Object3D
  lower: THREE.Object3D
  upperLength: number
  lowerLength: number
}

/**
 * Aponta a corrente para `target`, dado em coordenadas do pai de `root`.
 * `pole` indica a direção para onde o cotovelo (ou joelho) deve abrir, no
 * mesmo espaço.
 */
export function solveTwoBone(chain: TwoBoneChain, target: THREE.Vector3, pole: THREE.Vector3) {
  const { root, lower, upperLength: l1, lowerLength: l2 } = chain

  toTarget.copy(target).sub(root.position)
  let distance = toTarget.length()
  if (distance < 1e-5) return

  // O braço não alcança tudo: encostar nos extremos trava o cotovelo em
  // 0 ou 180 graus e a articulação some. Uma folga mantém a curva visível.
  const min = Math.abs(l1 - l2) + 0.02
  const max = l1 + l2 - 0.02
  distance = Math.min(max, Math.max(min, distance))
  toTarget.normalize()

  // Lei dos cossenos: ângulo entre o osso de cima e a linha até o alvo.
  const shoulder = Math.acos(
    clamp((l1 * l1 + distance * distance - l2 * l2) / (2 * l1 * distance)),
  )
  // E o ângulo interno do cotovelo.
  const elbow = Math.acos(clamp((l1 * l1 + l2 * l2 - distance * distance) / (2 * l1 * l2)))

  // Eixo de dobra: perpendicular ao plano formado pela linha até o alvo e
  // pelo polo. É o que decide para que lado o cotovelo aponta.
  side.crossVectors(pole, toTarget)
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0)
  side.normalize()

  // O giro é negativo: `side` é `pole × toTarget`, e pela regra da mão
  // direita um giro positivo em torno dele afasta a direção do polo — ou
  // seja, joga o cotovelo para o lado errado, e o braço sobe em vez de
  // descer. O sinal negativo aproxima o osso de cima do polo, que é o que
  // "o cotovelo aponta para lá" quer dizer.
  upperDirection.copy(toTarget).applyAxisAngle(side, -shoulder)

  // Base do ombro: X no eixo de dobra, Y ao longo do osso (que aponta para
  // -Y em repouso), Z completando. Assim a dobra do cotovelo vira uma
  // rotação em X pura no filho.
  basisY.copy(upperDirection).negate()
  basisZ.crossVectors(side, basisY)
  matrix.makeBasis(side, basisY, basisZ)
  root.quaternion.setFromRotationMatrix(matrix)

  lower.rotation.set(Math.PI - elbow, 0, 0)
}

/** Direção de repouso de um osso, exposta para quem precisa compor poses. */
export const BONE_REST_DIRECTION = REST

function clamp(value: number) {
  return Math.min(1, Math.max(-1, value))
}
