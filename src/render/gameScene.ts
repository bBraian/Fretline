/**
 * Montagem da cena e o laço de desenho.
 *
 * Esta é a única classe que conhece as três camadas ao mesmo tempo: pergunta
 * a posição da música ao relógio, avança a sessão, e desenha o resultado.
 * O sentido das dependências é sempre este — nada dentro de `render/`
 * escreve no engine.
 */

import * as THREE from 'three'
import type { Clock } from '../engine/clock'
import type { Session, SessionEvent } from '../engine/gameplay/session'
import { fretsToArray } from '../engine/types'
import { Highway } from './highway'
import { NoteField } from './notes'
import { HitEffects } from './effects'
import { Stage } from './stage'
import { DEFAULT_NOTE_SPEED } from './layout'
import type { PerformanceState } from './character'

export interface GameSceneOptions {
  canvas: HTMLCanvasElement
  session: Session
  clock: Clock
  characterId: string
  guitarId: string
  noteSpeed?: number
  /** Deslocamento visual da calibração, separado do de áudio. */
  videoOffset?: number
  /** Chamado a cada evento do engine, para som e para a interface. */
  onEvent?: (event: SessionEvent) => void
}

export class GameScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private highway: Highway
  private notes: NoteField
  private effects: HitEffects
  private stage: Stage

  private session: Session
  private clock: Clock
  private onEvent?: (event: SessionEvent) => void
  private videoOffset: number

  private running = false
  private lastFrame = 0
  private shake = 0
  private cameraBase = new THREE.Vector3(0, 2.45, 5.0)
  private lookTarget = new THREE.Vector3(0, 1.75, -11)
  private missFeedback = 0
  private beats: number[]
  private beatCursor = 0

  constructor(options: GameSceneOptions) {
    this.session = options.session
    this.clock = options.clock
    this.onEvent = options.onEvent
    this.videoOffset = options.videoOffset ?? 0
    this.beats = options.session.getChart().beats

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    this.scene.background = new THREE.Color(0x04050a)
    this.scene.fog = new THREE.Fog(0x070a14, 30, 62)

    this.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 140)
    this.camera.position.copy(this.cameraBase)
    this.camera.lookAt(this.lookTarget)

    this.highway = new Highway()
    this.notes = new NoteField(options.session.getChart(), options.noteSpeed ?? DEFAULT_NOTE_SPEED)
    this.effects = new HitEffects()
    this.stage = new Stage(options.characterId, options.guitarId)

    this.scene.add(this.highway.group, this.notes.group, this.effects.group, this.stage.group)
    this.addHighwayLighting()

    this.resize()
    window.addEventListener('resize', this.resize)
  }

  /**
   * Iluminação própria da pista.
   *
   * As luzes do palco estão longe demais para alcançar as notas, e as notas
   * precisam ser legíveis do começo ao fim do braço — é a única coisa na
   * tela que o jogador não pode deixar de ver. São luzes pontuais de alcance
   * curto distribuídas ao longo da pista, em vez de uma só, para que o
   * brilho não caia no fundo.
   */
  private addHighwayLighting() {
    this.scene.add(new THREE.AmbientLight(0xa8b8e0, 0.55))

    for (const z of [0, -8, -18]) {
      const light = new THREE.PointLight(0xdce6ff, 18, 16, 2)
      light.position.set(0, 3.2, z)
      this.scene.add(light)
    }
  }

  setNoteSpeed(speed: number) {
    this.notes.setSpeed(speed)
  }

  setCharacter(id: string) {
    this.stage.setCharacter(id)
  }

  setGuitar(id: string) {
    this.stage.setGuitar(id)
  }

  /** Estado dos trastes pressionados, vindo do gerenciador de input. */
  setPressed(mask: number) {
    this.highway.setPressed(mask)
  }

  start() {
    if (this.running) return
    this.running = true
    this.lastFrame = performance.now()
    this.renderer.setAnimationLoop(this.frame)
  }

  stop() {
    this.running = false
    this.renderer.setAnimationLoop(null)
  }

  private resize = () => {
    const canvas = this.renderer.domElement
    const width = canvas.clientWidth || window.innerWidth
    const height = canvas.clientHeight || window.innerHeight
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private frame = () => {
    const now = performance.now()
    // O delta serve só para animação; o tempo da música vem do relógio de
    // áudio. Limitá-lo evita que uma aba em segundo plano volte com um
    // salto que quebra as interpolações.
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000)
    this.lastFrame = now

    const songTime = this.clock.now()
    this.session.update(songTime)
    this.drainEvents()

    const state = this.session.getState()
    const beatPhase = this.beatPhaseAt(songTime)

    this.notes.setStarPowerActive(state.starPowerActive)
    this.notes.update(songTime + this.videoOffset, this.session)

    this.highway.setStarPower(state.starPowerActive ? 1 : state.starPowerAmount * 0.25)
    this.highway.setDanger(state.rockMeter < 0.25 ? 1 - state.rockMeter / 0.25 : 0)
    this.highway.update(dt)

    this.effects.update(dt, this.camera.quaternion)
    this.stage.setPerformance(this.performanceState(), this.excitement(), state.starPowerActive ? 1 : 0)
    this.stage.update(dt, beatPhase)

    this.updateCamera(dt, beatPhase)
    this.renderer.render(this.scene, this.camera)
  }

  private drainEvents() {
    for (const event of this.session.consumeEvents()) {
      switch (event.kind) {
        case 'hit': {
          const lanes = event.note.isOpen ? [-1] : fretsToArray(event.note.frets)
          const intensity = event.verdict === 'perfect' ? 1.3 : 1
          for (const lane of lanes) {
            this.effects.burst(lane, intensity, this.session.getState().starPowerActive)
          }
          this.missFeedback = Math.max(0, this.missFeedback - 0.5)
          break
        }
        case 'miss':
        case 'ghostTap':
          this.missFeedback = 1
          this.shake = Math.min(1, this.shake + 0.35)
          break
        case 'starPowerStart':
          this.shake = Math.min(1, this.shake + 0.6)
          break
      }
      this.onEvent?.(event)
    }
  }

  /** Fração da batida atual, de 0 a 1, para a banda e as luzes. */
  private beatPhaseAt(songTime: number): number {
    if (this.beats.length < 2) return (songTime % 0.5) / 0.5

    while (this.beatCursor > 0 && this.beats[this.beatCursor] > songTime) this.beatCursor--
    while (
      this.beatCursor < this.beats.length - 2 &&
      this.beats[this.beatCursor + 1] <= songTime
    ) {
      this.beatCursor++
    }

    const start = this.beats[this.beatCursor]
    const end = this.beats[this.beatCursor + 1]
    if (end <= start) return 0
    return Math.min(1, Math.max(0, (songTime - start) / (end - start)))
  }

  private performanceState(): PerformanceState {
    const state = this.session.getState()
    if (state.rockMeter < 0.25) return 'failing'
    if (state.starPowerActive) return 'starPower'
    if (state.streak >= 30) return 'solo'
    if (this.clock.now() < 0) return 'idle'
    return 'playing'
  }

  /** Quanto a banda deve se empolgar, do medidor e da corrente de acertos. */
  private excitement(): number {
    const state = this.session.getState()
    const fromStreak = Math.min(1, state.streak / 40)
    const fromMeter = Math.max(0, (state.rockMeter - 0.3) / 0.7)
    return Math.min(1, 0.25 + fromStreak * 0.5 + fromMeter * 0.35)
  }

  private updateCamera(dt: number, beatPhase: number) {
    this.shake *= Math.exp(-dt * 6)
    this.missFeedback *= Math.exp(-dt * 2.5)

    const pulse = Math.cos(beatPhase * Math.PI * 2) * 0.012 * this.excitement()
    const jitter = this.shake * 0.05

    this.camera.position.set(
      this.cameraBase.x + (Math.random() - 0.5) * jitter,
      this.cameraBase.y + pulse + (Math.random() - 0.5) * jitter,
      this.cameraBase.z + pulse * 0.5,
    )
    this.camera.lookAt(this.lookTarget)
    // Uma inclinação mínima na falha: o mundo desaprumando junto com o jogador.
    this.camera.rotation.z = this.missFeedback * 0.012
  }

  dispose() {
    this.stop()
    window.removeEventListener('resize', this.resize)
    this.highway.dispose()
    this.notes.dispose()
    this.effects.dispose()
    this.stage.dispose()
    this.renderer.dispose()
  }
}
