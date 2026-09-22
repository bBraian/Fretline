/**
 * Montagem da cena e o laço de desenho.
 *
 * Esta é a única classe que conhece as três camadas ao mesmo tempo: pergunta
 * a posição da música ao relógio, avança a sessão, e desenha o resultado.
 * O sentido das dependências é sempre este — nada dentro de `render/`
 * escreve no engine.
 *
 * **São duas cenas, não uma.** O palco tem uma câmera que corta entre planos
 * durante a música; o braço da guitarra tem uma câmera fixa e nunca se mexe.
 * Se as duas coisas dividissem uma câmera, seria impossível: mover o ângulo
 * do show moveria as notas junto, e um jogo de ritmo em que a pista se mexe
 * é injogável. Então o palco é desenhado primeiro, com a câmera do diretor;
 * o buffer de profundidade é limpo; e o braço é desenhado por cima, com a
 * câmera fixa. É como o original faz, e é o que permite ter direção de
 * câmera sem tocar na jogabilidade.
 */

import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { Clock } from '../engine/clock'
import type { Session, SessionEvent } from '../engine/gameplay/session'
import { fretsToArray } from '../engine/types'
import { Highway } from './highway'
import { NoteField } from './notes'
import { HitEffects } from './effects'
import { Stage } from './stage'
import { DEFAULT_NOTE_SPEED } from './layout'
import { CameraDirector, type ShotMood } from './cameraDirector'
import { guitarById } from '../content/guitars'
import type { PerformanceState } from './character/characterModel'

/**
 * Qualidade gráfica.
 *
 * Na alta, o quadro passa por um compositor com bloom e há sombras
 * projetadas. Na baixa, as duas cenas são desenhadas direto na tela e o
 * pós-processamento sai inteiro — o que vale tanto para uma máquina fraca
 * quanto para o navegador headless dos testes, que rasteriza por software e
 * com o caminho completo trava a thread principal a ponto de atrasar o
 * próprio input.
 */
export type Quality = 'alta' | 'baixa'

export interface GameSceneOptions {
  canvas: HTMLCanvasElement
  session: Session
  clock: Clock
  characterId: string
  guitarId: string
  noteSpeed?: number
  /** Qualidade gráfica; 'baixa' desliga pós-processamento e sombras. */
  quality?: Quality
  /** Deslocamento visual da calibração, separado do de áudio. */
  videoOffset?: number
  /** Chamado a cada evento do engine, para som e para a interface. */
  onEvent?: (event: SessionEvent) => void
}

export class GameScene {
  private renderer: THREE.WebGLRenderer
  /** Cena do show: palco, banda, luzes, plateia. */
  private stageScene = new THREE.Scene()
  /** Cena da jogabilidade: braço, notas, efeitos. */
  private playScene = new THREE.Scene()
  private composer: EffectComposer | null = null
  private bloom: UnrealBloomPass | null = null
  private quality: Quality
  private director: CameraDirector
  /** Painel de encaixes: congela a banda e os cortes de câmera. */
  private frozen = false
  /** Em encerramento: a pista sai e o palco fica. */
  private outro = false
  private outroFade = 0
  /** Instante em que congelou, para o diretor não avançar de plano. */
  private frozenAt: number | null = null
  private environment: THREE.Texture | null = null
  private camera: THREE.PerspectiveCamera
  /** Público para conferência do tema da pista com `?debug`. */
  readonly highway: Highway
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
  /** Velocidade de rolagem; a pista e as notas precisam usar a mesma. */
  private noteSpeed: number

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

    this.quality = options.quality ?? 'alta'
    this.renderer.shadowMap.enabled = this.quality === 'alta'
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    // Na qualidade baixa as duas cenas são desenhadas uma sobre a outra na
    // mão, então a limpeza automática entre elas precisa sair do caminho.
    this.renderer.autoClear = false

    this.stageScene.background = new THREE.Color(0x04050a)
    // A névoa vive só na cena do show. Na pista ela apagaria as notas
    // distantes, que são justamente o que o jogador precisa ler antes.
    this.stageScene.fog = new THREE.Fog(0x070a14, 26, 72)

