/**
 * O braço da guitarra: a superfície, as divisórias de traste, as linhas de
 * compasso e os cinco botões na linha de batida.
 *
 * A superfície é um shader e não uma textura porque as divisórias precisam
 * ficar nítidas em perspectiva extrema — uma textura repetida vira papa no
 * fundo da tela, mesmo com mipmap. O shader desenha as linhas em espaço de
 * UV, com espessura corrigida pela derivada, então elas têm a mesma
 * espessura aparente perto e longe.
 */

import * as THREE from 'three'
import { FRET_COLORS } from '../engine/types'
import {
  HIGHWAY_LENGTH,
  HIGHWAY_OVERSHOOT,
  HIGHWAY_WIDTH,
  HIGHWAY_Y,
  LANE_COUNT,
  laneX,
} from './layout'

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

/** Linha nítida em qualquer escala: espessura medida em pixels, não em UV. */
float crispLine(float coord, float center, float widthPx) {
  float d = abs(coord - center);
  float aa = fwidth(coord) * widthPx;
  return 1.0 - smoothstep(0.0, aa, d);
}

void main() {
  vec3 color = mix(uBase, uEdge, pow(abs(vUv.x - 0.5) * 2.0, 2.0));

  // Divisórias entre os cinco trastes.
  float lanes = 0.0;
  for (int i = 1; i < 5; i++) {
    lanes += crispLine(vUv.x, float(i) / 5.0, 1.0);
  }
  color += vec3(0.30, 0.34, 0.46) * lanes;

  // Bordas da pista, mais fortes que as divisórias internas.
  float border = crispLine(vUv.x, 0.0, 2.0) + crispLine(vUv.x, 1.0, 2.0);
  color += vec3(0.55, 0.62, 0.85) * border;

  // A pista escurece ao longe, o que dá profundidade sem névoa global. O
  // piso não pode cair a zero: é sobre ele que as notas distantes são lidas.
  float depth = smoothstep(0.0, 0.6, vUv.y);
  color *= mix(0.38, 1.0, depth);

  // Faixa de brilho logo antes da linha de batida.
  float approach = smoothstep(0.82, 1.0, vUv.y) * 0.5;
  color += vec3(0.24, 0.32, 0.55) * approach;

  color = mix(color, uStarPower, uStarPowerMix * (0.25 + 0.5 * depth));
  color = mix(color, vec3(0.45, 0.06, 0.06), uFail * 0.55);

  float line = crispLine(vUv.y, uHitLine, 1.6);
  color += vec3(0.9, 0.95, 1.0) * line * 0.8;

  gl_FragColor = vec4(color, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export class Highway {
  readonly group = new THREE.Group()

  private material: THREE.ShaderMaterial
  private buttons: THREE.Mesh[] = []
  private buttonRings: THREE.Mesh[] = []
  private buttonMaterials: THREE.MeshStandardMaterial[] = []
  private pressed = 0

  constructor() {
    const totalLength = HIGHWAY_LENGTH + HIGHWAY_OVERSHOOT
    const geometry = new THREE.PlaneGeometry(HIGHWAY_WIDTH, totalLength, 1, 64)

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uBase: { value: new THREE.Color(0x1a2138) },
        uEdge: { value: new THREE.Color(0x2b3a63) },
        uStarPower: { value: new THREE.Color(0x3d7dff) },
        uStarPowerMix: { value: 0 },
        // A linha de batida em UV: onde z = 0 cai dentro do plano.
        uHitLine: { value: HIGHWAY_LENGTH / totalLength },
        uFail: { value: 0 },
      },
    })

    const surface = new THREE.Mesh(geometry, this.material)
    surface.rotation.x = -Math.PI / 2
    // O plano é desenhado centrado; deslocar põe a linha de batida em z = 0.
    surface.position.set(0, HIGHWAY_Y, -HIGHWAY_LENGTH / 2 + HIGHWAY_OVERSHOOT / 2)
    surface.renderOrder = 0
    this.group.add(surface)

    this.buildButtons()
  }

  /** Os cinco botões na linha de batida, que acendem ao pressionar. */
  private buildButtons() {
    const bodyGeometry = new THREE.CylinderGeometry(0.2, 0.22, 0.07, 24)
    const ringGeometry = new THREE.TorusGeometry(0.235, 0.022, 10, 32)

    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const color = new THREE.Color(FRET_COLORS[lane])

      const material = new THREE.MeshStandardMaterial({
        color: color.clone().multiplyScalar(0.28),
        emissive: color,
        emissiveIntensity: 0.12,
        roughness: 0.35,
        metalness: 0.1,
      })
      const button = new THREE.Mesh(bodyGeometry, material)
      button.position.set(laneX(lane), HIGHWAY_Y + 0.035, 0)

      const ring = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.set(laneX(lane), HIGHWAY_Y + 0.02, 0)

      this.group.add(button, ring)
      this.buttons.push(button)
      this.buttonRings.push(ring)
      this.buttonMaterials.push(material)
    }
  }

  setPressed(mask: number) {
    this.pressed = mask
  }

  setStarPower(mix: number) {
    this.material.uniforms.uStarPowerMix.value = mix
  }

  /** Quanto o medidor está perto de zerar, de 0 a 1. */
  setDanger(amount: number) {
    this.material.uniforms.uFail.value = amount
  }

  update(dt: number) {
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const down = (this.pressed & (1 << lane)) !== 0
      const material = this.buttonMaterials[lane]
      const targetEmissive = down ? 1.6 : 0.12
      const targetY = down ? HIGHWAY_Y + 0.012 : HIGHWAY_Y + 0.035

      // Interpolação exponencial: converge no mesmo tempo a qualquer FPS.
      const k = 1 - Math.exp(-dt * 26)
      material.emissiveIntensity += (targetEmissive - material.emissiveIntensity) * k
      this.buttons[lane].position.y += (targetY - this.buttons[lane].position.y) * k

      const ring = this.buttonRings[lane].material as THREE.MeshBasicMaterial
      ring.opacity += ((down ? 1 : 0.55) - ring.opacity) * k
      const scale = down ? 1.18 : 1
      this.buttonRings[lane].scale.x += (scale - this.buttonRings[lane].scale.x) * k
      this.buttonRings[lane].scale.y = this.buttonRings[lane].scale.x
    }
  }

  dispose() {
    this.material.dispose()
    for (const material of this.buttonMaterials) material.dispose()
  }
}
