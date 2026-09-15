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

export interface PreviewOptions {
  canvas: HTMLCanvasElement
  /** Distância da câmera ao centro do prato. */
  distance?: number
  /** Altura da câmera. */
  height?: number
  /** Voltas por segundo do prato. */
  spin?: number
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

  private spin: number
  private dragging = false
  private pointerAngle = 0
  private lastPointerX = 0
  private clock = 0

  constructor(private options: PreviewOptions) {
    const { canvas } = options
    // `?still` trava o prato: a galeria de conferência precisa do mesmo
    // ângulo em todas as fotos para comparar silhuetas entre si.
    const still = new URLSearchParams(location.search).has('still')
    this.spin = still ? 0 : (options.spin ?? 0.12)

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
    this.scene.environmentIntensity = 0.65
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

    const rim = new THREE.DirectionalLight(0x8fb6ff, 2.6)
    rim.position.set(-3, 1.6, -3)
    this.scene.add(rim)

    const fill = new THREE.DirectionalLight(0xffffff, 0.5)
    fill.position.set(-1, -2, 2)
    this.scene.add(fill)

    canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)

    this.resize()
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
  }

  /** Centraliza e enquadra o objeto pelo seu tamanho real. */
  private frameObject(object: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(object)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())

    object.position.sub(center)

    const radius = Math.max(size.x, size.y, size.z) / 2
    const fov = (this.camera.fov * Math.PI) / 180
    const distance = this.options.distance ?? (radius / Math.sin(fov / 2)) * 0.88

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
    if (!this.dragging) this.pointerAngle += this.spin / 60
    this.turntable.rotation.y = this.pointerAngle
    this.renderer.render(this.scene, this.camera)
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
