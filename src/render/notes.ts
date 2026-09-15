/**
 * Desenho das notas e dos rastros de sustain.
 *
 * Uma música de expert passa de mil notas, e cada uma se move a cada frame.
 * Um `Mesh` por nota faria mil chamadas de desenho; em vez disso há quatro
 * `InstancedMesh` — gemas, anéis, notas abertas e rastros — e por frame só as
 * matrizes das notas visíveis são reescritas. As invisíveis ficam com
 * `count` fora do alcance, o que as tira do desenho sem realocar nada.
 *
 * `frustumCulled` fica desligado e a esfera envolvente nunca é recalculada:
 * as instâncias cobrem o braço inteiro de qualquer forma, e
 * `computeBoundingSphere()` percorre todas as instâncias — caro demais para
 * rodar sessenta vezes por segundo em troca de nada.
 */

import * as THREE from 'three'
import type { Chart, Note } from '../engine/types'
import { FRET_COLORS, fretsToArray } from '../engine/types'
import type { Session } from '../engine/gameplay/session'
import { HIGHWAY_LENGTH, HIGHWAY_OVERSHOOT, HIGHWAY_WIDTH, LANE_WIDTH, NOTE_Y, laneX } from './layout'

const MAX_GEMS = 640
const MAX_RIMS = 320
const MAX_OPENS = 64
const MAX_SUSTAINS = 320

const STAR_POWER_COLOR = new THREE.Color(0xdfe9ff)

export class NoteField {
  readonly group = new THREE.Group()

  private gems: THREE.InstancedMesh
  private rims: THREE.InstancedMesh
  private opens: THREE.InstancedMesh
  private sustains: THREE.InstancedMesh

  private chart: Chart
  private isStarPower: Uint8Array
  private cursor = 0

  private dummy = new THREE.Object3D()
  private color = new THREE.Color()
  private laneColors: THREE.Color[]

  private speed: number
  private starPowerActive = false

  constructor(chart: Chart, speed: number) {
    this.chart = chart
    this.speed = speed
    this.laneColors = FRET_COLORS.map((c) => new THREE.Color(c))
    this.isStarPower = markStarPowerNotes(chart)

    this.gems = makeInstanced(gemGeometry(), gemMaterial(), MAX_GEMS)
    this.rims = makeInstanced(rimGeometry(), rimMaterial(), MAX_RIMS)
    this.opens = makeInstanced(openGeometry(), gemMaterial(), MAX_OPENS)
    this.sustains = makeInstanced(sustainGeometry(), sustainMaterial(), MAX_SUSTAINS)

    this.group.add(this.sustains, this.opens, this.gems, this.rims)
  }

  setSpeed(speed: number) {
    this.speed = speed
  }

  setStarPowerActive(active: boolean) {
    this.starPowerActive = active
  }

  /** Reposiciona o cursor depois de um seek ou de reiniciar a música. */
  reset() {
    this.cursor = 0
  }

  update(songTime: number, session: Session) {
    const notes = this.chart.notes
    // Alcance de tempo que cabe na tela, derivado do comprimento do braço.
    const leadTime = HIGHWAY_LENGTH / this.speed
    const trailTime = HIGHWAY_OVERSHOOT / this.speed

    // O cursor só anda para frente; sustains longos são cobertos porque o
    // recuo considera a duração máxima vista até aqui.
    while (
      this.cursor < notes.length &&
      notes[this.cursor].time + notes[this.cursor].duration < songTime - trailTime
    ) {
      this.cursor++
    }

    let gemCount = 0
    let rimCount = 0
    let openCount = 0
    let sustainCount = 0

    for (let i = this.cursor; i < notes.length; i++) {
      const note = notes[i]
      if (note.time - songTime > leadTime) break

      const status = session.statusOf(i)
      if (status === 'hit' && note.duration === 0) continue

      const z = -(note.time - songTime) * this.speed
      const missed = status === 'missed'
      const starPower = this.isStarPower[i] === 1

      // Rastro de sustain: começa na nota, ou na linha de batida depois que
      // a nota já foi tocada, e termina onde o sustain acaba.
      if (note.duration > 0 && sustainCount < MAX_SUSTAINS) {
        const tailStartTime = Math.max(note.time, songTime)
        const tailEndTime = note.time + note.duration
        if (tailEndTime > songTime) {
          const zStart = -(tailStartTime - songTime) * this.speed
          const zEnd = -(tailEndTime - songTime) * this.speed
          const length = Math.max(0.01, zStart - zEnd)
          const held = status === 'hit'

          this.tintFor(note, missed, starPower, held)
          this.placeSustain(note, zStart - length / 2, length, held)
          this.sustains.setMatrixAt(sustainCount, this.dummy.matrix)
          this.sustains.setColorAt(sustainCount, this.color)
          sustainCount++
        }
      }

      if (status === 'hit') continue

      if (note.isOpen) {
        if (openCount >= MAX_OPENS) continue
        this.tintFor(note, missed, starPower, false)
        this.dummy.position.set(0, NOTE_Y, z)
        this.dummy.rotation.set(0, 0, 0)
        this.dummy.scale.set(1, missed ? 0.4 : 1, 1)
        this.dummy.updateMatrix()
        this.opens.setMatrixAt(openCount, this.dummy.matrix)
        this.opens.setColorAt(openCount, this.color)
        openCount++
        continue
      }

      for (const lane of fretsToArray(note.frets)) {
        if (gemCount >= MAX_GEMS) break
        this.tintFor(note, missed, starPower, false)

        const scale = note.type === 'strum' ? 1 : 0.82
        this.dummy.position.set(laneX(lane), NOTE_Y, z)
        this.dummy.rotation.set(0, 0, 0)
        this.dummy.scale.set(scale, missed ? 0.35 : 1, scale)
        this.dummy.updateMatrix()
        this.gems.setMatrixAt(gemCount, this.dummy.matrix)
        this.gems.setColorAt(gemCount, this.color)
        gemCount++

        // HOPO e tap ganham um anel: é o que diz ao jogador, sem texto,
        // que aquela nota não precisa de palhetada.
        if (note.type !== 'strum' && rimCount < MAX_RIMS) {
          this.color.lerp(new THREE.Color(0xffffff), note.type === 'tap' ? 0.7 : 0.35)
          this.dummy.position.set(laneX(lane), NOTE_Y + 0.05, z)
          this.dummy.scale.setScalar(1)
          this.dummy.rotation.set(-Math.PI / 2, 0, 0)
          this.dummy.updateMatrix()
          this.rims.setMatrixAt(rimCount, this.dummy.matrix)
          this.rims.setColorAt(rimCount, this.color)
          rimCount++
        }
      }
    }

    commit(this.gems, gemCount)
    commit(this.rims, rimCount)
    commit(this.opens, openCount)
    commit(this.sustains, sustainCount)
  }

