/**
 * O palco atrás do braço: banda, luzes, plateia e cenário.
 *
 * A cena fica deliberadamente barata. O braço é o que precisa de quadros
 * estáveis; tudo aqui existe para dar contexto e não pode disputar tempo de
 * GPU com ele. Por isso os holofotes são cones emissivos com uma luz pontual
 * fraca em vez de `SpotLight` com sombra, e a plateia inteira é um
 * `InstancedMesh` de caixas.
 */

import * as THREE from 'three'
import {
  CharacterModel,
  type PerformanceState,
} from './character/characterModel'
import { buildGuitar, type GuitarModel } from './guitar/guitarModel'
import { loadCharacterGlb } from './character/characterGlb'
import type { StageCharacter } from './character/stageCharacter'
import { loadBandMember, type BandRole } from './character/bandMember'
import { ATTACHMENTS, STAGE_PLACEMENT, attachmentFor } from './character/bandRig'
import { registerAttachment } from './character/rigPanel'
import { loadProp, STAGE_PROPS } from './props'
import { loadGuitarGlb } from './guitar/guitarGlb'
import { CHARACTERS, characterById, type Character } from '../content/characters'
import { BASS_PROP, guitarById, type Guitar } from '../content/guitars'
import { LightRig } from './stage/lightRig'
import {
  activeStageModel,
  loadStageModel,
  type LoadedStageModel,
  type StageModel,
} from './stage/stageModel'
import { refreshStagePanel, type StageControls } from './stage/stagePanel'

const CROWD_ROWS = 7
const CROWD_PER_ROW = 26
const CROWD_COUNT = CROWD_ROWS * CROWD_PER_ROW

/**
 * Meio da banda em z, para o encaixe automático do cenário.
 *
 * A banda vai de z = −4,35 (baterista) a z = +3,4 (cantor); é este ponto
 * que o estrado de um cenário de arquivo precisa ter debaixo.
 */
const BAND_CENTER_Z = -0.6

/** Direção do raio que procura o chão. */
const ABAIXO = new THREE.Vector3(0, -1, 0)

/**
 * Onde cada integrante pisa, em coordenadas do palco.
 *
 * Os mesmos números de `placeGuitarist` e `buildBandmates`, repetidos aqui
 * porque quem os usa é o ajuste de cenário — que precisa saber onde a banda
 * está antes de a banda existir, na montagem.
 */
const BAND_FEET: Array<[string, number, number]> = [
  ['guitarrista', -2.6, -0.6],
  ['baixista', 2.7, -0.9],
  ['cantor', -0.1, 3.4],
  ['baterista', 0, -4.35],
]

export class Stage {
  readonly group = new THREE.Group()

  private guitarist: StageCharacter
  private guitarModel: GuitarModel
  private bandmates: StageCharacter[] = []
  private rig: LightRig
  private haze: THREE.Mesh[] = []
  private crowdWash: THREE.PointLight[] = []
  private crowd: THREE.InstancedMesh
  private crowdSeeds: Float32Array
  private crowdDummy = new THREE.Object3D()
  private disposables: Array<{ dispose(): void }> = []
  /**
   * As três partes que um cenário de arquivo pode substituir.
   *
   * Ficam em grupos próprios, e não soltas no palco, por causa da troca ao
   * vivo: o painel liga e desliga cada uma enquanto se afina o encaixe, e
   * sem um nó por parte isso exigiria reconstruir o palco a cada clique.
   */
  private floorGroup = new THREE.Group()
  private backdropGroup = new THREE.Group()
  private ampsGroup = new THREE.Group()

  /**
   * O cenário de arquivo em uso, ou `null` quando é o construído em código.
   *
   * Não é `readonly` porque o painel de `?rig` troca de cenário sem
   * recarregar a página.
   */
  private stageModel: StageModel | null
  private scenery: LoadedStageModel | null = null
  /** Carregamento de cenário em voo, para o painel poder avisar. */
  private sceneryLoading = false
  /** Luzes de apoio do cenário atual, para sumirem junto com ele. */
  private sceneryFill: THREE.PointLight[] = []
  /**
   * Verdadeiro depois de `dispose`.
   *
   * Os adereços chegam de forma assíncrona, e a tela de jogo é desmontada de
   * verdade ao sair — sem esta marca, um arquivo que termina de carregar
   * depois da saída seria acrescentado a uma cena já descartada, e vazaria.
   */
  private destroyed = false

  /**
   * Carregamentos em andamento, para a tela de jogo poder esperar.
   *
   * O palco monta tudo de forma síncrona e depois troca cada peça pelo
   * arquivo quando ele chega. Isso mantém a cena sempre completa, mas
   * significa que entrar no palco no primeiro quadro mostra personagens sem
   * textura e instrumentos provisórios. Quem espera por estas promessas vê
   * o palco já pronto.
   */
  private pending: Array<Promise<unknown>> = []

  /** O que já chegou, para a tela de espera listar. */
  private loadingLabels = new Map<string, boolean>()

  /**
   * Registra um carregamento.
   *
   * Nunca rejeita para quem espera: uma peça que falha deixa o provisório no
   * lugar, e a música precisa começar de qualquer jeito.
   */
  private awaitAsset<T>(label: string, promise: Promise<T>): Promise<T> {
    if (!this.loadingLabels.has(label)) this.loadingLabels.set(label, false)
    this.pending.push(
      promise.then(
        () => void this.loadingLabels.set(label, true),
        () => void this.loadingLabels.set(label, true),
      ),
    )
    return promise
  }

  /** Espera tudo que foi registrado, inclusive o que nascer no caminho. */
  async ready() {
    // Um carregamento dispara outro — o personagem chega e só então a
    // guitarra dele é pendurada —, então espera até a fila parar de crescer.
    let antes = -1
    while (this.pending.length !== antes) {
      antes = this.pending.length
      await Promise.allSettled(this.pending)
    }
  }

  /** O que já chegou e o que falta, para a tela de espera. */
  get loadingProgress() {
    const itens = [...this.loadingLabels.entries()].map(([label, done]) => ({ label, done }))
    return { itens, done: itens.filter((i) => i.done).length, total: itens.length }
  }

  private clock = 0
  private starPower = 0
  /** Quanto a alavanca está puxada, de 0 a 1. */
  private whammy = 0
  private energy = 0.5
  private currentCharacterId: string
  private currentGuitarId: string