    this.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 140)
    this.camera.position.copy(this.cameraBase)
    this.camera.lookAt(this.lookTarget)

    this.highway = new Highway(this.beats)
    this.noteSpeed = options.noteSpeed ?? DEFAULT_NOTE_SPEED
    this.notes = new NoteField(options.session.getChart(), this.noteSpeed)
    this.effects = new HitEffects()
    this.stage = new Stage(options.characterId, options.guitarId, {
      effects: this.quality === 'alta',
    })

    this.playScene.add(this.highway.group, this.notes.group, this.effects.group)
    this.stageScene.add(this.stage.group)

    // Reflexos do palco: o metal dos pratos, das tarraxas e da ponte precisa
    // ter alguma coisa para refletir, senão sai cinza e o instrumento não
    // lê como metal.
    // Só na qualidade alta: iluminação por imagem faz cada material avaliar
    // um mapa de ambiente por pixel, e foi a parte mais cara do palco em
    // medição — mais que o número de luzes e mais que o de chamadas de
    // desenho. Sem ela o metal fica mais opaco, e nada mais muda.
    if (this.quality === 'alta') {
      const pmrem = new THREE.PMREMGenerator(this.renderer)
      this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
      this.stageScene.environment = this.environment
      this.stageScene.environmentIntensity = 0.35
      pmrem.dispose()
    }
    this.addHighwayLighting()

    // A pista veste as cores da guitarra escolhida.
    this.highway.setGuitarTheme(
      guitarById(options.guitarId).colors.body,
      guitarById(options.guitarId).colors.hardware,
    )

    this.director = new CameraDirector(16 / 9)

    // O three inteiro, para conferência: permite lançar raios a partir de um
    // pixel e perguntar à cena o que está ali.
    if (new URLSearchParams(location.search).has('debug')) {
      ;(window as unknown as { __THREE?: unknown }).__THREE = THREE
    }

    // Ganchos do painel de encaixes (`?rig`). Ficam no objeto da cena para o
    // painel não precisar conhecer o caminho até o diretor de câmera.
    if (new URLSearchParams(location.search).has('rig')) {
      ;(window as unknown as { __rigScene?: unknown }).__rigScene = {
        shots: CameraDirector.shotIds(),
        lockShot: (id: string | null) => this.director.lockShot(id),
        lockedShot: () => this.director.lockedShot,
        setFrozen: (value: boolean) => {
          this.frozen = value
        },
        isFrozen: () => this.frozen,
      }
    }
    // A câmera do diretor é filha do palco: assim todo plano é escrito em
    // coordenadas do palco, e mover o palco não exige refazer os planos.
    this.stage.group.add(this.director.camera)

    if (this.quality === 'alta') {
      this.composer = new EffectComposer(this.renderer)
      const stagePass = new RenderPass(this.stageScene, this.director.camera)
      const playPass = new RenderPass(this.playScene, this.camera)
      // O segundo passe preserva a cor do palco e zera só a profundidade, de
      // modo que o braço fique sempre na frente do show.
      playPass.clear = false
      playPass.clearDepth = true

      // Limiar alto: só o que é de fato brilhante — chamas de acerto, painel
      // de LED, star power — deve espalhar. Um limiar baixo faz as notas
      // comuns estourarem em branco e a pista perde a leitura de cor.
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.5, 0.92)

      this.composer.addPass(stagePass)
      this.composer.addPass(playPass)
      this.composer.addPass(this.bloom)
      this.composer.addPass(new OutputPass())
    }

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
    this.playScene.add(new THREE.AmbientLight(0xa8b8e0, 0.6))

    for (const z of [0, -8, -18]) {
      const light = new THREE.PointLight(0xdce6ff, 10, 16, 2)
      light.position.set(0, 3.2, z)
      this.playScene.add(light)
    }
  }

  setNoteSpeed(speed: number) {
    this.noteSpeed = speed
    this.notes.setSpeed(speed)
  }

  setCharacter(id: string) {
    this.stage.setCharacter(id)
  }

  setGuitar(id: string) {
    this.stage.setGuitar(id)
  }

  /**
   * Liga e desliga partes da cena, para isolar custo em diagnóstico.
   *
   * É medindo assim — apagando uma parte e comparando os quadros por
   * segundo — que se descobre o que custa. Cronometrar `renderer.render()`
   * não serve: a chamada só enfileira comandos e volta, e o tempo real
   * aparece depois, fora do alcance do relógio do JavaScript.
   */
  setVisible(part: 'stage' | 'play' | 'band' | 'rig' | 'crowd', visible: boolean) {
    if (part === 'stage') this.stage.group.visible = visible
    else if (part === 'play') this.highway.group.visible = visible
    else this.stage.setPartVisible(part, visible)
  }

  /** Estado dos trastes pressionados, vindo do gerenciador de input. */
  /**
   * Encerramento da apresentação.
   *
   * A banda continua no palco tocando o fim, a câmera abre para um plano
   * geral e a pista some. É o contrário do que acontecia: a tela de
   * resultados entrava no mesmo quadro em que a última nota passava, e o
   * corte lia como travamento.
   */
  beginOutro() {
    this.outro = true
    this.director.lockShot('wide')
    this.stage.setPerformance('playing', 1, 0)
  }

  /** Espera o palco terminar de carregar o que precisa aparecer pronto. */
  ready() {
    return this.stage.ready()
  }

  /** O que já chegou, para a tela de espera mostrar progresso de verdade. */
  get loadingProgress() {
    return this.stage.loadingProgress
  }

  /** Repassa a alavanca ao palco, que a leva até o modelo da guitarra. */
  setWhammy(value: number) {
    this.stage.setWhammy(value)
  }

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
    this.composer?.setSize(width, height)
    this.bloom?.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.director?.setAspect(width / height)
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
    this.highway.update(dt, songTime + this.videoOffset, this.noteSpeed)

    // A pista se apaga no encerramento, deixando o palco sozinho.
    if (this.outro) {
      this.outroFade = Math.min(1, this.outroFade + dt / 1.1)
      const restante = 1 - this.outroFade
      this.highway.group.visible = restante > 0.02
      this.notes.group.visible = restante > 0.02
      this.highway.group.scale.setScalar(Math.max(0.001, restante))
      this.notes.group.scale.setScalar(Math.max(0.001, restante))
    }

    this.effects.update(this.frozen ? 0 : dt, this.camera.quaternion)
    this.stage.setPerformance(this.performanceState(), this.excitement(), state.starPowerActive ? 1 : 0)
    // Congelado, a banda não avança — é o que permite ajustar a posição de
    // um instrumento sem ele se mexer debaixo do controle.
    this.stage.update(this.frozen ? 0 : dt, beatPhase)

    this.updateCamera(this.frozen ? 0 : dt)

    this.director.setMood(this.mood())
    // Congelado, o diretor também para no tempo: passar o `songTime` que
    // continua correndo faria o plano vencer e a câmera cortar mesmo com
    // `dt` zerado.
    if (this.frozenAt == null) this.frozenAt = this.frozen ? songTime : null
    if (!this.frozen) this.frozenAt = null
    this.director.update(
      this.frozen ? 0 : dt,
      this.frozenAt ?? songTime,
      this.beats,
      beatPhase,
    )

    if (this.composer && this.bloom) {
      // O brilho aumenta no star power: é o efeito que diz, sem texto, que o
      // jogo mudou de estado.
      this.bloom.strength = 0.42 + (state.starPowerActive ? 0.55 : 0) + this.excitement() * 0.12
      this.composer.render()
    } else {
      // Caminho direto: o palco primeiro, depois a pista por cima com a
      // profundidade zerada — o mesmo empilhamento, sem compositor.
      this.renderer.clear()
      this.renderer.render(this.stageScene, this.director.camera)
      this.renderer.clearDepth()
      this.renderer.render(this.playScene, this.camera)
    }
  }

  /** Traduz o estado da sessão no clima que o diretor de câmera usa. */
  private mood(): ShotMood {
    const state = this.session.getState()
    if (state.rockMeter < 0.25) return 'failing'
    if (state.starPowerActive || state.streak >= 40) return 'peak'
    if (this.clock.now() < 0) return 'calm'
    return state.streak >= 8 ? 'driving' : 'calm'
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

  /**
   * Decai o tremor e o entrega ao palco.
   *
   * **A câmera da pista não se mexe, nunca.** Ela é posicionada uma vez, na
   * montagem, e nada no laço a toca. Antes ela pulsava na batida e tremia no
   * erro, o que contraria o motivo de existirem duas câmeras: a posição da
   * linha de batida na tela é a referência que o jogador usa para decidir
   * *quando* apertar, e movê-la — mesmo um centésimo, mesmo bonito — é mexer
   * na leitura de tempo bem no instante em que ela mais importa.
   *
   * O tremor não se perde: vai para a câmera do show, que pode sacudir à
   * vontade porque nenhuma decisão de tempo depende dela.
   */
  private updateCamera(dt: number) {
    this.shake *= Math.exp(-dt * 6)
    this.missFeedback *= Math.exp(-dt * 2.5)
    this.director.setShake(this.shake, this.missFeedback)
  }

  dispose() {
    this.stop()
    window.removeEventListener('resize', this.resize)
    this.highway.dispose()
    this.notes.dispose()
    this.effects.dispose()
    this.stage.dispose()
    this.environment?.dispose()
    this.composer?.dispose()
    this.renderer.dispose()
  }
}
