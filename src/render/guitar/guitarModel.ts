/**
 * Montagem da guitarra a partir da silhueta e dos parâmetros da família.
 *
 * Tudo é construído em código: corpo extrudado e chanfrado, braço com
 * escala de raio composto, trastes espaçados pela regra real, headstock com
 * as tarraxas certas para o formato, captadores com as bobinas à mostra,
 * potenciômetros, ponte, cordas e strap buttons.
 *
 * Continua sem arquivo de modelo por um motivo prático: os integrantes da
 * banda são animados por um esqueleto escrito à mão, e um modelo importado
 * de um gerador não viria com esqueleto nenhum. Como a guitarra fica presa
 * na mão de um deles, os dois precisam sair da mesma fábrica.
 */

import * as THREE from 'three'
import type { Guitar } from '../../content/guitars'
import { BODY_SPECS, headstockShape, tunerPositions, type PickupKind } from './shapes'

/** Quantas casas a escala tem. */
const FRET_COUNT = 22

/** Cordas, da mais grave à mais aguda. */
const STRING_COUNT = 6

export interface GuitarModel {
  group: THREE.Group
  /** Acende os emissivos no star power, de 0 a 1. */
  setGlow(amount: number): void
  /** Desloca a alavanca, de 0 a 1. */
  setWhammy(amount: number): void
  dispose(): void
}

class Builder {
  readonly group = new THREE.Group()
  private disposables: Array<{ dispose(): void }> = []

  track<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item)
    return item
  }

  add(mesh: THREE.Object3D) {
    this.group.add(mesh)
    return mesh
  }

  dispose() {
    for (const item of this.disposables) item.dispose()
  }
}

/**
 * Espaçamento real dos trastes: cada casa fica a 1/17,817 do que sobra da
 * corda. É por isso que as casas vão apertando em direção ao corpo, e é o
 * detalhe que faz uma escala desenhada parecer certa mesmo de longe.
 */
function fretOffsets(scaleLength: number): number[] {
  const offsets: number[] = []
  let remaining = scaleLength
  let position = 0
  for (let i = 0; i < FRET_COUNT; i++) {
    const step = remaining / 17.817
    position += step
    remaining -= step
    offsets.push(position)
  }
  return offsets
}

function pickupSize(kind: PickupKind) {
  if (kind === 'humbucker') return { width: 0.175, height: 0.08, coils: 2 }
  if (kind === 'p90') return { width: 0.17, height: 0.065, coils: 1 }
  return { width: 0.12, height: 0.045, coils: 1 }
}

