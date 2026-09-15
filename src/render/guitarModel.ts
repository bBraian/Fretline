/**
 * Guitarra montada em código.
 *
 * O corpo é uma silhueta 2D extrudada e chanfrada; o resto são primitivas.
 * Trocar de guitarra é reconstruir este grupo com outros parâmetros, o que
 * mantém a loja funcionando sem nenhum arquivo de modelo.
 */

import * as THREE from 'three'
import type { BodyShape, Guitar } from '../content/guitars'

function bodyShape(shape: BodyShape): THREE.Shape {
  const s = new THREE.Shape()

  switch (shape) {
    case 'single-cut':
      s.moveTo(0, 0.62)
      s.bezierCurveTo(0.34, 0.6, 0.46, 0.34, 0.44, 0.05)
      s.bezierCurveTo(0.42, -0.3, 0.26, -0.58, 0, -0.6)
      s.bezierCurveTo(-0.26, -0.58, -0.44, -0.3, -0.44, 0.02)
      s.bezierCurveTo(-0.44, 0.26, -0.36, 0.4, -0.22, 0.44)
      s.bezierCurveTo(-0.3, 0.56, -0.18, 0.64, 0, 0.62)
      break

    case 'double-cut':
      s.moveTo(0.08, 0.66)
      s.bezierCurveTo(0.3, 0.68, 0.48, 0.42, 0.46, 0.08)
      s.bezierCurveTo(0.44, -0.3, 0.24, -0.6, 0, -0.6)
      s.bezierCurveTo(-0.26, -0.6, -0.46, -0.28, -0.46, 0.06)
      s.bezierCurveTo(-0.46, 0.4, -0.3, 0.7, -0.1, 0.62)
      s.bezierCurveTo(-0.04, 0.5, 0.02, 0.5, 0.08, 0.66)
      break

    case 'offset':
      s.moveTo(0.14, 0.64)
      s.bezierCurveTo(0.38, 0.6, 0.5, 0.3, 0.44, -0.02)
      s.bezierCurveTo(0.38, -0.36, 0.2, -0.62, -0.04, -0.58)
      s.bezierCurveTo(-0.3, -0.54, -0.5, -0.26, -0.44, 0.1)
      s.bezierCurveTo(-0.38, 0.46, -0.18, 0.7, 0.14, 0.64)
      break

    case 'v':
      s.moveTo(0, 0.24)
      s.lineTo(0.46, 0.72)
      s.lineTo(0.62, 0.54)
      s.lineTo(0.16, -0.02)
      s.lineTo(0.62, -0.58)
      s.lineTo(0.42, -0.74)
      s.lineTo(0, -0.24)
      s.lineTo(-0.42, -0.74)
      s.lineTo(-0.62, -0.58)
      s.lineTo(-0.16, -0.02)
      s.lineTo(-0.62, 0.54)
      s.lineTo(-0.46, 0.72)
      s.lineTo(0, 0.24)
      break

    case 'explorer':
      s.moveTo(0.1, 0.7)
      s.lineTo(0.5, 0.3)
      s.lineTo(0.44, -0.1)
      s.lineTo(0.2, -0.66)
      s.lineTo(-0.06, -0.5)
      s.lineTo(-0.2, -0.66)
      s.lineTo(-0.52, -0.34)
      s.lineTo(-0.4, 0.16)
      s.lineTo(-0.12, 0.62)
      s.lineTo(0.1, 0.7)
      break
  }

  s.closePath()
  return s
}

export interface GuitarModel {
  group: THREE.Group
  /** Emissivos que acendem no star power. */
  setGlow(amount: number): void
  dispose(): void
}