  constructor(
    characterId: string,
    guitarId: string,
    private options: { effects?: boolean; stageModel?: StageModel | null } = {},
  ) {
    this.currentCharacterId = characterId
    this.currentGuitarId = guitarId

    // O palco fica atrás do fim do braço e elevado: a banda precisa aparecer
    // acima do ponto de fuga da pista, senão fica escondida atrás dela.
    this.group.position.set(0, 1.45, -19.5)

    // O cenário pode vir de arquivo. Quando vem, ele substitui só o que é
    // lugar — piso, paredes, treliça, amplificadores. Tudo que se mexe na
    // batida continua sendo construído aqui embaixo.
    //
    // As três partes são construídas **sempre**, e o que o arquivo cobre é
    // apenas escondido: é o que torna a troca ao vivo instantânea e a volta
    // ao palco de código uma questão de tornar a ver.
    this.group.add(this.floorGroup, this.backdropGroup, this.ampsGroup)
    this.buildFloor()
    this.buildBackdrop()
    this.buildAmps()
    this.buildDrumKit()

    const effects = this.options.effects !== false
    this.rig = new LightRig(
      [0x4b7bff, 0xff3d7f, 0x3ddc84, 0xffb703, 0xb56bff, 0x00d4ff, 0xff6b35],
      { beams: effects, lights: effects ? 4 : 2, simpleWall: !effects },
    )
    this.group.add(this.rig.group)

    const scenery = options.stageModel === undefined ? activeStageModel() : options.stageModel
    this.stageModel = scenery
    if (scenery) this.buildSceneryModel(scenery)
    this.applyStageModel()

    this.buildAmbientLight()
    if (effects) this.buildHaze()

    const { crowd, seeds } = this.buildCrowd()
    this.crowd = crowd
    this.crowdSeeds = seeds

    this.guitarist = this.placeGuitarist(characterById(characterId))
    this.guitarModel = this.attachGuitar(guitarById(guitarId))
    this.buildBandmates()
  }

  // --- construção --------------------------------------------------------

