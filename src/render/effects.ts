/**
 * Fogo de acerto, faíscas e o brilho que sobe da linha de batida.
 *
 * As partículas vivem num pool de tamanho fixo simulado na CPU e desenhado
 * como um único `InstancedMesh` aditivo. O pool nunca cresce: quando está
 * cheio, a partícula mais velha é reaproveitada. Isso mantém o custo por
 * frame constante mesmo num trecho de notas rápidas, que é exatamente
 * quando não pode haver engasgo.
 */

import * as THREE from 'three'
import { FRET_COLORS } from '../engine/types'
import { LANE_COUNT, NOTE_Y, laneX } from './layout'

const MAX_PARTICLES = 360

interface Particle {
  life: number
  maxLife: number
  position: THREE.Vector3
  velocity: THREE.Vector3
  size: number
  color: THREE.Color
  spin: number
  angle: number
}

export class HitEffects {
  readonly group = new THREE.Group()

  private mesh: THREE.InstancedMesh
  private particles: Particle[] = []
  private next = 0
  private dummy = new THREE.Object3D()
  private flames: THREE.Mesh[] = []
  private flameHeat: number[] = new Array(LANE_COUNT).fill(0)

  constructor() {
    const geometry = new THREE.PlaneGeometry(1, 1)
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 1,
    })

    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_PARTICLES)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.renderOrder = 10
    const white = new THREE.Color(0xffffff)
    for (let i = 0; i < MAX_PARTICLES; i++) this.mesh.setColorAt(i, white)

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        life: 0,
        maxLife: 1,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        size: 0.1,
        color: new THREE.Color(),
        spin: 0,
        angle: 0,
      })
    }

    this.group.add(this.mesh)
    this.buildFlames()
  }

  /** Coluna de luz que fica acesa enquanto o traste é acertado seguidamente. */
  private buildFlames() {
    const geometry = new THREE.ConeGeometry(0.22, 1.1, 12, 1, true)
    geometry.translate(0, 0.55, 0)

    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const material = new THREE.MeshBasicMaterial({
        color: FRET_COLORS[lane],
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const flame = new THREE.Mesh(geometry, material)
      flame.position.set(laneX(lane), NOTE_Y, 0)
      flame.renderOrder = 9
      this.group.add(flame)
      this.flames.push(flame)
    }
  }

  /** Estouro de acerto num traste. */
  burst(lane: number, intensity = 1, starPower = false) {
    const origin = new THREE.Vector3(lane < 0 ? 0 : laneX(lane), NOTE_Y + 0.05, 0)
    const base = new THREE.Color(lane < 0 ? 0xc084fc : FRET_COLORS[lane])
    if (starPower) base.lerp(new THREE.Color(0xdfe9ff), 0.6)

    const count = Math.round(10 + 10 * intensity)
    for (let i = 0; i < count; i++) {
      const particle = this.particles[this.next]
      this.next = (this.next + 1) % MAX_PARTICLES

      const spread = lane < 0 ? 1.3 : 0.32
      particle.position.copy(origin)
      particle.position.x += (Math.random() - 0.5) * spread
      particle.velocity.set(
        (Math.random() - 0.5) * 1.6,
        0.9 + Math.random() * 2.2 * intensity,
        (Math.random() - 0.2) * 2.4,
      )
      particle.maxLife = 0.28 + Math.random() * 0.34
      particle.life = particle.maxLife
      particle.size = 0.06 + Math.random() * 0.1
      particle.color.copy(base).multiplyScalar(0.8 + Math.random() * 0.6)
      particle.angle = Math.random() * Math.PI
      particle.spin = (Math.random() - 0.5) * 8
    }

    if (lane >= 0) this.flameHeat[lane] = Math.min(1, this.flameHeat[lane] + 0.5)
    else for (let l = 0; l < LANE_COUNT; l++) this.flameHeat[l] = Math.min(1, this.flameHeat[l] + 0.4)
  }

  update(dt: number, cameraQuaternion: THREE.Quaternion) {
    let count = 0

    for (const particle of this.particles) {
      if (particle.life <= 0) continue
      particle.life -= dt
      if (particle.life <= 0) continue

      particle.velocity.y -= 3.4 * dt
      particle.position.addScaledVector(particle.velocity, dt)
      particle.angle += particle.spin * dt

      const t = particle.life / particle.maxLife
      const scale = particle.size * (0.4 + t * 1.4)

      // As partículas encaram a câmera: giram no plano da tela, não no mundo.
      this.dummy.position.copy(particle.position)
      this.dummy.quaternion.copy(cameraQuaternion)
      this.dummy.rotateZ(particle.angle)
      this.dummy.scale.setScalar(scale)
      this.dummy.updateMatrix()

      this.mesh.setMatrixAt(count, this.dummy.matrix)
      this.mesh.setColorAt(count, particle.color.clone().multiplyScalar(t))
      count++
    }

    this.mesh.count = count
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true

    const decay = Math.exp(-dt * 3.2)
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      this.flameHeat[lane] *= decay
      const material = this.flames[lane].material as THREE.MeshBasicMaterial
      material.opacity = this.flameHeat[lane] * 0.55
      const wobble = 1 + Math.sin(performance.now() * 0.02 + lane) * 0.08
      this.flames[lane].scale.set(1, this.flameHeat[lane] * wobble, 1)
    }
  }

  dispose() {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    for (const flame of this.flames) (flame.material as THREE.Material).dispose()
  }
}
