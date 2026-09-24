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
import type { Chart } from '../engine/types'
import { FRET_COLORS, fretsToArray } from '../engine/types'
import type { Session } from '../engine/gameplay/session'
import { HIGHWAY_LENGTH, HIGHWAY_OVERSHOOT, HIGHWAY_WIDTH, LANE_WIDTH, NOTE_Y, laneX } from './layout'

const MAX_GEMS = 640
const MAX_RIMS = 320
const MAX_OPENS = 64
const MAX_SUSTAINS = 320

/**
 * Quanto a cauda segurada ondula, em unidades de mundo.
 *
 * `HELD_WAVE` é o tremor de uma nota só segurada — a cauda viva do original,
 * que diz "está valendo" sem texto. `WHAMMY_WAVE` é o que a alavanca soma no
 * curso inteiro. O teto é a folga entre a cauda e a divisória da pista: a
 * onda não pode invadir o traste vizinho, senão o rastro de um traste passa
 * a parecer nota do outro.
 */
const HELD_WAVE = 0.012
const WHAMMY_WAVE = 0.08

const STAR_POWER_COLOR = new THREE.Color(0xdfe9ff)
const WHITE = new THREE.Color(0xffffff)
/** Nota aberta não tem traste, então não tem cor de traste. */
const OPEN_COLOR = new THREE.Color(0xc084fc)

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
  /** Alavanca, de 0 a 1; só mexe nas caudas que estão sendo seguradas. */
  private whammy = 0
  /** Amplitude da onda de cada rastro, por instância. */
  private waves: THREE.InstancedBufferAttribute
  private sustainMaterial: THREE.ShaderMaterial

  constructor(chart: Chart, speed: number) {
    this.chart = chart
    this.speed = speed
    this.laneColors = FRET_COLORS.map((c) => new THREE.Color(c))
    this.isStarPower = markStarPowerNotes(chart)

    this.gems = makeInstanced(gemGeometry(), gemMaterial(), MAX_GEMS)
    this.rims = makeInstanced(rimGeometry(), rimMaterial(), MAX_RIMS)
    this.opens = makeInstanced(openGeometry(), gemMaterial(), MAX_OPENS)
    this.sustainMaterial = sustainMaterial()
    const tails = sustainGeometry()
    this.waves = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SUSTAINS), 1)
    this.waves.setUsage(THREE.DynamicDrawUsage)
    tails.setAttribute('aWave', this.waves)
    this.sustains = makeInstanced(tails, this.sustainMaterial, MAX_SUSTAINS)

    this.group.add(this.sustains, this.opens, this.gems, this.rims)
  }

  setSpeed(speed: number) {
    this.speed = speed
  }

  setStarPowerActive(active: boolean) {
    this.starPowerActive = active
  }

  /**
   * A alavanca, já filtrada por quem chama: fora de um sustain segurado ela
   * não faz nada no original, e aqui também não.
   */
  setWhammy(value: number) {
    this.whammy = Math.min(1, Math.max(0, value))
  }

  /** Reposiciona o cursor depois de um seek ou de reiniciar a música. */
  reset() {
    this.cursor = 0
  }

  update(songTime: number, session: Session) {
    // A onda corre no relógio da música: pausada a música, a cauda para
    // junto, em vez de continuar tremendo sobre um quadro congelado.
    this.sustainMaterial.uniforms.uTime.value = songTime
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
      //
      // Um acorde é uma nota só com vários trastes e uma duração só, então
      // *todos* os trastes dele seguram. Desenhar o rastro apenas no
      // primeiro fazia um acorde sustentado parecer uma nota para segurar
      // mais uma para apertar — e o jogador soltava a segunda.
      if (note.duration > 0) {
        const tailStartTime = Math.max(note.time, songTime)
        const tailEndTime = note.time + note.duration
        if (tailEndTime > songTime) {
          const zStart = -(tailStartTime - songTime) * this.speed
          // O rastro termina no fim do braço, não no fim da nota. A nota
          // entra em cena quando a cabeça chega ao fundo da pista, mas um
          // sustain longo ainda tem segundos de cauda atrás dela — e essa
          // cauda saía pela ponta do braço, subindo pelo palco até o ponto
          // de fuga. O resto dela aparece conforme a pista rola.
          const zEnd = Math.max(-HIGHWAY_LENGTH, -(tailEndTime - songTime) * this.speed)
          const length = Math.max(0.01, zStart - zEnd)
          const held = status === 'hit'
          const wave = held ? HELD_WAVE + this.whammy * WHAMMY_WAVE : 0
          const tailLanes = note.isOpen ? [-1] : fretsToArray(note.frets)

          for (const lane of tailLanes) {
            if (sustainCount >= MAX_SUSTAINS) break
            this.tintFor(lane, missed, starPower, held)
            this.placeSustain(lane, zStart - length / 2, length, held)
            this.sustains.setMatrixAt(sustainCount, this.dummy.matrix)
            this.sustains.setColorAt(sustainCount, this.color)
            // A nota aberta cobre a pista inteira; balançá-la de lado a
            // jogaria para fora do braço.
            this.waves.setX(sustainCount, lane < 0 ? 0 : wave)
            sustainCount++
          }
        }
      }

      if (status === 'hit') continue

      if (note.isOpen) {
        if (openCount >= MAX_OPENS) continue
        this.tintFor(-1, missed, starPower, false)
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
        const base = this.laneColors[lane]
        this.tintFor(lane, missed, starPower, false)

        const scale = 1
        this.dummy.position.set(laneX(lane), NOTE_Y, z)
        this.dummy.rotation.set(0, 0, 0)
        this.dummy.scale.set(scale, missed ? 0.35 : 1, scale)
        this.dummy.updateMatrix()
        this.gems.setMatrixAt(gemCount, this.dummy.matrix)
        this.gems.setColorAt(gemCount, this.color)
        gemCount++

        // Toda nota leva um aro, como os botões do original: é o aro que dá
        // à gema o aspecto de botão e a separa do fundo da pista. Nas notas
        // de star power ele é branco e mais forte, que é a diferença que o
        // original usa — sem lavar a cor do traste, que é o que o jogador lê
        // primeiro.
        if (rimCount < MAX_RIMS && !missed) {
          if (starPower) this.color.set(0xf2f6ff)
          else this.color.copy(base).lerp(WHITE, 0.55)

          this.dummy.position.set(laneX(lane), NOTE_Y + 0.045, z)
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
    this.waves.needsUpdate = true
  }

  /**
   * Cor de uma peça, dada a pista em que ela está.
   *
   * Recebe a pista, e não a nota: um acorde ocupa várias pistas, e tingir
   * todas as peças dele pela cor do primeiro traste pintava a gema do
   * vermelho de verde. A cor do traste é a primeira coisa que o jogador lê,
   * e errar nela é errar a informação principal da tela.
   *
   * `lane` igual a -1 é nota aberta, que não tem traste.
   */
  private tintFor(lane: number, missed: boolean, starPower: boolean, held: boolean) {
    const base = lane >= 0 ? this.laneColors[lane] : OPEN_COLOR

    this.color.copy(base)
    // A lavagem do star power é leve de propósito. A cor do traste é a
    // informação que o jogador lê primeiro, e tingir as cinco pistas de um
    // mesmo azul pálido tornava o trecho ilegível justamente onde as notas
    // são mais rápidas. Quem sinaliza star power é o anel.
    if (starPower && !this.starPowerActive) this.color.lerp(STAR_POWER_COLOR, 0.22)
    if (this.starPowerActive) this.color.lerp(STAR_POWER_COLOR, 0.18)
    if (held) this.color.multiplyScalar(1.6)
    if (missed) this.color.multiplyScalar(0.18)
  }

  private placeSustain(lane: number, zCenter: number, length: number, held: boolean) {
    const isOpen = lane < 0
    const x = isOpen ? 0 : laneX(lane)
    const width = isOpen ? HIGHWAY_WIDTH * 0.9 : LANE_WIDTH * (held ? 0.42 : 0.3)

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
  // Tronco de cone baixo: a parede inclinada pega a luz de lado e dá
  // volume, coisa que um disco reto não faz em nenhum ângulo de câmera.
  const geometry = new THREE.CylinderGeometry(0.155, 0.205, 0.115, 24)
  geometry.translate(0, 0.058, 0)
  return geometry
}

function rimGeometry() {
  return new THREE.TorusGeometry(0.205, 0.036, 10, 28)
}

function openGeometry() {
  const geometry = new THREE.BoxGeometry(HIGHWAY_WIDTH * 0.92, 0.09, 0.3)
  geometry.translate(0, 0.045, 0)
  return geometry
}

function sustainGeometry() {
  // Fatiada ao comprido: a onda da alavanca desloca vértice por vértice, e
  // uma caixa de uma fatia só ondularia como uma régua inclinada.
  const geometry = new THREE.BoxGeometry(1, 0.05, 1, 1, 1, 96)
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
  // O aro é metálico, não luminoso: ele precisa reagir à luz da pista para
  // parecer a borda cromada de um botão.
  return new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0.8 })
}

/**
 * O rastro ondula no vértice, não na matriz da instância.
 *
 * A onda é calculada em coordenada de mundo, depois da matriz de cada
 * instância: o rastro é uma caixa esticada ao comprimento da nota, e uma
 * onda em coordenada local esticaria junto — uma cauda curta ondularia
 * rápido e uma longa, devagar. Em mundo, todas ondulam no mesmo passo.
 */
const SUSTAIN_VERTEX = /* glsl */ `
attribute float aWave;
uniform float uTime;
varying vec3 vColor;

void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  // Presa no botão: a onda cresce a partir da linha de batida, e a cauda
  // continua saindo do traste que o jogador está segurando.
  float anchor = smoothstep(0.0, 1.6, -world.z);
  world.x += aWave * anchor * sin(world.z * 2.4 + uTime * 17.0);
  vColor = instanceColor;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

/** As inclusões do fim são as mesmas da pista; ver `highway.ts`. */
const SUSTAIN_FRAGMENT = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;

void main() {
  gl_FragColor = vec4(vColor, uOpacity);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function sustainMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: SUSTAIN_VERTEX,
    fragmentShader: SUSTAIN_FRAGMENT,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.75 } },
    transparent: true,
  })
}