  private track<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item)
    return item
  }

  private buildFloor() {
    const geometry = this.track(new THREE.BoxGeometry(22, 0.6, 12))
    // Piso liso e escuro: quase um espelho embaçado. É o que devolve a cor
    // dos refletores para dentro do quadro em vez de engolir tudo.
    const material = this.track(
      new THREE.MeshStandardMaterial({ color: 0x0e1016, roughness: 0.18, metalness: 0.55 }),
    )
    const floor = new THREE.Mesh(geometry, material)
    floor.position.set(0, -0.3, 0)
    floor.receiveShadow = true
    this.floorGroup.add(floor)

    // Borda luminosa: separa o palco da escuridão da plateia.
    const edge = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(22, 0.06, 0.1)),
      this.track(new THREE.MeshBasicMaterial({ color: 0x4b7bff })),
    )
    edge.position.set(0, 0.02, 6)
    this.floorGroup.add(edge)
  }

  /**
   * Põe o cenário de arquivo na cena.
   *
   * Entra pela mesma fila de espera dos outros arquivos, então a tela de
   * carregamento já o conta e a música só começa quando ele chegou. Falhar
   * aqui não interrompe nada: o palco fica sem o cenário — a banda, as
   * luzes e a plateia continuam de pé — e a música toca.
   */
  private buildSceneryModel(model: StageModel) {
    this.sceneryLoading = true
    void this.awaitAsset(
      'Cenário',
      loadStageModel(model)
        .then((scenery) => {
          // Duas condições, não uma: a tela pode ter saído, e o painel pode
          // ter pedido outro cenário enquanto este vinha. Nos dois casos o
          // que chegou é velho e vai embora sem entrar na cena.
          if (this.destroyed || this.stageModel !== model) {
            scenery.dispose()
            return
          }
          this.scenery = scenery
          this.group.add(scenery.group)

          for (const luz of model.fill) {
            const fill = new THREE.PointLight(luz.color, luz.intensity, luz.distance, 2)
            fill.position.set(...luz.position)
            this.group.add(fill)
            this.sceneryFill.push(fill)
          }
          this.applyStageModel()
        })
        .catch((erro) => console.error(`não deu para carregar ${model.url}`, erro))
        .finally(() => {
          if (this.stageModel !== model) return
          this.sceneryLoading = false
          refreshStagePanel()
        }),
    )
  }

  /**
   * Troca o cenário sem recarregar a página.
   *
   * Existe para o painel de `?rig`: afinar a escala de cinco arquivos
   * recarregando entre cada um é o que este painel veio evitar. Fora do
   * painel ninguém chama — o cenário do jogo é o da tabela.
   */
  async setStageModel(model: StageModel | null) {
    if (model === this.stageModel) return

    if (this.scenery) {
      this.group.remove(this.scenery.group)
      this.scenery.dispose()
      this.scenery = null
    }
    for (const luz of this.sceneryFill) this.group.remove(luz)
    this.sceneryFill = []

    this.stageModel = model
    this.sceneryLoading = model !== null
    this.applyStageModel()
    if (!model) return

    this.buildSceneryModel(model)
    await this.ready()
  }

  /**
   * Reaplica os números do cenário.
   *
   * Um lugar só para isso, chamado tanto na montagem quanto a cada arrasto
   * de controle do painel: a transformação do arquivo, o que ele esconde do
   * palco de código, o deslocamento dos refletores e onde a plateia fica.
   */
  applyStageModel() {
    const model = this.stageModel
    const replaces = model?.replaces ?? {}

    this.floorGroup.visible = !replaces.floor
    this.backdropGroup.visible = !replaces.backdrop
    this.ampsGroup.visible = !replaces.amps
    this.rig.setWallVisible(!replaces.ledWall)

    this.rig.group.position.set(...(model?.rigOffset ?? [0, 0, 0]))

    if (this.scenery && model) {
      this.scenery.group.scale.setScalar(model.scale)
      this.scenery.group.position.set(...model.position)
      this.scenery.group.rotation.set(...model.rotation)
      this.scenery.setEmissiveCap(model.emissiveCap)
    }
  }

  /**
   * Chuta uma transformação que põe o cenário na vizinhança certa.
   *
   * Um arquivo de banco público não traz convenção nenhuma: a origem pode
   * estar no chão, no centro ou num canto qualquer, e a escala vai de uma
   * maquete de 90 cm a uma sala de 180 m. Acertar isso arrastando três
   * controles às cegas é demorado, e enquanto o estrado não cruza y = 0 a
   * banda fica enterrada ou flutuando — sem nada na tela para mirar.
   *
   * O chute são três contas:
   *
   * - **escala** pela pegada horizontal, levando a maior das duas dimensões
   *   aos 22 do piso de código;
   * - **x e z** centrando a pegada no meio do palco;
   * - **y** por raio: de bem alto, sobre cada integrante, para baixo, e
   *   fica com a superfície virada para cima mais alta que ainda esteja na
   *   metade de baixo do modelo. É o estrado — o que está acima é treliça, e
   *   o que está abaixo é o fosso.
   *
   * É um ponto de partida para o painel, não um resultado: o que vale é o
   * que sair dos controles depois.
   */
  fitStageModel() {
    const model = this.stageModel
    if (!model || !this.scenery) return

    const root = this.scenery.group

    // Tudo aqui é medido em coordenadas **do palco**, não do mundo.
    //
    // `Box3.setFromObject` e o lançador de raios trabalham em coordenadas de
    // mundo, e o palco inteiro está deslocado — `group.position` é
    // (0, 1,45, −19,5). Medir no mundo e escrever em `model.position`, que é
    // local, soma esse deslocamento ao resultado e joga o cenário a vinte
    // metros de onde deveria.
    this.group.updateWorldMatrix(true, false)
    const paraLocal = this.group.matrixWorld.clone().invert()

    root.scale.setScalar(1)
    root.position.set(0, 0, 0)
    root.rotation.set(...model.rotation)
    root.updateWorldMatrix(true, true)

    const bruta = new THREE.Box3().setFromObject(root).applyMatrix4(paraLocal)
    const tamanho = bruta.getSize(new THREE.Vector3())

    // Escala pela pegada: a maior das duas dimensões horizontais vai aos 22
    // do piso construído em código.
    const escala = 22 / Math.max(tamanho.x, tamanho.z, 0.001)
    model.scale = escala
    model.position = [0, 0, 0]
    root.scale.setScalar(escala)
    root.position.set(0, 0, 0)
    root.updateWorldMatrix(true, true)

    const caixa = new THREE.Box3().setFromObject(root).applyMatrix4(paraLocal)
    const estrado = this.findDeck(root, caixa, paraLocal)
    if (!estrado) {
      // Sem nenhuma superfície plana virada para cima: assenta a base em
      // y = 0 e centra a pegada. É o melhor chute possível.
      const centro = caixa.getCenter(new THREE.Vector3())
      model.position = [-centro.x, -caixa.min.y, -centro.z]
      this.applyStageModel()
      this.scenery.group.updateWorldMatrix(false, true)
      return
    }

    // O estrado vai para debaixo da banda, não para o meio do modelo: o
    // meio de um clube é o fosso da plateia, e centrar por ele põe a banda
    // no chão, na frente do palco.
    model.position = [-estrado.x, -estrado.y, BAND_CENTER_Z - estrado.z]
    this.applyStageModel()
    this.scenery.group.updateWorldMatrix(false, true)
  }

  /**
   * Acha o estrado: o patamar mais alto que ainda ocupa parte séria da
   * pegada.
   *
   * Um mapa de alturas por amostragem, e não a caixa envolvente de cada
   * malha, porque um estrado costuma ser uma malha só junto com o piso do
   * fosso e as paredes — no clube, `Object_4` é as três coisas. O que
   * distingue o estrado é ser um plano horizontal alto e grande, e é isso
   * que se mede aqui.
   *
   * O limiar de área é o que impede o patamar errado de ganhar: o teto e a
   * treliça são mais altos, mas ralos; o fosso é maior, mas mais baixo.
   */
  private findDeck(root: THREE.Object3D, caixa: THREE.Box3, paraLocal: THREE.Matrix4) {
    const PASSOS = 24
    const raio = new THREE.Raycaster()
    const normal = new THREE.Vector3()
    const ponto = new THREE.Vector3()
    const matriz = new THREE.Matrix3()

    // Mesma razão do `footing`: o raio lê `matrixWorld`, e quem acabou de
    // mexer na escala precisa propagá-la antes de perguntar.
    root.updateWorldMatrix(false, true)

    const meio = (caixa.min.y + caixa.max.y) / 2
    const amostras: Array<{ x: number; y: number; z: number }> = []

    for (let i = 0; i < PASSOS; i++) {
      for (let j = 0; j < PASSOS; j++) {
        const x = THREE.MathUtils.lerp(caixa.min.x, caixa.max.x, (i + 0.5) / PASSOS)
        const z = THREE.MathUtils.lerp(caixa.min.z, caixa.max.z, (j + 0.5) / PASSOS)
        raio.set(this.group.localToWorld(new THREE.Vector3(x, caixa.max.y + 10, z)), ABAIXO)

        let melhor = -Infinity
        for (const hit of raio.intersectObject(root, true)) {
          if (!hit.face) continue
          normal
            .copy(hit.face.normal)
            .applyNormalMatrix(matriz.getNormalMatrix(hit.object.matrixWorld))
          if (normal.y < 0.7) continue
          const y = ponto.copy(hit.point).applyMatrix4(paraLocal).y
          if (y > meio) continue
          if (y > melhor) melhor = y
        }
        if (melhor > -Infinity) amostras.push({ x, y: melhor, z })
      }
    }

    if (!amostras.length) return null

    // Agrupa por altura com tolerância proporcional ao modelo: um degrau de
    // cinco centímetros numa sala de trinta metros é a mesma coisa que
    // nenhum.
    const tolerancia = Math.max(0.05, (caixa.max.y - caixa.min.y) / 40)
    const patamares = new Map<number, Array<{ x: number; y: number; z: number }>>()
    for (const a of amostras) {
      const chave = Math.round(a.y / tolerancia)
      const lista = patamares.get(chave)
      if (lista) lista.push(a)
      else patamares.set(chave, [a])
    }

    const minimo = amostras.length * 0.12
    let escolhido: Array<{ x: number; y: number; z: number }> | null = null
    for (const lista of patamares.values()) {
      if (lista.length < minimo) continue
      // O mais alto entre os que têm área: o fosso é maior, mas mais baixo.
      if (!escolhido || lista[0].y > escolhido[0].y) escolhido = lista
    }
    if (!escolhido) return null

    const media = (valores: number[]) => valores.reduce((a, b) => a + b, 0) / valores.length
    return {
      x: media(escolhido.map((a) => a.x)),
      y: media(escolhido.map((a) => a.y)),
      z: media(escolhido.map((a) => a.z)),
    }
  }

  /**
   * Quem tem chão debaixo dos pés, e a que altura.
   *
   * É a pergunta que uma captura de tela não responde — a câmera do cantor
   * mira o peito dele e os pés ficam fora do quadro — e é a que decide se o
   * encaixe está certo: um integrante sem estrado embaixo está flutuando
   * sobre o fosso, ainda que na tela pareça bem.
   *
   * Um raio para baixo em cada par de pés. `null` de resposta quer dizer
   * que não há nada ali; um número diferente de zero é o degrau entre a
   * sola e a superfície.
   */
  footing(): Array<{ nome: string; chao: number | null }> {
    if (!this.scenery) return []
    // O lançador de raios lê `matrixWorld` de cada malha e **não** as
    // atualiza — o three deixa isso a cargo de quem chama. Sem atualizar a
    // subárvore inteira, um raio lançado logo depois de mexer na
    // transformação testa o cenário na posição do quadro anterior, e a
    // resposta muda conforme o momento em que se pergunta.
    this.group.updateWorldMatrix(true, false)
    this.scenery.group.updateWorldMatrix(false, true)
    const paraLocal = this.group.matrixWorld.clone().invert()
    const raio = new THREE.Raycaster()
    const normal = new THREE.Vector3()
    const ponto = new THREE.Vector3()
    const matriz = new THREE.Matrix3()

    return BAND_FEET.map(([nome, x, z]) => {
      raio.set(this.group.localToWorld(new THREE.Vector3(x, 1e4, z)), ABAIXO)
      let melhor: number | null = null
      for (const hit of raio.intersectObject(this.scenery!.group, true)) {
        if (!hit.face) continue
        normal
          .copy(hit.face.normal)
          .applyNormalMatrix(matriz.getNormalMatrix(hit.object.matrixWorld))
        if (normal.y < 0.7) continue
        const y = ponto.copy(hit.point).applyMatrix4(paraLocal).y
        // A superfície mais alta que ainda está no nível dos pés ou abaixo:
        // o que está acima da cabeça é treliça, não chão.
        if (y > 1.2) continue
        if (melhor === null || y > melhor) melhor = y
      }
      return { nome, chao: melhor }
    })
  }

  /** Os ganchos que o painel de cenário usa. */
  stageControls(): StageControls {
    return {
      setStageModel: (model) => this.setStageModel(model),
      currentStageModel: () => this.stageModel,
      applyStageModel: () => this.applyStageModel(),
      fitStageModel: () => this.fitStageModel(),
      describeBounds: () => {
        if (!this.scenery) return null
        // Em coordenadas do palco, as mesmas dos controles: a medida crua
        // vem do mundo, onde tudo está vinte metros atrás e 1,45 acima, e
        // comparar esses números com os do painel confundiria mais do que
        // ajudaria.
        this.group.updateWorldMatrix(true, false)
        const b = this.scenery.measure().applyMatrix4(this.group.matrixWorld.clone().invert())
        const n = (v: number) => v.toFixed(2)
        return (
          `x ${n(b.min.x)} → ${n(b.max.x)}   y ${n(b.min.y)} → ${n(b.max.y)}   ` +
          `z ${n(b.min.z)} → ${n(b.max.z)}\n` +
          `a banda pisa em y = 0, de z = −4,95 (bateria) a z = +3,4 (cantor)`
        )
      },
      footing: () => this.footing(),
      isLoading: () => this.sceneryLoading,
    }
  }

  private buildBackdrop() {
    // Paredes laterais e teto escuros, para o palco ser um lugar fechado e
    // não um objeto flutuando no vazio.
    const shell = this.track(new THREE.MeshStandardMaterial({ color: 0x07080d, roughness: 1 }))
    for (const [x, rotation] of [
      [-11, Math.PI / 2],
      [11, -Math.PI / 2],
    ] as const) {
      const side = new THREE.Mesh(this.track(new THREE.PlaneGeometry(14, 14)), shell)
      side.position.set(x, 5, 0)
      side.rotation.y = rotation
      this.backdropGroup.add(side)
    }

    // Treliça de iluminação.
    const trussMaterial = this.track(
      new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.5, metalness: 0.7 }),
    )
    const beam = this.track(new THREE.BoxGeometry(20, 0.18, 0.18))
    for (const y of [7.4, 7.9]) {
      const bar = new THREE.Mesh(beam, trussMaterial)
      bar.position.set(0, y, -3)
      this.backdropGroup.add(bar)
    }
    const strut = this.track(new THREE.BoxGeometry(0.1, 0.62, 0.1))
    for (let i = -9; i <= 9; i += 1.5) {
      const post = new THREE.Mesh(strut, trussMaterial)
      post.position.set(i, 7.65, -3)
      this.backdropGroup.add(post)
    }
  }

  private buildAmps() {
    const cabinet = this.track(new THREE.BoxGeometry(1.5, 1.7, 0.9))
    const cabinetMaterial = this.track(
      new THREE.MeshStandardMaterial({ color: 0x17181d, roughness: 0.95 }),
    )
    const grille = this.track(
      new THREE.MeshStandardMaterial({ color: 0x2b2c33, roughness: 0.8 }),
    )
    const cone = this.track(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 14))

    for (const x of [-6.2, 6.2]) {
      for (let level = 0; level < 2; level++) {
        const amp = new THREE.Mesh(cabinet, cabinetMaterial)
        amp.position.set(x, 0.85 + level * 1.75, -4)
        this.ampsGroup.add(amp)

        for (const dx of [-0.36, 0.36]) {
          for (const dy of [-0.38, 0.38]) {
            const speaker = new THREE.Mesh(cone, grille)
            speaker.rotation.x = Math.PI / 2
            speaker.position.set(x + dx, 0.85 + level * 1.75 + dy, -3.54)
            this.ampsGroup.add(speaker)
          }
        }
      }
    }
  }

  private buildDrumKit() {
    const kit = new THREE.Group()
    kit.position.set(0, 0.5, -4.9)

    const shell = this.track(
      new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.4, metalness: 0.2 }),
    )
    // A pele do bumbo é bege, não branca: em branco puro ela vira um disco
    // estourado que rouba a atenção de tudo no plano.
    const skin = this.track(new THREE.MeshStandardMaterial({ color: 0xbfb6a4, roughness: 0.75 }))
    const metal = this.track(
      new THREE.MeshStandardMaterial({ color: 0xc9b037, roughness: 0.3, metalness: 0.9 }),
    )

    const bass = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.75, 0.75, 0.7, 20)), shell)
    bass.rotation.x = Math.PI / 2
    bass.position.set(0, 0.7, 0)
    kit.add(bass)

    const bassHead = new THREE.Mesh(this.track(new THREE.CircleGeometry(0.75, 20)), skin)
    bassHead.position.set(0, 0.7, 0.36)
    kit.add(bassHead)

    const tom = this.track(new THREE.CylinderGeometry(0.26, 0.26, 0.3, 16))
    for (const [x, y, z] of [
      [-0.45, 1.35, -0.2],
      [0.45, 1.35, -0.2],
      [-0.95, 0.75, 0.3],
    ] as const) {
      const drum = new THREE.Mesh(tom, shell)
      drum.position.set(x, y, z)
      kit.add(drum)
    }

    const snare = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16)),
      this.track(new THREE.MeshStandardMaterial({ color: 0xb8b8c0, roughness: 0.3, metalness: 0.8 })),
    )
    snare.position.set(-0.7, 0.95, 0.5)
    kit.add(snare)

    const cymbal = this.track(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 20))
    for (const [x, y, z, tilt] of [
      [-1.3, 1.7, 0.1, 0.22],
      [1.3, 1.65, 0.1, -0.22],
      [0.95, 1.2, 0.6, 0.1],
    ] as const) {
      const plate = new THREE.Mesh(cymbal, metal)
      plate.position.set(x, y, z)
      plate.rotation.z = tilt
      kit.add(plate)

      const stand = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.02, 0.02, y, 6)), metal)
      stand.position.set(x, y / 2, z)
      kit.add(stand)
    }

    this.group.add(kit)

    // Kit importado por cima do construído em código, que fica no lugar até
    // o arquivo chegar — o palco nunca aparece sem bateria.
    // O kit fica **à frente** do baterista, que senta em z = -4,1: a plateia
    // está em +z, então um kit mais ao fundo ficaria atrás de quem toca.
    void this.awaitAsset(
      'Bateria',
      loadProp({ url: STAGE_PROPS.drums, size: 1, anchor: 'bottom' }).then((prop) => {
        if (this.destroyed) {
          prop.dispose()
          return
        }
        this.group.remove(kit)
        this.group.add(prop.group)
        // `size: 1` deixa o kit com uma unidade de altura; o tamanho de
        // verdade é a escala da tabela, para o painel poder ajustá-lo.
        this.placeOnStage(prop.group, 'drumKit')
        this.disposables.push(prop)
      }),
    ).catch((erro) => console.error(`não deu para carregar ${STAGE_PROPS.drums}`, erro))
  }

  private buildAmbientLight() {
    // Luz de preenchimento fria e fraca: o palco precisa de um piso de
    // exposição para os refletores terem contra o que se destacar, mas alta
    // demais e o show vira um escritório iluminado.
    this.group.add(new THREE.HemisphereLight(0x4a5f96, 0x07080c, 0.45))

    const key = new THREE.DirectionalLight(0xdfe7ff, 0.9)
    key.position.set(3, 9, 10)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 30
    key.shadow.camera.left = -10
    key.shadow.camera.right = 10
    key.shadow.camera.top = 10
    key.shadow.camera.bottom = -6
    this.group.add(key)

    // Luz frontal dedicada à banda: os refletores vêm de cima e deixariam
    // rostos e instrumentos em silhueta.
    const front = new THREE.PointLight(0xfff0dc, 30, 18, 2)
    front.position.set(0, 2.8, 5)
    this.group.add(front)

    // Lavagem sobre a plateia. Sem ela o plano que olha para o público cai
    // no breu — a plateia fica fora do alcance de tudo que ilumina o palco,
    // e um plano inteiro do repertório do diretor vira tela preta.
    const washes = this.options.effects === false
      ? ([[0, 10, 0x8b5cf6]] as const)
      : ([
          [-6, 9, 0x3b6fd4],
          [0, 11, 0x8b5cf6],
          [6, 9, 0xd946a0],
        ] as const)

    for (const [x, z, color] of washes) {
      const wash = new THREE.PointLight(color, 26, 26, 2)
      wash.position.set(x, 5.5, z)
      this.group.add(wash)
      this.crowdWash.push(wash)
    }
  }

  /**
   * Fumaça: planos aditivos grandes e translúcidos, espalhados em
   * profundidade. É o que dá corpo aos feixes — um refletor sem fumaça
   * ilumina o chão e mais nada, e o palco fica com aquele ar de maquete.
   */
  private buildHaze() {
    const geometry = this.track(new THREE.PlaneGeometry(26, 11))
    for (let i = 0; i < 5; i++) {
      const material = this.track(
        new THREE.MeshBasicMaterial({
          color: 0x8fa8d8,
          transparent: true,
          opacity: 0.018,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      )
      const plane = new THREE.Mesh(geometry, material)
      plane.position.set(0, 3.4, -5 + i * 2.6)
      this.group.add(plane)
      this.haze.push(plane)
    }
  }

  private buildCrowd() {
    const geometry = this.track(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8))
    const material = this.track(new THREE.MeshStandardMaterial({ roughness: 0.95 }))
    const crowd = new THREE.InstancedMesh(geometry, material, CROWD_COUNT)
    crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    crowd.frustumCulled = false

    const seeds = new Float32Array(CROWD_COUNT * 3)
    const color = new THREE.Color()
    let i = 0

    const rows = this.options.effects === false ? 3 : CROWD_ROWS
    for (let row = 0; row < rows; row++) {
      for (let slot = 0; slot < CROWD_PER_ROW; slot++) {
        const x = (slot - (CROWD_PER_ROW - 1) / 2) * 0.82 + (Math.random() - 0.5) * 0.3
        const z = 6.5 + row * 1.15 + (Math.random() - 0.5) * 0.4
        // Vão no meio: é por ali que a pista atravessa até o palco. Sem isso
        // a plateia vira uma parede na frente das notas distantes.
        if (Math.abs(x) < 2.6) {
          seeds[i * 3] = Number.NaN
          i++
          continue
        }
        seeds[i * 3] = x
        seeds[i * 3 + 1] = z
        seeds[i * 3 + 2] = Math.random() * Math.PI * 2

        // A plateia é quase silhueta: escura, com variação pequena, para não
        // competir com o palco em atenção.
        color.setHSL(Math.random(), 0.18, 0.06 + Math.random() * 0.06)
        crowd.setColorAt(i, color)
        i++
      }
    }

    crowd.count = i
    this.group.add(crowd)

    // Telas de celular na plateia: pontinhos emissivos espalhados, que é o
    // que se vê de verdade de cima de um palco hoje em dia.
    const phoneGeometry = this.track(new THREE.PlaneGeometry(0.1, 0.16))
    const phoneMaterial = this.track(
      new THREE.MeshBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0.75 }),
    )
    const phones = new THREE.InstancedMesh(phoneGeometry, phoneMaterial, 40)
    phones.frustumCulled = false
    const dummy = new THREE.Object3D()
    for (let p = 0; p < 40; p++) {
      const source = Math.floor(Math.random() * CROWD_COUNT)
      const x = seeds[source * 3]
      dummy.position.set(Number.isNaN(x) ? 4 : x, 0.15 + Math.random() * 0.4, seeds[source * 3 + 1])
      dummy.rotation.set(-0.3, (Math.random() - 0.5) * 0.6, 0)
      dummy.updateMatrix()
      phones.setMatrixAt(p, dummy.matrix)
    }
    this.group.add(phones)

    return { crowd, seeds }
  }

  private placeGuitarist(character: Character): StageCharacter {
    const model = new CharacterModel(character)
    model.setRole('guitar')
    model.group.position.set(-2.6, 0, -0.6)
    model.group.rotation.y = 0.3
    this.group.add(model.group)
    if (character.model) void this.awaitAsset('Personagem', this.swapInImportedCharacter(character))
    return model
  }

  /**
   * Troca o guitarrista provisório pelo de arquivo, quando ele carrega.
   *
   * Mesma ideia da guitarra: a marionete construída em código entra na hora
   * e o importado a substitui, levando junto a guitarra que está pendurada
   * nela. O `id` é conferido na volta porque o jogador pode ter trocado de
   * personagem nesse meio-tempo.
   */
  private async swapInImportedCharacter(character: Character) {
    try {
      const imported = await loadCharacterGlb({
        url: character.model!,
        adjust: character.modelAdjust,
      })
      if (this.currentCharacterId !== character.id) {
        imported.dispose()
        return
      }
      const position = this.guitarist.group.position.clone()
      const rotation = this.guitarist.group.rotation.clone()

      // A guitarra sai do provisório e entra no importado antes do descarte:
      // ela é do jogador, não do corpo que a segura.
      this.guitarist.instrumentAnchor.remove(this.guitarModel.group)
      this.group.remove(this.guitarist.group)
      this.guitarist.dispose()

      imported.setRole('guitar')
      imported.group.position.copy(position)
      imported.group.rotation.copy(rotation)
      this.group.add(imported.group)
      imported.instrumentAnchor.add(this.guitarModel.group)
      this.guitarist = imported
    } catch (erro) {
      // Falhar aqui deixa a marionete no palco e a música segue.
      console.error(`não deu para carregar ${character.model}`, erro)
    }
  }

  private attachGuitar(guitar: Guitar): GuitarModel {
    // A construída em código entra na hora, mesmo quando a guitarra é de
    // arquivo: ela é o lugar-guardado enquanto o `.glb` chega. Esperar o
    // arquivo aqui atrasaria o início da música, e um guitarrista de mão
    // vazia no palco é pior que uma guitarra provisória.
    const model = buildGuitar(guitar)
    this.poseInstrument(model.group, 'guitar')
    this.guitarist.instrumentAnchor.add(model.group)
    if (guitar.model) void this.awaitAsset('Guitarra', this.swapInImported(guitar))
    return model
  }

  /**
   * Põe um instrumento no lugar, lendo a tabela de encaixes.
   *
   * Todos os números vêm de `character/bandRig.ts`, e só de lá: é o que
   * permite ajustá-los com o painel de `?rig` sem caçar valores espalhados
   * pelo código.
   */
  private poseInstrument(group: THREE.Object3D, chave: keyof typeof ATTACHMENTS) {
    // A guitarra é do protagonista, e cada corpo pendura a sua de um jeito:
    // por isso ela lê o ajuste do personagem equipado. Antes o palco usava a
    // tabela base direto, então afinar a guitarra na tela de personagens não
    // tinha efeito nenhum aqui — a mesma guitarra aparecia num ângulo na
    // loja e noutro no palco.
    //
    // Baixo e microfone ficam com integrantes fixos, que não têm ajuste
    // próprio; para eles a mescla devolve a base.
    const a = attachmentFor(chave, chave === 'guitar' ? this.currentCharacterId : null)
    const aplicar = () => {
      group.scale.setScalar(a.scale)
      group.position.set(...a.position)
      group.rotation.set(...a.rotation)
    }
    aplicar()
    registerAttachment(chave, a, group, aplicar)
  }

  /**
   * Troca a guitarra provisória pela do arquivo, quando ele termina de
   * carregar.
   *
   * O `id` é conferido na volta porque o jogador pode ter trocado de
   * guitarra nesse meio-tempo — sem isso, um carregamento lento aparece por
   * cima de uma escolha mais nova.
   */
  private async swapInImported(guitar: Guitar) {
    try {
      const imported = await loadGuitarGlb(guitar.model!, guitar, guitar.modelAdjust)
      if (this.currentGuitarId !== guitar.id) {
        imported.dispose()
        return
      }
      this.guitarist.instrumentAnchor.remove(this.guitarModel.group)
      this.guitarModel.dispose()
      this.poseInstrument(imported.group, 'guitar')
      this.guitarist.instrumentAnchor.add(imported.group)
      this.guitarModel = imported
    } catch (erro) {
      // Falhar aqui não tira o jogador da música: a provisória continua na
      // mão, e o show segue.
      console.error(`não deu para carregar ${guitar.model}`, erro)
    }
  }

  /**
   * Põe um objeto no lugar que a tabela de palco manda.
   *
   * Registrado no painel de `?rig`, então arrastar um controle move a
   * pessoa na hora — sem isso, acertar onde o baterista senta em relação à
   * bateria era tentativa e erro entre recarregamentos.
   */
  private placeOnStage(alvo: THREE.Object3D, chave: keyof typeof STAGE_PLACEMENT) {
    const a = STAGE_PLACEMENT[chave]
    const aplicar = () => {
      alvo.position.set(...a.position)
      alvo.rotation.set(...a.rotation)
      alvo.scale.setScalar(a.scale)
    }
    aplicar()
    registerAttachment(chave, a, alvo, aplicar)
  }

  /**
   * Troca um integrante de apoio pelo modelo fixo, com animação própria.
   *
   * Baixista, cantor e baterista **não são escolha do jogador** — só o
   * guitarrista é. Cada um vem de um arquivo que já traz corpo, esqueleto e
   * animação casados, o que dispensa adaptar clipe a esqueleto alheio.
   *
   * O que estiver pendurado no integrante provisório — baixo, microfone —
   * muda de dono junto: pertence ao papel, não ao corpo.
   */
  private swapInBandMember(slot: number, role: BandRole, chave: keyof typeof STAGE_PLACEMENT) {
    return loadBandMember(role)
      .then((membro) => {
        const antigo = this.bandmates[slot]
        if (this.destroyed || !antigo) {
          membro.dispose()
          return
        }
        this.placeOnStage(membro.group, chave)

        for (const filho of [...antigo.instrumentAnchor.children]) {
          membro.instrumentAnchor.add(filho)
        }
        // E o que estiver na mão — o microfone do cantor.
        //
        // Esta transferência foi retirada quando as baquetas construídas em
        // código davam problema; sem ela o microfone ficava no corpo
        // provisório e sumia junto com ele.
        //
        // Só o que não é corpo: na marionete a mão é o fim do braço, e a
        // palma e o polegar são filhos do mesmo nó. Levar tudo pendurava a
        // mão de pele do corpo descartado no cantor novo, longe do pulso dele.
        for (const filho of [...antigo.pickHand.children]) {
          if (!filho.userData.bodyPart) membro.pickHand.add(filho)
        }
        this.group.remove(antigo.group)
        antigo.dispose()
        this.group.add(membro.group)
        this.bandmates[slot] = membro
      })
      .catch((erro) => console.error(`não deu para carregar o ${role}`, erro))
  }

  private buildBandmates() {
    // Baixista, vocalista e baterista saem do elenco, evitando duplicar o
    // guitarrista. Cada um recebe o próprio papel: é o que separa uma banda
    // de quatro guitarristas em posições diferentes.
    // Quem tem modelo de arquivo **e** esqueleto vem primeiro: são os que
    // podem receber as animações de tocar, e há mais papéis no palco do que
    // modelos rigados. Os demais continuam marionetes, que já têm animação
    // própria feita à mão.
    const others = CHARACTERS.filter((c) => c.id !== this.currentCharacterId).sort(
      (a, b) => Number(!!b.model && b.animated !== false) - Number(!!a.model && a.animated !== false),
    )

    const bassist = new CharacterModel(others[0] ?? CHARACTERS[1])
    bassist.setRole('bass')
    bassist.group.position.set(2.7, 0, -0.9)
    bassist.group.rotation.y = -0.34
    // O baixo é sempre o modelo de arquivo, sem provisório.
    //
    // Guitarra e baixo seguiam o mesmo caminho — construir em código e
    // trocar quando o arquivo chegasse —, mas a guitarra é escolha do
    // jogador e o baixo não é. Desde que a entrada no palco passou a esperar
    // os arquivos, o provisório do baixo não chegava a ser visto por
    // ninguém: era só uma troca a mais e uma segunda aparência possível
    // para a mesma coisa.
    //
    // Um baixo é uma guitarra, então reaproveita a normalização dela; o
    // `scale` compensa o corpo e o braço maiores.
    void this.awaitAsset(
      'Baixo',
      loadGuitarGlb(STAGE_PROPS.bass, BASS_PROP, { scale: 1.15 }).then((imported) => {
        if (this.destroyed) {
          imported.dispose()
          return
        }
        this.poseInstrument(imported.group, 'bass')
        // Mesma razão do microfone: quem estiver no posto agora.
        ;(this.bandmates[0] ?? bassist).instrumentAnchor.add(imported.group)
        this.disposables.push(imported)
      }),
    ).catch((erro) => console.error(`não deu para carregar ${STAGE_PROPS.bass}`, erro))
    this.group.add(bassist.group)
    this.bandmates.push(bassist)
    void this.awaitAsset('Baixista', this.swapInBandMember(0, 'bass', 'bassist'))

    const singer = new CharacterModel(others[1] ?? CHARACTERS[2])
    singer.setRole('vocals')
    singer.group.position.set(-0.1, 0, 3.4)
    singer.group.rotation.y = 0.1
    this.group.add(singer.group)
    this.bandmates.push(singer)
    void this.awaitAsset('Vocalista', this.swapInBandMember(1, 'vocals', 'singer'))

    // Microfone na mão, não num pedestal à parte: assim ele acompanha o
    // gesto do braço em vez de ficar parado enquanto a mão se mexe.
    void this.awaitAsset(
      'Microfone',
      loadProp({ url: STAGE_PROPS.mic, size: 1, anchor: 'center' }).then((prop) => {
        if (this.destroyed) {
          prop.dispose()
          return
        }
        // A mão é consultada **agora**, não quando o carregamento começou.
        //
        // Guardar a referência de antemão pendurava o microfone na mão do
        // cantor provisório sempre que o modelo do cantor chegava primeiro —
        // e esse corpo era descartado logo depois, deixando o microfone
        // solto no ar. É a mesma corrida entre dois carregamentos que já
        // apareceu na tela de personagens.
        this.poseInstrument(prop.group, 'mic')
        this.bandmates[1]?.pickHand.add(prop.group)
        this.disposables.push(prop)
      }),
    ).catch((erro) => console.error(`não deu para carregar ${STAGE_PROPS.mic}`, erro))

    const drummer = new CharacterModel(others[2] ?? CHARACTERS[3])
    drummer.setRole('drums')
    drummer.group.position.set(0, 0.42, -4.1)
    this.group.add(drummer.group)
    this.bandmates.push(drummer)
    void this.awaitAsset('Baterista', this.swapInBandMember(2, 'drums', 'drummer'))

    // Sem banquinho construído em código: o kit importado traz o seu, e os
    // dois no mesmo lugar deixavam um cilindro claro solto atrás da banda.

    // Sem baquetas construídas em código: o baterista vem de arquivo e traz
    // as suas.
    //
    // As que havia aqui eram penduradas nas mãos do baterista provisório, e
    // a troca pelo modelo levava uma delas junto — era uma das formas
    // claras que apareciam flutuando ao lado da banda.
  }

  // --- troca de elenco ---------------------------------------------------

  setCharacter(characterId: string) {
    if (characterId === this.currentCharacterId) return
    this.currentCharacterId = characterId

    const position = this.guitarist.group.position.clone()
    const rotation = this.guitarist.group.rotation.clone()
    this.group.remove(this.guitarist.group)
    this.guitarist.dispose()

    const character = characterById(characterId)
    this.guitarist = new CharacterModel(character)
    this.guitarist.setRole('guitar')
    this.guitarist.group.position.copy(position)
    this.guitarist.group.rotation.copy(rotation)
    this.group.add(this.guitarist.group)
    if (character.model) void this.swapInImportedCharacter(character)

    // A guitarra está pendurada no personagem, então acompanha a troca.
    this.guitarModel.dispose()
    this.guitarModel = this.attachGuitar(guitarById(this.currentGuitarId))
  }

  setGuitar(guitarId: string) {
    if (guitarId === this.currentGuitarId) return
    this.currentGuitarId = guitarId
    this.guitarist.instrumentAnchor.remove(this.guitarModel.group)
    this.guitarModel.dispose()
    this.guitarModel = this.attachGuitar(guitarById(guitarId))
  }

  // --- animação ----------------------------------------------------------

  /** Liga e desliga partes do palco, para isolar custo em diagnóstico. */
  setPartVisible(part: 'band' | 'rig' | 'crowd', visible: boolean) {
    if (part === 'band') {
      this.guitarist.group.visible = visible
      for (const mate of this.bandmates) mate.group.visible = visible
    } else if (part === 'rig') {
      this.rig.group.visible = visible
    } else {
      this.crowd.visible = visible
    }
  }

  /**
   * Quanto a alavanca está puxada.
   *
   * O modelo da guitarra já sabia girar a alavanca desde que foi escrito,
   * mas ninguém lhe dizia o valor — `setWhammy` existia sem chamador, e por
   * isso a alavanca nunca se mexia na tela por mais que o jogador puxasse.
   */
  setWhammy(value: number) {
    this.whammy = Math.min(1, Math.max(0, value))
  }

  setPerformance(state: PerformanceState, intensity: number, starPower: number) {
    this.starPower = starPower
    this.energy = intensity
    this.guitarist.setState(state)
    this.guitarist.setIntensity(intensity)
    for (const mate of this.bandmates) {
      mate.setState(state === 'solo' ? 'playing' : state)
      mate.setIntensity(intensity * 0.8)
    }
  }

  update(dt: number, beatPhase: number) {
    this.clock += dt

    this.guitarist.update(dt, beatPhase)
    // Uma defasagem pequena entre os integrantes evita o efeito de marionetes
    // idênticas se mexendo em uníssono.
    this.bandmates.forEach((mate, i) => mate.update(dt, (beatPhase + i * 0.17) % 1))

    this.guitarModel.setGlow(this.starPower)
    this.guitarModel.setWhammy(this.whammy)
    this.rig.update(dt, beatPhase, this.energy, this.starPower)

    // A lavagem da plateia pulsa na batida, como os blinders de um show.
    const pulse = 0.5 + 0.5 * Math.cos(beatPhase * Math.PI * 2)
    for (let i = 0; i < this.crowdWash.length; i++) {
      this.crowdWash[i].intensity = 14 + pulse * 22 * (0.6 + this.energy * 0.6)
    }
    this.updateHaze(dt)
    this.updateCrowd(beatPhase)
  }

  /** A fumaça deriva devagar: parada, denuncia que é um plano. */
  private updateHaze(dt: number) {
    for (let i = 0; i < this.haze.length; i++) {
      const plane = this.haze[i]
      plane.position.x = Math.sin(this.clock * 0.08 + i) * 1.4
      plane.position.y = 3.4 + Math.sin(this.clock * 0.13 + i * 2) * 0.3
      const material = plane.material as THREE.MeshBasicMaterial
      material.opacity = 0.014 + this.starPower * 0.012 + this.energy * 0.008
    }
    void dt
  }

  private updateCrowd(beatPhase: number) {
    const bounce = Math.max(0, Math.sin(beatPhase * Math.PI * 2))

    for (let i = 0; i < CROWD_COUNT; i++) {
      const x = this.crowdSeeds[i * 3]
      const z = this.crowdSeeds[i * 3 + 1]
      const seed = this.crowdSeeds[i * 3 + 2]
      const jump = bounce * (0.12 + 0.1 * Math.sin(seed))

      if (Number.isNaN(x)) {
        // Instância reservada no vão central: fica com escala zero.
        this.crowdDummy.scale.setScalar(0)
        this.crowdDummy.position.set(0, -100, 0)
        this.crowdDummy.rotation.set(0, 0, 0)
        this.crowdDummy.updateMatrix()
        this.crowd.setMatrixAt(i, this.crowdDummy.matrix)
        continue
      }

      // A plateia fica no fosso, abaixo do nível do palco — e qual fosso
      // depende do cenário: o do código tem o seu, um arquivo tem outro, e
      // pode ter grade, que é o que o recuo em z evita atravessar.
      const crowd = this.stageModel?.crowd
      this.crowdDummy.position.set(x, (crowd?.y ?? -0.95) + jump, z + (crowd?.z ?? 0))
      this.crowdDummy.rotation.set(0, Math.sin(seed + this.clock * 0.4) * 0.3, 0)
      this.crowdDummy.scale.setScalar(0.9 + 0.2 * Math.sin(seed * 3))
      this.crowdDummy.updateMatrix()
      this.crowd.setMatrixAt(i, this.crowdDummy.matrix)
    }

    this.crowd.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.destroyed = true
    this.scenery?.dispose()
    this.guitarist.dispose()
    this.guitarModel.dispose()
    for (const mate of this.bandmates) mate.dispose()
    this.rig.dispose()
    for (const item of this.disposables) item.dispose()
    this.crowd.geometry.dispose()
  }
}
