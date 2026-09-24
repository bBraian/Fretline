/**
 * O braço da guitarra: a superfície, as divisórias de traste, as linhas de
 * compasso que rolam com a música e os cinco botões na linha de batida.
 *
 * A superfície é um shader e não um material pronto porque as divisórias
 * precisam ficar nítidas em perspectiva extrema — uma textura de linha vira
 * papa no fundo da tela, mesmo com mipmap. O shader desenha as linhas em
 * espaço de UV, com espessura corrigida pela derivada, então elas têm a
 * mesma espessura aparente perto e longe.
 *
 * O padrão ornamental, esse sim, é textura: motivo desenhado em canvas,
 * repetido e rolando com o tempo da música. É o que dá movimento à pista
 * nos trechos sem nota na tela.
 */

import * as THREE from 'three'
import { FRET_COLORS } from '../engine/types'
import { createHighwayTexture } from './highwayTexture'
import {
  HIGHWAY_LENGTH,
  HIGHWAY_OVERSHOOT,
  HIGHWAY_WIDTH,
  HIGHWAY_Y,
  LANE_COUNT,
  laneX,
} from './layout'

/** Quantas linhas de compasso cabem na pista de uma vez. */
const MAX_BEAT_LINES = 48

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/**
 * As duas inclusões no fim não são decoração: um `ShaderMaterial` que escreve
 * `gl_FragColor` direto passa por cima do mapeamento de tom e da conversão
 * para o espaço de cor de saída, que o Three aplica sozinho nos materiais
 * prontos. Sem elas, as cores dos uniformes — que o Three já converteu para
 * espaço linear ao serem definidas — vão cruas para a tela e a pista sai
 * quase preta.
 *
 * As declarações dessas funções já vêm no prefixo que o Three monta para
 * todo `ShaderMaterial`; incluir os blocos `_pars_` aqui as declararia duas
 * vezes e o shader não compila.
 */
const FRAGMENT = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform vec3 uBase;
uniform vec3 uEdge;
uniform vec3 uStarPower;
uniform float uStarPowerMix;
uniform float uHitLine;
uniform float uFail;
uniform sampler2D uPattern;
uniform float uScroll;
uniform float uPatternRepeat;

/** Linha nítida em qualquer escala: espessura medida em pixels, não em UV. */
float crispLine(float coord, float center, float widthPx) {
  float d = abs(coord - center);
  float aa = fwidth(coord) * widthPx;
  return 1.0 - smoothstep(0.0, aa, d);
}