export function buildGuitar(guitar: Guitar): GuitarModel {
  const spec = BODY_SPECS[guitar.shape]
  const b = new Builder()
  const glowing: THREE.MeshStandardMaterial[] = []

  const colors = guitar.colors
  const metalness = 0.15 + guitar.gloss * 0.25
  const roughness = Math.max(0.05, 1 - guitar.gloss * 0.92)

  // --- materiais ---------------------------------------------------------

  const bodyMaterial = b.track(
    new THREE.MeshStandardMaterial({
      color: colors.body,
      roughness,
      metalness,
      emissive: colors.body,
      emissiveIntensity: 0,
    }),
  )
  glowing.push(bodyMaterial)

  const neckMaterial = b.track(
    new THREE.MeshStandardMaterial({ color: colors.neck, roughness: 0.55, metalness: 0.05 }),
  )
  const boardMaterial = b.track(
    new THREE.MeshStandardMaterial({ color: colors.fretboard, roughness: 0.62, metalness: 0.05 }),
  )
  const hardware = b.track(
    new THREE.MeshStandardMaterial({ color: colors.hardware, roughness: 0.18, metalness: 0.95 }),
  )
  const darkPlastic = b.track(
    new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.45, metalness: 0.05 }),
  )
  const guardMaterial = b.track(
    new THREE.MeshStandardMaterial({
      color: colors.pickguard,
      roughness: 0.3,
      metalness: 0.1,
      side: THREE.DoubleSide,
    }),
  )
  const bindingMaterial = b.track(
    new THREE.MeshStandardMaterial({ color: 0xf0e6cc, roughness: 0.4 }),
  )
  const stringMaterial = b.track(
    new THREE.MeshStandardMaterial({
      color: 0xf2f5fa,
      roughness: 0.2,
      metalness: 0.9,
      emissive: 0x6b7386,
      emissiveIntensity: 0.35,
    }),
  )
  const inlayMaterial = b.track(
    new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.3, metalness: 0.1 }),
  )

  // --- corpo -------------------------------------------------------------

  const bodyGeometry = b.track(
    new THREE.ExtrudeGeometry(spec.shape, {
      depth: spec.depth,
      bevelEnabled: true,
      // Um chanfro generoso arredonda a borda e evita a aresta viva de
      // extrusão, que denuncia geometria feita por computador.
      bevelThickness: spec.carvedTop ? 0.05 : 0.03,
      bevelSize: 0.028,
      bevelOffset: 0,
      bevelSegments: 4,
      curveSegments: 48,
    }),
  )
  bodyGeometry.center()

  const body = b.add(new THREE.Mesh(bodyGeometry, bodyMaterial))
  body.castShadow = true
  body.receiveShadow = true

  // A altura real do tampo sai da geometria, não de uma conta à parte: o
  // chanfro e o tampo abaulado mudam onde a superfície termina, e hardware
  // colocado por estimativa acaba enterrado dentro da madeira.
  bodyGeometry.computeBoundingBox()
  let surfaceZ = bodyGeometry.boundingBox!.max.z

  if (spec.carvedTop) {
    // Tampo abaulado: uma casca rasa por cima do corpo, que pega a luz numa
    // faixa curva em vez de num plano chapado.
    const cap = b.track(
      new THREE.ExtrudeGeometry(spec.shape, {
        depth: 0.012,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: -0.03,
        bevelSegments: 5,
        curveSegments: 48,
      }),
    )
    cap.center()
    cap.computeBoundingBox()
    const carved = b.add(new THREE.Mesh(cap, bodyMaterial))
    carved.position.z = surfaceZ - 0.012
    carved.castShadow = true
    surfaceZ = carved.position.z + cap.boundingBox!.max.z
  }

  if (spec.binding) {
    const edge = b.track(
      new THREE.ExtrudeGeometry(spec.shape, {
        depth: 0.01,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.016,
        bevelSegments: 2,
        curveSegments: 48,
      }),
    )
    edge.center()
    const binding = b.add(new THREE.Mesh(edge, bindingMaterial))
    binding.position.z = spec.depth / 2 + 0.004
    binding.scale.set(1.004, 1.004, 1)
  }

  if (spec.pickguard) {
    const guardShape = spec.shape.clone()
    const guard = b.track(new THREE.ShapeGeometry(guardShape, 32))
    guard.center()
    const plate = b.add(new THREE.Mesh(guard, guardMaterial))
    // O escudo é uma versão encolhida e deslocada do próprio corpo, o que o
    // faz acompanhar o contorno sem precisar de um segundo desenho.
    plate.scale.set(0.82, 0.74, 1)
    plate.position.set(-0.02, -0.06, surfaceZ + 0.004)
  }

  // --- braço e escala ----------------------------------------------------

  const neckLength = spec.neckLength
  const neckBase = spec.neckJoint

  // Perfil em C: meia cápsula com a parte reta virada para o tampo.
  const neckGeometry = b.track(new THREE.CapsuleGeometry(0.052, neckLength - 0.1, 6, 16))
  const neck = b.add(new THREE.Mesh(neckGeometry, neckMaterial))
  neck.position.set(0, neckBase + neckLength / 2, spec.depth * 0.1)
  neck.scale.set(1.5, 1, 0.85)
  neck.castShadow = true

  // Calcanhar: o bloco onde o braço encaixa no corpo. Sem ele o braço
  // parece espetado, que é o detalhe que mais denuncia uma junção falsa.
  const heel = b.add(
    new THREE.Mesh(b.track(new THREE.BoxGeometry(0.19, 0.24, spec.depth * 0.62)), neckMaterial),
  )
  heel.position.set(0, neckBase - 0.02, spec.depth * 0.22)
  heel.castShadow = true

  // Escala: levemente cônica, mais estreita perto do headstock.
  const boardGeometry = b.track(new THREE.BoxGeometry(1, 1, 1))
  const board = b.add(new THREE.Mesh(boardGeometry, boardMaterial))
  board.scale.set(0.148, neckLength, 0.022)
  board.position.set(0, neckBase + neckLength / 2, spec.depth * 0.1 + 0.043)
  board.castShadow = true

  const scaleLength = neckLength * 1.42
  const offsets = fretOffsets(scaleLength)
  const fretGeometry = b.track(new THREE.CylinderGeometry(0.0045, 0.0045, 0.152, 6))

  for (const offset of offsets) {
    if (offset > neckLength - 0.02) break
    const fret = b.add(new THREE.Mesh(fretGeometry, hardware))
    fret.rotation.z = Math.PI / 2
    fret.position.set(0, neckBase + offset, spec.depth * 0.1 + 0.055)
  }

  // Marcadores nas casas de sempre: 3, 5, 7, 9, 12 (duplo), 15, 17, 19, 21.
  const dotGeometry = b.track(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 12))
  const doubleDots = [12]
  for (const fret of [3, 5, 7, 9, 12, 15, 17, 19, 21]) {
    if (fret >= offsets.length) continue
    const previous = fret === 1 ? 0 : offsets[fret - 2]
    const middle = (previous + offsets[fret - 1]) / 2
    if (middle > neckLength - 0.03) continue

    const xs = doubleDots.includes(fret) ? [-0.038, 0.038] : [0]
    for (const x of xs) {
      const dot = b.add(new THREE.Mesh(dotGeometry, inlayMaterial))
      dot.rotation.x = Math.PI / 2
      dot.position.set(x, neckBase + middle, spec.depth * 0.1 + 0.0552)
    }
  }

  // --- headstock ---------------------------------------------------------

  const headGroup = new THREE.Group()
  headGroup.position.set(0, neckBase + neckLength, spec.depth * 0.1 + 0.02)
  // As guitarras de aba inclinam a pá para trás; as de ponta, menos.
  headGroup.rotation.x = spec.headstock === 'open-book' ? 0.24 : 0.1
  b.add(headGroup)

  const headGeometry = b.track(
    new THREE.ExtrudeGeometry(headstockShape(spec.headstock), {
      depth: 0.026,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.006,
      bevelSegments: 2,
      curveSegments: 20,
    }),
  )
  const head = new THREE.Mesh(headGeometry, neckMaterial)
  head.position.z = -0.013
  head.castShadow = true
  headGroup.add(head)

  const faceplate = new THREE.Mesh(
    b.track(
      new THREE.ExtrudeGeometry(headstockShape(spec.headstock), {
        depth: 0.004,
        bevelEnabled: false,
        curveSegments: 20,
      }),
    ),
    darkPlastic,
  )
  faceplate.position.z = 0.013
  faceplate.scale.setScalar(0.94)
  headGroup.add(faceplate)

  const postGeometry = b.track(new THREE.CylinderGeometry(0.009, 0.011, 0.034, 10))
  const buttonGeometry = b.track(new THREE.BoxGeometry(0.03, 0.012, 0.011))
  for (const [x, y] of tunerPositions(spec.headstock)) {
    const post = new THREE.Mesh(postGeometry, hardware)
    post.position.set(x, y, 0.03)
    post.rotation.x = Math.PI / 2
    headGroup.add(post)

    const button = new THREE.Mesh(buttonGeometry, hardware)
    button.position.set(x + Math.sign(x || 1) * 0.028, y, 0.03)
    headGroup.add(button)
  }

  const nut = b.add(new THREE.Mesh(b.track(new THREE.BoxGeometry(0.15, 0.014, 0.026)), inlayMaterial))
  nut.position.set(0, neckBase + neckLength - 0.005, spec.depth * 0.1 + 0.05)

  // --- captadores, controles e ponte -------------------------------------

  const topZ = surfaceZ + 0.006

  for (const pickup of spec.pickups) {
    const { width, height, coils } = pickupSize(pickup.kind)
    const mount = b.add(
      new THREE.Mesh(b.track(new THREE.BoxGeometry(width + 0.02, height + 0.02, 0.018)), darkPlastic),
    )
    mount.position.set(0, pickup.y, topZ + 0.008)
    if (pickup.angled) mount.rotation.z = -0.22

    for (let coil = 0; coil < coils; coil++) {
      const coilMesh = b.add(
        new THREE.Mesh(
          b.track(new THREE.BoxGeometry(width, height / coils - 0.008, 0.014)),
          pickup.kind === 'humbucker' ? hardware : darkPlastic,
        ),
      )
      const spread = coils === 1 ? 0 : (coil - 0.5) * (height / 2)
      coilMesh.position.set(0, pickup.y + spread, topZ + 0.016)
      if (pickup.angled) coilMesh.rotation.z = -0.22

      // Polepieces: os seis pinos que ficam sob as cordas.
      if (pickup.kind !== 'humbucker') {
        const pole = b.track(new THREE.CylinderGeometry(0.005, 0.005, 0.008, 8))
        for (let i = 0; i < STRING_COUNT; i++) {
          const pin = b.add(new THREE.Mesh(pole, hardware))
          pin.rotation.x = Math.PI / 2
          pin.position.set(-0.05 + i * 0.02, pickup.y + spread, topZ + 0.024)
        }
      }
    }
  }

  const knobGeometry = b.track(new THREE.CylinderGeometry(0.038, 0.044, 0.05, 24))
  const knobCapGeometry = b.track(new THREE.CylinderGeometry(0.03, 0.034, 0.008, 24))
  const knobMarkGeometry = b.track(new THREE.BoxGeometry(0.005, 0.03, 0.006))
  for (const [x, y] of spec.knobs) {
    const knob = b.add(new THREE.Mesh(knobGeometry, darkPlastic))
    knob.rotation.x = Math.PI / 2
    knob.position.set(x, y, topZ + 0.025)
    knob.castShadow = true

    const cap = b.add(new THREE.Mesh(knobCapGeometry, hardware))
    cap.rotation.x = Math.PI / 2
    cap.position.set(x, y, topZ + 0.052)

    // O risco que indica a posição do potenciômetro.
    const mark = b.add(new THREE.Mesh(knobMarkGeometry, hardware))
    mark.position.set(x, y + 0.026, topZ + 0.05)
  }

  const [sx, sy, sdir] = spec.selector
  const switchPlate = b.add(
    new THREE.Mesh(b.track(new THREE.CylinderGeometry(0.042, 0.042, 0.008, 20)), hardware),
  )
  switchPlate.rotation.x = Math.PI / 2
  switchPlate.position.set(sx, sy, topZ + 0.004)

  const switchTip = b.add(
    new THREE.Mesh(b.track(new THREE.CylinderGeometry(0.011, 0.016, 0.07, 12)), inlayMaterial),
  )
  switchTip.position.set(sx, sy + sdir * 0.012, topZ + 0.036)
  switchTip.rotation.x = sdir * 0.45

  const bridgeY = -0.3
  const bridge = b.add(
    new THREE.Mesh(b.track(new THREE.BoxGeometry(0.16, 0.035, 0.03)), hardware),
  )
  bridge.position.set(0, bridgeY, topZ + 0.012)

  const saddleGeometry = b.track(new THREE.BoxGeometry(0.016, 0.022, 0.018))
  for (let i = 0; i < STRING_COUNT; i++) {
    const saddle = b.add(new THREE.Mesh(saddleGeometry, hardware))
    saddle.position.set(-0.05 + i * 0.02, bridgeY + 0.004, topZ + 0.026)
  }

  // Alavanca: gira na ponte, e é o único pedaço móvel do modelo.
  const whammyPivot = new THREE.Group()
  whammyPivot.position.set(0.06, bridgeY - 0.01, topZ + 0.012)
  b.add(whammyPivot)

  if (spec.tremolo) {
    const arm = new THREE.Mesh(b.track(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 8)), hardware)
    arm.position.set(0.1, -0.03, 0)
    arm.rotation.z = Math.PI / 2 - 0.35
    whammyPivot.add(arm)

    const tip = new THREE.Mesh(b.track(new THREE.SphereGeometry(0.014, 10, 8)), darkPlastic)
    tip.position.set(0.22, -0.11, 0)
    whammyPivot.add(tip)
  } else {
    // Sem alavanca, o cordal fica logo atrás da ponte.
    const tailpiece = b.add(
      new THREE.Mesh(b.track(new THREE.BoxGeometry(0.15, 0.03, 0.028)), hardware),
    )
    tailpiece.position.set(0, bridgeY - 0.1, topZ + 0.012)
  }

  const jack = b.add(
    new THREE.Mesh(b.track(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 12)), hardware),
  )
  jack.rotation.x = Math.PI / 2
  jack.position.set(0.44, -0.3, topZ - 0.02)

  // --- cordas ------------------------------------------------------------

  const stringTop = neckBase + neckLength
  const stringLength = stringTop - bridgeY
  for (let i = 0; i < STRING_COUNT; i++) {
    // As cordas abrem em leque: mais juntas no nut, mais largas na ponte.
    const nutX = -0.055 + i * 0.022
    const bridgeX = -0.05 + i * 0.02
    // Bem mais grossas que o real: uma corda de 1mm desenhada em escala
    // some no antialiasing a qualquer distância de jogo.
    const radius = 0.0042 + (STRING_COUNT - 1 - i) * 0.0009

    const string = b.add(
      new THREE.Mesh(b.track(new THREE.CylinderGeometry(radius, radius, stringLength, 5)), stringMaterial),
    )
    // As cordas correm entre o nut, que fica no alto do braço, e a ponte,
    // que fica sobre o corpo: o meio do caminho é a média das duas alturas.
    const nutZ = spec.depth * 0.1 + 0.062
    const bridgeZ = topZ + 0.032
    string.position.set((nutX + bridgeX) / 2, (stringTop + bridgeY) / 2, (nutZ + bridgeZ) / 2)
    string.rotation.z = Math.atan2(nutX - bridgeX, stringLength)
    string.rotation.x = -Math.atan2(nutZ - bridgeZ, stringLength)
  }

  // --- strap buttons -----------------------------------------------------

  const buttonGeo = b.track(new THREE.CylinderGeometry(0.016, 0.012, 0.024, 10))
  for (const [x, y] of [
    [0, -0.66],
    [-0.5, 0.36],
  ] as const) {
    const strapButton = b.add(new THREE.Mesh(buttonGeo, hardware))
    strapButton.rotation.x = Math.PI / 2
    strapButton.position.set(x, y, topZ)
  }

  return {
    group: b.group,
    setGlow(amount: number) {
      const glow = amount * guitar.aura
      for (const material of glowing) material.emissiveIntensity = glow * 0.85
    },
    setWhammy(amount: number) {
      whammyPivot.rotation.z = -amount * 0.45
    },
    dispose() {
      b.dispose()
    },
  }
}