  private tintFor(note: Note, missed: boolean, starPower: boolean, held: boolean) {
    const lane = note.isOpen ? -1 : fretsToArray(note.frets)[0]
    const base = lane >= 0 ? this.laneColors[lane] : new THREE.Color(0xc084fc)

    this.color.copy(base)
    if (starPower && !this.starPowerActive) this.color.lerp(STAR_POWER_COLOR, 0.65)
    if (this.starPowerActive) this.color.lerp(STAR_POWER_COLOR, 0.45)
    if (held) this.color.multiplyScalar(1.6)
    if (missed) this.color.multiplyScalar(0.18)
  }

  private placeSustain(note: Note, zCenter: number, length: number, held: boolean) {
    const lanes = note.isOpen ? [] : fretsToArray(note.frets)
    const x = note.isOpen ? 0 : laneX(lanes[0])
    const width = note.isOpen ? HIGHWAY_WIDTH * 0.9 : LANE_WIDTH * (held ? 0.42 : 0.3)

    this.dummy.position.set(x, NOTE_Y - 0.02, zCenter)
    this.dummy.rotation.set(0, 0, 0)
    this.dummy.scale.set(width, 1, length)
    this.dummy.updateMatrix()
  }

  dispose() {
    for (const mesh of [this.gems, this.rims, this.opens, this.sustains]) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
  }
}

/** Marca quais notas caem dentro de um trecho de star power. */
function markStarPowerNotes(chart: Chart): Uint8Array {
  const flags = new Uint8Array(chart.notes.length)
  let phrase = 0
  for (let i = 0; i < chart.notes.length; i++) {
    const t = chart.notes[i].time
    while (phrase < chart.starPower.length && chart.starPower[phrase].end <= t) phrase++
    if (phrase < chart.starPower.length && t >= chart.starPower[phrase].start) flags[i] = 1
  }
  return flags
}

function makeInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  capacity: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false
  mesh.count = 0
  // Uma cor inicial é necessária para o atributo de cor por instância existir.
  const white = new THREE.Color(0xffffff)
  for (let i = 0; i < capacity; i++) mesh.setColorAt(i, white)
  return mesh
}

function commit(mesh: THREE.InstancedMesh, count: number) {
  mesh.count = count
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

function gemGeometry() {
  const geometry = new THREE.CylinderGeometry(0.19, 0.21, 0.1, 20)
  geometry.translate(0, 0.05, 0)
  return geometry
}

function rimGeometry() {
  return new THREE.TorusGeometry(0.2, 0.028, 8, 24)
}

function openGeometry() {
  const geometry = new THREE.BoxGeometry(HIGHWAY_WIDTH * 0.92, 0.09, 0.3)
  geometry.translate(0, 0.045, 0)
  return geometry
}

function sustainGeometry() {
  const geometry = new THREE.BoxGeometry(1, 0.05, 1)
  return geometry
}

function gemMaterial() {
  return new THREE.MeshStandardMaterial({
    roughness: 0.25,
    metalness: 0.15,
    emissive: 0xffffff,
    emissiveIntensity: 0.0,
    vertexColors: false,
  })
}

function rimMaterial() {
  return new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 })
}

function sustainMaterial() {
  return new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75 })
}
