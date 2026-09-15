/**
 * Refletores com feixe visível e painel de LED do fundo.
 *
 * O feixe é um cone aditivo, não uma `SpotLight` com sombra. A diferença
 * importa: uma luz de verdade ilumina superfícies mas é invisível no ar, e
 * num show o que se vê é justamente o ar — o feixe cortando a fumaça. Cada
 * refletor aqui é um par: um cone que se vê e uma luz fraca que ilumina.
 *
 * O painel de LED é um shader, não um vídeo: precisa reagir à batida e
 * mudar de cor com o star power, e uma textura animada teria que ser gerada
 * do mesmo jeito, só que mais devagar.
 */

import * as THREE from 'three'

const BEAM_VERTEX = /* glsl */ `
varying float vDepth;
void main() {
  // O quanto o fragmento está longe da lente do refletor, de 0 a 1.
  vDepth = clamp(-position.y / 12.0, 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const BEAM_FRAGMENT = /* glsl */ `
precision highp float;
varying float vDepth;
uniform vec3 uColor;
uniform float uIntensity;

void main() {
  // O feixe some com a distância e é mais denso junto da lente.
  float falloff = pow(1.0 - vDepth, 1.6);
  gl_FragColor = vec4(uColor * (0.6 + falloff), falloff * uIntensity);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const WALL_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const WALL_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform float uBeat;
uniform float uEnergy;
uniform vec3 uColorA;
uniform vec3 uColorB;

/** Ruído barato, suficiente para quebrar a regularidade das faixas. */
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

void main() {
  // O painel é dividido em blocos, como um LED de verdade: o recorte
  // quadriculado é o que impede que isso vire um degradê qualquer.
  // Grade fina: com poucos blocos grandes o painel lê como xadrez, não
  // como tela.
  vec2 grid = vec2(96.0, 44.0);
  vec2 cell = floor(vUv * grid);
  vec2 inside = fract(vUv * grid);

  float bars = sin(cell.x * 0.22 - uTime * 2.2) * 0.5 + 0.5;
  float sweep = smoothstep(0.0, 0.4, sin(vUv.x * 6.2 + uTime * 1.1));
  float flicker = hash(cell + floor(uTime * 6.0)) * 0.25;

  float level = (bars * 0.55 + sweep * 0.3 + flicker);
  level *= 0.35 + uBeat * 0.65;
  level *= 0.4 + uEnergy * 0.8;

  vec3 color = mix(uColorA, uColorB, bars);

  // Vão escuro entre os blocos.
  float gap = step(0.14, inside.x) * step(0.16, inside.y);
  color *= level * gap * 1.1;

  gl_FragColor = vec4(color, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/**
 * Versão barata do painel, para a qualidade baixa: as mesmas cores e o mesmo
 * pulso, sem o ruído nem a grade por pixel — que é justamente a parte cara
 * num painel que ocupa meia tela.
 */
const SIMPLE_WALL_FRAGMENT = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform float uBeat;
uniform float uEnergy;
uniform vec3 uColorA;
uniform vec3 uColorB;

void main() {
  float bars = sin(vUv.x * 18.0 - uTime * 2.2) * 0.5 + 0.5;
  float level = (0.3 + bars * 0.5) * (0.35 + uBeat * 0.65) * (0.4 + uEnergy * 0.8);
  gl_FragColor = vec4(mix(uColorA, uColorB, bars) * level, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

interface Beam {
  group: THREE.Group
  light: THREE.PointLight | null
  material: THREE.ShaderMaterial
  baseColor: THREE.Color
  phase: number
  sweep: number
}

export class LightRig {
  readonly group = new THREE.Group()

  private beams: Beam[] = []
  private wallMaterial: THREE.ShaderMaterial
  private disposables: Array<{ dispose(): void }> = []
  private clock = 0
  private warm = new THREE.Color(0xff2f7d)
  private cool = new THREE.Color(0x9ec5ff)

  /**
   * `beams` liga os cones visíveis. Desligados, restam as luzes pontuais:
   * o palco continua iluminado e colorido, mas sem o custo de preenchimento
   * de sete cones transparentes cobrindo meia tela.
   */
  /**
   * `beams` liga os cones visíveis; `lights` diz quantos refletores têm luz
   * de verdade.
   *
   * O número de luzes importa muito mais do que parece: um material
   * iluminado avalia *todas* as luzes da cena a cada pixel, então sete
   * refletores mais a lavagem da plateia mais o preenchimento passam de uma
   * dúzia de avaliações por pixel. Metade dos refletores com luz real e a
   * outra metade só com o cone visível dá praticamente a mesma imagem pela
   * metade do custo.
   */
  constructor(
    private colors: number[],
    private options: { beams?: boolean; lights?: number; simpleWall?: boolean } = {},
  ) {
    this.wallMaterial = this.buildWall()
    this.buildBeams()
  }

  private track<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item)
    return item
  }

  private buildWall() {
    const material = this.track(
      new THREE.ShaderMaterial({
        vertexShader: WALL_VERTEX,
        fragmentShader: this.options.simpleWall ? SIMPLE_WALL_FRAGMENT : WALL_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uBeat: { value: 0 },
          uEnergy: { value: 0.5 },
          uColorA: { value: new THREE.Color(0x2b5cff) },
          uColorB: { value: new THREE.Color(0xff2f7d) },
        },
      }),
    )

    const wall = new THREE.Mesh(this.track(new THREE.PlaneGeometry(19, 7.5)), material)
    wall.position.set(0, 4.4, -5.6)
    this.group.add(wall)

    // Moldura escura em volta, para o painel não flutuar no vazio.
    const frame = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(20, 8.4, 0.3)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x0b0c11, roughness: 0.9 })),
    )
    frame.position.set(0, 4.4, -5.85)
    this.group.add(frame)

    return material
  }

  private buildBeams() {
    // Cone com o vértice na lente: em coordenadas locais o feixe desce em
    // -Y, o que deixa a rotação do refletor ser só uma inclinação.
    const geometry = this.track(new THREE.ConeGeometry(1.35, 12, 18, 1, true))
    geometry.translate(0, -6, 0)

    const count = this.colors.length
    for (let i = 0; i < count; i++) {
      const baseColor = new THREE.Color(this.colors[i])
      const material = this.track(
        new THREE.ShaderMaterial({
          vertexShader: BEAM_VERTEX,
          fragmentShader: BEAM_FRAGMENT,
          uniforms: {
            uColor: { value: baseColor.clone() },
            uIntensity: { value: 0.14 },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      )

      const group = new THREE.Group()
      group.position.set((i / (count - 1) - 0.5) * 15, 7.5, -3.2)

      if (this.options.beams !== false) group.add(new THREE.Mesh(geometry, material))

      // Corpo do refletor, para a treliça não parecer ter luz saindo do nada.
      const housing = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(0.18, 0.24, 0.42, 10)),
        this.track(
          new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.5, metalness: 0.7 }),
        ),
      )
      housing.position.y = 0.16
      group.add(housing)

      // Só alguns refletores carregam luz real, distribuídos pelo palco.
      const lightBudget = this.options.lights ?? 4
      const step = Math.max(1, Math.round(count / lightBudget))
      let light: THREE.PointLight | null = null
      if (i % step === 0) {
        light = new THREE.PointLight(baseColor, 8, 24, 2)
        light.position.set(0, -3.5, 0)
        group.add(light)
      }

      this.group.add(group)
      this.beams.push({ group, light, material, baseColor, phase: i * 1.21, sweep: 0.3 + (i % 3) * 0.12 })
    }
  }

  update(dt: number, beatPhase: number, energy: number, starPower: number) {
    this.clock += dt
    const pulse = 0.5 + 0.5 * Math.cos(beatPhase * Math.PI * 2)

    this.wallMaterial.uniforms.uTime.value = this.clock
    this.wallMaterial.uniforms.uBeat.value = pulse
    this.wallMaterial.uniforms.uEnergy.value = energy
    ;(this.wallMaterial.uniforms.uColorB.value as THREE.Color)
      .copy(this.warm)
      .lerp(this.cool, starPower)

    for (const beam of this.beams) {
      beam.phase += dt * (0.5 + energy * 0.7)

      // Cabeça móvel: varre em dois eixos com períodos diferentes, para o
      // conjunto nunca cair em uníssono.
      beam.group.rotation.z = Math.sin(beam.phase) * beam.sweep
      beam.group.rotation.x = Math.cos(beam.phase * 0.73) * beam.sweep * 0.6

      beam.material.uniforms.uIntensity.value =
        0.1 + pulse * 0.16 + energy * 0.08 + starPower * 0.14
      const color = beam.material.uniforms.uColor.value as THREE.Color
      color.copy(beam.baseColor).lerp(this.cool, starPower * 0.8)

      if (beam.light) {
        beam.light.intensity = 5 + pulse * 9 + energy * 5 + starPower * 10
        beam.light.color.copy(color)
      }
    }
  }

  dispose() {
    for (const item of this.disposables) item.dispose()
  }
}
