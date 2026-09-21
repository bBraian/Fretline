/**
 * Prévia 3D para as telas de seleção.
 *
 * Um canvas WebGL só, compartilhado pela tela inteira, mostrando o modelo
 * selecionado num prato giratório. É uma decisão deliberada contra a
 * alternativa óbvia — um canvas por item na grade: o navegador limita o
 * número de contextos WebGL vivos (por volta de dezesseis), e passar do
 * limite faz os primeiros serem descartados, o que aparece como cartões que
 * ficam pretos ao rolar a lista.
 *
 * A iluminação vem de um mapa de ambiente gerado em memória a partir de uma
 * sala virtual. Sem ele, o metal das tarraxas e da ponte não teria o que
 * refletir e sairia cinza chapado, que é o que mais entrega modelo 3D
 * montado às pressas.
 */

import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** Duração da animação de entrada. Curta: ela acontece a cada troca de item. */
const ENTRY_SECONDS = 0.55

export interface PreviewOptions {
  canvas: HTMLCanvasElement
  /** Distância da câmera ao centro do prato. */
  distance?: number
  /** Folga em volta do objeto ao enquadrar; 1 encosta nas bordas. */
  fit?: number
  /** Altura da câmera. */
  height?: number
  /**
   * Como o modelo entra em cena quando é trocado.
   *
   * `dolly` traz o objeto de longe até parar no lugar — é o gesto para um
   * instrumento, que se aproxima para ser olhado. `step` adianta o objeto
   * um passo curto, com o peso caindo no fim, que é como alguém dá um passo
   * à frente. `none` aparece no lugar, sem animação.
   *
   * O prato **não gira sozinho** em nenhum dos casos: girar sem parar é
   * vitrine de loja, e impede olhar uma peça de um ângulo escolhido.
   * Arrastar continua girando.
   */
  entry?: 'dolly' | 'step' | 'none' 
  /** Cor de fundo; transparente por padrão. */
  background?: number | null
}

export class ModelPreview {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private turntable = new THREE.Group()
  private environment: THREE.Texture

  private current: THREE.Object3D | null = null
  private disposeCurrent: (() => void) | null = null

  private entry: 'dolly' | 'step' | 'none'
  /** Segundos decorridos da animação de entrada; passado da duração, parou. */
  private entryTime = Infinity
  private lastEntryTick = 0
  private entryFrom = new THREE.Vector3()
  private entryTo = new THREE.Vector3()
  private dragging = false
  private pointerAngle = 0
  private lastPointerX = 0
  private clock = 0

  constructor(private options: PreviewOptions) {
    const { canvas } = options
    // `?still` corta a animação de entrada: a galeria de conferência precisa
    // do mesmo enquadramento em todas as fotos para comparar silhuetas.
    const still = new URLSearchParams(location.search).has('still')
    this.entry = still ? 'none' : (options.entry ?? 'dolly')

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: options.background == null,
      powerPreference: 'low-power',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    if (options.background != null) this.scene.background = new THREE.Color(options.background)

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environment = this.environment
    this.scene.environmentIntensity = 0.95
    pmrem.dispose()

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40)
    this.scene.add(this.turntable)

    // Três luzes clássicas: principal quente na frente, contraluz fria atrás
    // para recortar a silhueta, e preenchimento fraco embaixo.
    const key = new THREE.DirectionalLight(0xfff4e2, 2.4)
    key.position.set(2.5, 3.5, 3)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 0.5
    key.shadow.camera.far = 14
    this.scene.add(key)

    // Duas contraluzes, uma de cada lado. Um corpo preto e brilhante só
    // aparece pelo que reflete: com uma luz frontal apenas, ele vira um
    // buraco no meio do visor.
    const rim = new THREE.DirectionalLight(0x8fb6ff, 3.4)
    rim.position.set(-3, 1.6, -3)
    this.scene.add(rim)

    const rimWarm = new THREE.DirectionalLight(0xffd9a8, 2.2)
    rimWarm.position.set(3.2, 0.8, -2.6)
    this.scene.add(rimWarm)

    const fill = new THREE.DirectionalLight(0xffffff, 0.5)
    fill.position.set(-1, -2, 2)
    this.scene.add(fill)

    canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)

    this.resize()
    // Mesmo gancho de depuração do PlayScreen: com `?debug`, a prévia fica
    // acessível para a conferência automatizada, que precisa amostrar a
    // animação de entrada mais rápido do que uma captura de tela consegue.
    if (new URLSearchParams(location.search).has('debug')) {
      ;(window as unknown as { __preview?: unknown }).__preview = this
    }

    this.renderer.setAnimationLoop(this.frame)
  }

  /**
   * Troca o modelo em exibição. Recebe também o descarte, porque quem monta
   * o modelo é quem sabe quais geometrias e materiais ele criou.
   */
  setModel(object: THREE.Object3D, dispose: () => void, frame = true) {
    this.clear()
    this.current = object
    this.disposeCurrent = dispose
    this.turntable.add(object)
    if (frame) this.frameObject(object)
    this.startEntry(object)
  }

  /**
   * Prepara a animação de entrada a partir da pose final, que o
   * enquadramento acabou de definir.
   *
   * O recuo é uma fração da distância da câmera, e não do tamanho do objeto.
   * Pela caixa do objeto seria mais óbvio, mas a profundidade de uma
   * guitarra é a espessura do corpo — alguns centímetros —, e um recuo
   * proporcional a isso não aparece na tela. Medir contra a câmera dá o
   * mesmo deslocamento aparente para uma guitarra fina e para um
   * personagem inteiro.
   */
  private startEntry(object: THREE.Object3D) {
    this.entryTo.copy(object.position)
    if (this.entry === 'none') {
      this.entryTime = Infinity
      return
    }
    const distance = this.camera.position.z
    const back = distance * (this.entry === 'dolly' ? 0.55 : 0.16)
    this.entryFrom.copy(this.entryTo).setZ(this.entryTo.z - back)
    object.position.copy(this.entryFrom)
    this.entryTime = 0
    this.lastEntryTick = performance.now()
  }

  /** Onde o modelo está agora, para conferência. */
  get modelZ() {
    return this.current?.position.z ?? NaN
  }

  /** Caixa do modelo em exibição, para conferir normalização de importados. */
  get modelBounds() {
    if (!this.current) return null
    const size = new THREE.Box3().setFromObject(this.current).getSize(new THREE.Vector3())
    return { x: +size.x.toFixed(2), y: +size.y.toFixed(2), z: +size.z.toFixed(2) }
  }

  /** Centraliza e enquadra o objeto pelo seu tamanho real. */
  private frameObject(object: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(object)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())

    object.position.sub(center)

    const radius = Math.max(size.x, size.y, size.z) / 2
    const fov = (this.camera.fov * Math.PI) / 180
    const distance = this.options.distance ?? (radius / Math.sin(fov / 2)) * (this.options.fit ?? 0.88)

    this.camera.position.set(0, this.options.height ?? size.y * 0.1, distance)
    this.camera.lookAt(0, 0, 0)
    this.camera.near = Math.max(0.05, distance - radius * 3)
    this.camera.far = distance + radius * 6
    this.camera.updateProjectionMatrix()
  }

  private clear() {
    if (this.current) this.turntable.remove(this.current)
    this.disposeCurrent?.()
    this.current = null
    this.disposeCurrent = null
  }

  private onPointerDown = (event: PointerEvent) => {
    this.dragging = true
    this.lastPointerX = event.clientX
  }

  private onPointerMove = (event: PointerEvent) => {
    if (!this.dragging) return
    // Arrastar gira o prato; é o mínimo para alguém conseguir olhar o outro
    // lado de uma guitarra antes de comprar.
    this.pointerAngle += (event.clientX - this.lastPointerX) * 0.01
    this.lastPointerX = event.clientX
  }

  private onPointerUp = () => {
    this.dragging = false
  }

  resize() {
    const canvas = this.renderer.domElement
    const width = canvas.clientWidth || 1
    const height = canvas.clientHeight || 1
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private frame = () => {
    this.resize()
    this.clock += 1 / 60
    this.advanceEntry()
    this.turntable.rotation.y = this.pointerAngle
    this.renderer.render(this.scene, this.camera)
  }

  /**
   * Avança a animação de entrada, se houver uma em curso.
   *
   * A curva é um `easeOutCubic`: quase toda a distância é vencida no começo
   * e o fim é uma parada macia. O contrário — acelerar até o fim — faria o
   * objeto bater no lugar.
   */
  private advanceEntry() {
    if (!this.current || this.entryTime >= ENTRY_SECONDS) return
    // Tempo de relógio, e não um passo fixo de 1/60: a animação tem começo e
    // fim, e contar quadros faria ela durar o triplo numa máquina que
    // desenha a 20 quadros por segundo.
    const now = performance.now()
    this.entryTime += (now - this.lastEntryTick) / 1000
    this.lastEntryTick = now
    const t = Math.min(1, this.entryTime / ENTRY_SECONDS)
    const eased = 1 - Math.pow(1 - t, 3)
    this.current.position.lerpVectors(this.entryFrom, this.entryTo, eased)
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    this.clear()
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    this.environment.dispose()
    this.renderer.dispose()
  }
}