export function buildGuitar(guitar: Guitar): GuitarModel {
  const group = new THREE.Group()
  const disposables: Array<{ dispose(): void }> = []
  const glowing: THREE.MeshStandardMaterial[] = []

  const track = <T extends { dispose(): void }>(item: T) => {
    disposables.push(item)
    return item
  }

  const bodyGeometry = track(
    new THREE.ExtrudeGeometry(bodyShape(guitar.shape), {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 3,
      curveSegments: 24,
    }),
  )
  bodyGeometry.center()

  const bodyMaterial = track(
    new THREE.MeshStandardMaterial({
      color: guitar.colors.body,
      roughness: 1 - guitar.gloss * 0.85,
      metalness: 0.15 + guitar.gloss * 0.2,
      emissive: guitar.colors.body,
      emissiveIntensity: 0,
    }),
  )
  glowing.push(bodyMaterial)

  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  group.add(body)

  // Braço e escala.
  const neckMaterial = track(
    new THREE.MeshStandardMaterial({ color: guitar.colors.neck, roughness: 0.55 }),
  )
  const neck = new THREE.Mesh(track(new THREE.BoxGeometry(0.15, 1.35, 0.07)), neckMaterial)
  neck.position.set(0, 0.95, 0.01)
  group.add(neck)

  const fingerboard = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.155, 1.2, 0.02)),
    track(new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.7 })),
  )
  fingerboard.position.set(0, 0.95, 0.05)
  group.add(fingerboard)

  // Trastes metálicos.
  const fretMaterial = track(
    new THREE.MeshStandardMaterial({
      color: guitar.colors.hardware,
      roughness: 0.25,
      metalness: 0.9,
    }),
  )
  const fretGeometry = track(new THREE.BoxGeometry(0.155, 0.012, 0.008))
  for (let i = 0; i < 18; i++) {
    const fret = new THREE.Mesh(fretGeometry, fretMaterial)
    // Espaçamento aproximadamente logarítmico, como numa escala real.
    const t = 1 - Math.pow(0.944, i)
    fret.position.set(0, 0.4 + t * 1.15, 0.061)
    group.add(fret)
  }

  // Headstock.
  const headstock = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, 0.3, 0.05)), neckMaterial)
  headstock.position.set(0, 1.72, 0.0)
  headstock.rotation.x = 0.18
  group.add(headstock)

  const tunerGeometry = track(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 8))
  for (let i = 0; i < 6; i++) {
    const tuner = new THREE.Mesh(tunerGeometry, fretMaterial)
    tuner.rotation.z = Math.PI / 2
    tuner.position.set(i < 3 ? -0.13 : 0.13, 1.64 + (i % 3) * 0.08, 0.02)
    group.add(tuner)
  }

  // Escudo e captadores.
  const pickguard = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.42, 0.3, 0.012)),
    track(new THREE.MeshStandardMaterial({ color: guitar.colors.pickguard, roughness: 0.4 })),
  )
  pickguard.position.set(0, -0.02, 0.058)
  group.add(pickguard)

  const pickupGeometry = track(new THREE.BoxGeometry(0.3, 0.07, 0.03))
  for (const y of [0.13, -0.08]) {
    const pickup = new THREE.Mesh(pickupGeometry, fretMaterial)
    pickup.position.set(0, y, 0.07)
    group.add(pickup)
  }

  const bridge = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.06, 0.05)), fretMaterial)
  bridge.position.set(0, -0.26, 0.07)
  group.add(bridge)

  // Cordas: uma linha fina da ponte ao headstock.
  const stringMaterial = track(
    new THREE.MeshStandardMaterial({ color: 0xd8d8e0, roughness: 0.3, metalness: 0.8 }),
  )
  const stringGeometry = track(new THREE.CylinderGeometry(0.0035, 0.0035, 1.95, 4))
  for (let i = 0; i < 6; i++) {
    const string = new THREE.Mesh(stringGeometry, stringMaterial)
    string.position.set(-0.058 + i * 0.0232, 0.72, 0.072)
    group.add(string)
  }

  return {
    group,
    setGlow(amount: number) {
      const glow = amount * guitar.aura
      for (const material of glowing) material.emissiveIntensity = glow * 0.9
    },
    dispose() {
      for (const item of disposables) item.dispose()
    },
  }
}