void main() {
  vec3 color = mix(uBase, uEdge, pow(abs(vUv.x - 0.5) * 2.0, 2.0));

  // Papel de parede rolando com a música.
  vec2 patternUv = vec2(vUv.x * 2.0, vUv.y * uPatternRepeat + uScroll);
  color += texture2D(uPattern, patternUv).rgb * 0.75;

  // Divisórias entre os cinco trastes.
  float lanes = 0.0;
  for (int i = 1; i < 5; i++) {
    lanes += crispLine(vUv.x, float(i) / 5.0, 1.0);
  }
  color += vec3(0.34, 0.40, 0.54) * lanes;

  // Trilhos das bordas, bem mais fortes que as divisórias internas: no
  // original é o que separa a pista do cenário atrás.
  float border = crispLine(vUv.x, 0.0, 2.2) + crispLine(vUv.x, 1.0, 2.2);
  vec3 railColor = mix(vec3(0.72, 0.80, 1.0), uStarPower * 2.2, uStarPowerMix);
  railColor = mix(railColor, vec3(1.6, 0.25, 0.25), uFail);
  color += railColor * border;

  // A pista escurece ao longe, o que dá profundidade sem névoa global. O
  // piso não pode cair a zero: é sobre ele que as notas distantes são lidas.
  float depth = smoothstep(0.0, 0.6, vUv.y);
  color *= mix(0.4, 1.0, depth);

  // Faixa de brilho logo antes da linha de batida.
  float approach = smoothstep(0.82, 1.0, vUv.y) * 0.5;
  color += vec3(0.24, 0.32, 0.55) * approach;

  // Star power e perigo tingem as bordas, não o meio. O meio é onde as
  // notas passam, e pintá-lo inteiro de azul apagava as notas azuis — e de
  // vermelho, as vermelhas — justo nos dois momentos em que o jogador mais
  // precisa ler a pista. O trilho acende forte; o miolo só escurece de tom.
  float rim = smoothstep(0.38, 0.5, abs(vUv.x - 0.5));
  color = mix(color, uStarPower, uStarPowerMix * mix(0.035, 0.7, rim));
  color = mix(color, vec3(0.5, 0.05, 0.05), uFail * mix(0.04, 0.65, rim));

  float line = crispLine(vUv.y, uHitLine, 1.8);
  color += vec3(0.95, 0.98, 1.0) * line;

  gl_FragColor = vec4(color, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export class Highway {
  readonly group = new THREE.Group()

  private material: THREE.ShaderMaterial
  private pattern: THREE.Texture
  private buttons: THREE.Mesh[] = []
  private buttonRings: THREE.Mesh[] = []
  private buttonMaterials: THREE.MeshStandardMaterial[] = []
  private pressed = 0

  private beatLines: THREE.InstancedMesh
  private beats: number[]
  private beatCursor = 0
  private dummy = new THREE.Object3D()
  private lineColor = new THREE.Color()

  constructor(beats: number[]) {
    this.beats = beats

    const totalLength = HIGHWAY_LENGTH + HIGHWAY_OVERSHOOT
    const geometry = new THREE.PlaneGeometry(HIGHWAY_WIDTH, totalLength, 1, 64)
    this.pattern = createHighwayTexture()

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uBase: { value: new THREE.Color(0x141a2c) },
        uEdge: { value: new THREE.Color(0x24314f) },
        uStarPower: { value: new THREE.Color(0x3d7dff) },
        uStarPowerMix: { value: 0 },
        // A linha de batida em UV: onde z = 0 cai dentro do plano.
        uHitLine: { value: HIGHWAY_LENGTH / totalLength },
        uFail: { value: 0 },
        uPattern: { value: this.pattern },
        uScroll: { value: 0 },
        // Repetições do motivo ao longo da pista; ajustado ao comprimento
        // para o padrão não esticar.
        uPatternRepeat: { value: totalLength / 6 },
      },
    })

    const surface = new THREE.Mesh(geometry, this.material)
    surface.rotation.x = -Math.PI / 2
    // O plano é desenhado centrado; deslocar põe a linha de batida em z = 0.
    surface.position.set(0, HIGHWAY_Y, -HIGHWAY_LENGTH / 2 + HIGHWAY_OVERSHOOT / 2)
    surface.renderOrder = 0
    this.group.add(surface)

    this.beatLines = this.buildBeatLines()
    this.buildButtons()
  }

  /**
   * Linhas de compasso que atravessam a pista e descem com as notas.
   *
   * São o metrônomo visual: sem elas não há como ver a velocidade da música
   * nem antecipar onde a próxima nota vai cair. A linha de início de
   * compasso é mais forte que as de batida, como no original.
   */
  private buildBeatLines() {
    const geometry = new THREE.PlaneGeometry(HIGHWAY_WIDTH, 1)
    geometry.rotateX(-Math.PI / 2)

    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })

    const mesh = new THREE.InstancedMesh(geometry, material, MAX_BEAT_LINES)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.count = 0
    mesh.renderOrder = 1
    const white = new THREE.Color(0xffffff)
    for (let i = 0; i < MAX_BEAT_LINES; i++) mesh.setColorAt(i, white)

    this.group.add(mesh)
    return mesh
  }

  /** Os cinco botões na linha de batida, que acendem ao pressionar. */
  private buildButtons() {
    // Anel externo escuro, disco colorido por dentro e um aro brilhante:
    // é o desenho dos botões do original, e o que o jogador procura na tela
    // quando está lendo a pista.
    const bodyGeometry = new THREE.CylinderGeometry(0.2, 0.22, 0.07, 28)
    const ringGeometry = new THREE.TorusGeometry(0.245, 0.032, 12, 36)
    const collarGeometry = new THREE.CylinderGeometry(0.28, 0.3, 0.05, 28)

    const collarMaterial = new THREE.MeshStandardMaterial({
      color: 0x14161f,
      roughness: 0.4,
      metalness: 0.6,
    })

    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const color = new THREE.Color(FRET_COLORS[lane])

      const collar = new THREE.Mesh(collarGeometry, collarMaterial)
      collar.position.set(laneX(lane), HIGHWAY_Y + 0.02, 0)
      this.group.add(collar)

      const material = new THREE.MeshStandardMaterial({
        color: color.clone().multiplyScalar(0.3),
        emissive: color,
        emissiveIntensity: 0.18,
        roughness: 0.3,
        metalness: 0.15,
      })
      const button = new THREE.Mesh(bodyGeometry, material)
      button.position.set(laneX(lane), HIGHWAY_Y + 0.045, 0)

      const ring = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.set(laneX(lane), HIGHWAY_Y + 0.045, 0)

      this.group.add(button, ring)
      this.buttons.push(button)
      this.buttonRings.push(ring)
      this.buttonMaterials.push(material)
    }
  }

  setPressed(mask: number) {
    this.pressed = mask
  }

  /**
   * Veste a pista com as cores da guitarra equipada.
   *
   * No original o braço acompanha o instrumento, e é o que faz a escolha da
   * loja valer também durante a música — antes a pista era sempre a mesma,
   * e trocar de guitarra só mudava o que a banda segurava ao fundo.
   *
   * A cor do corpo entra escurecida: a pista fica atrás das notas o tempo
   * todo, e um fundo claro apaga os cinco trastes, que é a única coisa que
   * o jogador precisa enxergar. O que se busca é a família da cor, não o
   * tom exato.
   */
  setGuitarTheme(body: number, hardware: number) {
    // Escurecer por multiplicação, e não por HSL.
    //
    // `setHSL` escreve em espaço linear e o resultado sai bem mais claro do
    // que o número sugere — uma guitarra branca virava uma pista cinza-clara
    // que apagava os cinco trastes. Multiplicar mantém a família da cor e é
    // previsível.
    const base = new THREE.Color(body).multiplyScalar(0.05)
    const edge = new THREE.Color(hardware).multiplyScalar(0.12)

    // Piso mínimo: uma guitarra preta não pode produzir uma pista invisível,
    // onde as linhas de compasso e as divisórias somem.
    const piso = new THREE.Color(0x101420)
    base.r = Math.max(base.r, piso.r)
    base.g = Math.max(base.g, piso.g)
    base.b = Math.max(base.b, piso.b)
    edge.r = Math.max(edge.r, piso.r * 1.6)
    edge.g = Math.max(edge.g, piso.g * 1.6)
    edge.b = Math.max(edge.b, piso.b * 1.6)

    ;(this.material.uniforms.uBase.value as THREE.Color).copy(base)
    ;(this.material.uniforms.uEdge.value as THREE.Color).copy(edge)
  }

  setStarPower(mix: number) {
    this.material.uniforms.uStarPowerMix.value = mix
  }

  /** Quanto o medidor está perto de zerar, de 0 a 1. */
  setDanger(amount: number) {
    this.material.uniforms.uFail.value = amount
  }

  update(dt: number, songTime: number, speed: number) {
    this.updateScroll(songTime, speed)
    this.updateBeatLines(songTime, speed)
    this.updateButtons(dt)
  }

  private updateScroll(songTime: number, speed: number) {
    const totalLength = HIGHWAY_LENGTH + HIGHWAY_OVERSHOOT
    // O padrão anda na mesma velocidade das notas: qualquer diferença
    // aparece como a pista escorregando por baixo delas.
    const repeats = this.material.uniforms.uPatternRepeat.value as number
    this.material.uniforms.uScroll.value = (-songTime * speed * repeats) / totalLength
  }

  private updateBeatLines(songTime: number, speed: number) {
    if (this.beats.length < 2) return

    const leadTime = HIGHWAY_LENGTH / speed
    const trailTime = HIGHWAY_OVERSHOOT / speed

    while (this.beatCursor > 0 && this.beats[this.beatCursor] > songTime - trailTime) {
      this.beatCursor--
    }
    while (
      this.beatCursor < this.beats.length - 1 &&
      this.beats[this.beatCursor] < songTime - trailTime
    ) {
      this.beatCursor++
    }

    let count = 0
    for (let i = this.beatCursor; i < this.beats.length && count < MAX_BEAT_LINES; i++) {
      const time = this.beats[i]
      if (time - songTime > leadTime) break

      // Começo de compasso a cada quatro batidas: linha mais larga e clara.
      const isBar = i % 4 === 0
      const z = -(time - songTime) * speed

      this.dummy.position.set(0, HIGHWAY_Y + 0.008, z)
      this.dummy.rotation.set(0, 0, 0)
      this.dummy.scale.set(1, 1, isBar ? 0.09 : 0.04)
      this.dummy.updateMatrix()

      this.beatLines.setMatrixAt(count, this.dummy.matrix)
      this.lineColor.setScalar(isBar ? 0.85 : 0.42)
      this.beatLines.setColorAt(count, this.lineColor)
      count++
    }

    this.beatLines.count = count
    this.beatLines.instanceMatrix.needsUpdate = true
    if (this.beatLines.instanceColor) this.beatLines.instanceColor.needsUpdate = true
  }

  private updateButtons(dt: number) {
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const down = (this.pressed & (1 << lane)) !== 0
      const material = this.buttonMaterials[lane]
      const targetEmissive = down ? 2.2 : 0.18
      const targetY = down ? HIGHWAY_Y + 0.016 : HIGHWAY_Y + 0.045

      // Interpolação exponencial: converge no mesmo tempo a qualquer FPS.
      const k = 1 - Math.exp(-dt * 26)
      material.emissiveIntensity += (targetEmissive - material.emissiveIntensity) * k
      this.buttons[lane].position.y += (targetY - this.buttons[lane].position.y) * k
      this.buttonRings[lane].position.y = this.buttons[lane].position.y

      const ring = this.buttonRings[lane].material as THREE.MeshBasicMaterial
      ring.opacity += ((down ? 1 : 0.7) - ring.opacity) * k
      const scale = down ? 1.16 : 1
      this.buttonRings[lane].scale.x += (scale - this.buttonRings[lane].scale.x) * k
      this.buttonRings[lane].scale.y = this.buttonRings[lane].scale.x
    }
  }

  dispose() {
    this.material.dispose()
    this.pattern.dispose()
    this.beatLines.geometry.dispose()
    ;(this.beatLines.material as THREE.Material).dispose()
    for (const material of this.buttonMaterials) material.dispose()
  }
}
