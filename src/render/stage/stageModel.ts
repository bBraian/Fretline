/**
 * Cenário vindo de arquivo, no lugar do construído em código.
 *
 * O palco de `render/stage.ts` monta tudo com caixas e planos: piso,
 * paredes, treliça, caixas de som. Isso é barato e nunca falha, mas tem
 * teto — um clube de verdade tem geometria e textura que ninguém escreve à
 * mão. Este arquivo é a porta para trocar essa parte por um `.glb`, sem
 * tocar em banda, guitarra, câmera ou pista.
 *
 * ## O que entra e o que fica
 *
 * O arquivo substitui só o que é *lugar*: piso, paredes, treliça e
 * amplificadores — e quais dessas quatro coisas ele substitui é escolha
 * dele, em `replaces`. Bateria, integrantes, refletores, fumaça e plateia
 * continuam vindo do código, porque são coisas que se mexem na batida e o
 * arquivo é uma fotografia.
 *
 * ## Mexa aqui para ajustar
 *
 * Os números de cada entrada são a única coisa que decide onde o cenário
 * cai. Para achá-los sem adivinhar, abra o jogo com **`?rig`** na URL: um
 * painel no canto esquerdo troca de cenário na hora, tem um controle para
 * cada número e devolve o JSON pronto para colar aqui.
 *
 * ## Como voltar atrás
 *
 * `PADRAO` é o cenário escolhido; `null` ali devolve o palco de código
 * inteiro. Sem recompilar, `?stage=<id>` escolhe um da tabela e
 * `?stage=classic` volta ao de código — é assim que se comparam os dois no
 * mesmo build.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export interface StageModel {
  id: string
  label: string
  url: string

  /**
   * Escala uniforme.
   *
   * Arquivo de banco público vem na escala que o autor quis, e nenhum deles
   * combina com o palco do jogo por acaso. O que dita o número não é o
   * tamanho do modelo, é a banda: ela ocupa de z = −4,95 (fundo da bateria)
   * a z = +3,4 (cantor), oito metros e meio, e o estrado precisa cobrir
   * isso. A sala precisa ainda ser larga o bastante para o travelling
   * `dolly`, que vai de x = −9 a +9, não atravessar a parede.
   */
  scale: number

  /** Posição em coordenadas do palco; o topo do estrado precisa cair em y=0. */
  position: [number, number, number]
  rotation: [number, number, number]

  /**
   * O que o arquivo já traz, e que o código deve parar de construir.
   *
   * Nada aqui desliga a banda, a bateria ou a plateia: são peças animadas,
   * e o arquivo é uma fotografia.
   */
  replaces: {
    floor?: boolean
    backdrop?: boolean
    amps?: boolean
    /** O telão do conjunto de refletores, quando o arquivo traz o seu. */
    ledWall?: boolean
  }

  /**
   * Deslocamento do conjunto de refletores.
   *
   * Os refletores do código nascem pendurados na altura da treliça que o
   * código desenha. Com a treliça vindo do arquivo, eles precisam subir até
   * ela — senão ficam cilindros soltos no ar.
   */
  rigOffset: [number, number, number]

  /**
   * Onde a plateia fica, agora que o fosso é o do arquivo.
   *
   * `y` é o chão do fosso e `z` o quanto a plateia recua — o arquivo pode
   * ter grade, e gente na frente dela fica dentro do palco.
   */
  crowd: { y: number; z: number }

  /**
   * Teto para o `emissiveIntensity` dos materiais do arquivo.
   *
   * `KHR_materials_emissive_strength` deixa um telão pedir intensidade 10,
   * que num visualizador de fundo neutro fica bonito e aqui atravessa o
   * mapeamento de tons e o bloom como um retângulo branco. Cortar o valor
   * preserva a cor e devolve a leitura.
   */
  emissiveCap: number

  /**
   * Multiplica a cor base dos materiais do arquivo. Sem ele, 1.
   *
   * O irmão do `emissiveCap` para quem estoura sem brilhar: um cenário
   * branco sob os refletores passa do limiar do bloom (0,92, em
   * `gameScene.ts`) e vira névoa leitosa em cima da banda. Escurecer a cor
   * devolve a parede para baixo do limiar sem mexer na luz do palco, que é
   * a mesma para todos os cenários.
   */
  albedo?: number

  /**
   * Luz de apoio própria do cenário.
   *
   * Alguns arquivos têm cantos que as luzes do palco não alcançam, e um
   * arquivo de material sem brilho (`unlit`) não responde a luz nenhuma.
   */
  fill: Array<{ color: number; intensity: number; distance: number; position: [number, number, number] }>

  /**
   * Nós do arquivo que não entram na cena, pelo nome que têm no Blender.
   *
   * Um cenário de banco público vem montado para a banda de outra pessoa:
   * tablado de bateria, painel e praticável no lugar onde *aquela* banda
   * tocava. A nossa tem outra formação, e uma peça dessas no meio dela
   * enterra um pé ou esconde o baterista. Tirar aqui, e não no arquivo,
   * deixa o `.glb` como o autor o exportou e a lista à vista de quem ler a
   * tabela.
   */
  hide?: string[]
}

/**
 * Os cenários disponíveis.
 *
 * Os números de posição e escala saíram do **encaixe automático** do painel,
 * que mede a pegada do arquivo e procura o estrado por raio. São um ponto
 * de partida honesto — o cenário entra na vizinhança certa e com a banda
 * pisando em chão —, não um resultado afinado. O que vale é o que sair dos
 * controles depois; o botão «copiar JSON» devolve a entrada pronta.
 */
export const STAGE_MODELS: StageModel[] = [
  {
    id: 'club',
    label: 'Clube (8 MB · 52 mil tri · 51 desenhos)',
    url: '/models/stages/club_stage.glb',
    // Medidas do arquivo: estrado de x −4,2 a 4,2 com o topo em y = 0 e
    // fundo de z = 0,05 a 4,05; fosso em y = −0,8; grade em z = 7,05;
    // paredes laterais em x ±4,25; teto em y = 5,7; parede da frente em
    // z = 13,5.
    scale: 1.624,
    position: [0.085, 0, -5.133],
    rotation: [0, 0, 0],
    replaces: { floor: true, backdrop: true, amps: true },
    rigOffset: [0, 1.6, 0.8],
    crowd: { y: -1.76, z: 4.2 },
    emissiveCap: 2.2,
    fill: [],
  },
  // O palco de festival saiu da tabela: 70 MB, 1,45 milhão de triângulos e
  // 5013 chamadas de desenho — cada tubo do andaime é uma malha própria.
  // Era o mais bonito dos cinco e o único inviável por uma ordem de
  // grandeza; voltar exige mesclar por material na importação, não só
  // cadastrar de novo.
  {
    id: 'runway',
    label: 'Passarela (21 MB · 495 mil tri · 74 desenhos)',
    url: '/models/stages/runway_stage.glb',
    // Fica longe da origem — o centro medido é x = 68 — então a posição
    // começa puxando ele de volta para o meio do palco.
    scale: 0.12,
    position: [-5.711, -2.019, -0.464],
    rotation: [0, 0, 0],
    replaces: { floor: true, backdrop: true, amps: true },
    rigOffset: [0, 1.6, 0],
    crowd: { y: -0.1, z: 4 },
    emissiveCap: 2.2,
    fill: [],
  },
  {
    id: 'liveaid',
    label: 'Live Aid 1985 (14 MB · 223 mil tri · 1762 desenhos)',
    url: '/models/stages/palco_3.glb',
    // O diorama do Queen em Wembley, reeditado no Blender sem a moldura de
    // polaroide e sem a banda. As coordenadas continuam as do original:
    // estrado com o topo em y = 1, plano de z = −4,83 (parede do fundo) a
    // z = −2,0, onde desce um degrau para a beira.
    //
    // A escala é a do próprio modelo, não uma escolha: a plateia do arquivo
    // mede 0,6, e perto de 3,1 ela fica com a altura da banda. Por sorte é
    // também a que põe a banda inteira no estrado.
    //
    // Cada número da posição tem um motivo diferente:
    // - `x` é enquadramento, achado a olho no painel: o palco 1 m para a
    //   direita abre os bastidores à esquerda no plano geral;
    // - `y` fica perto de −escala, que é o que leva o topo do estrado (y = 1
    //   no arquivo) a y = 0. O estrado do arquivo é nivelado, então a
    //   rotação precisa ficar perto de zero: 0,04 já afundava a bateria
    //   13 cm e soltava o cantor;
    // - `z` tem uma janela de 9,87 a 10,75. Abaixo dela o cantor sai do
    //   estrado e fica 57 cm acima do degrau da beira; acima, o baterista
    //   entra na parede do fundo. Em 10,6 o palco fica o mais recuado que dá
    //   para a banda: o cantor com quase 1 m de estrado à frente, e a
    //   parede a 15 cm dos pés do baterista.
    scale: 3.127,
    position: [1.05, -3.1, 10.6],
    rotation: [-0.002, -0.002, -0.002],
    // O telão do código cairia atrás da parede do fundo do arquivo, que é
    // onde está o letreiro do Live Aid.
    replaces: { floor: true, backdrop: true, amps: true, ledWall: true },
    // A treliça baixa do arquivo fica a 8,3 m do estrado; os refletores
    // nascem a 7,5 e sobem até encostar nela.
    rigOffset: [0, 0.4, 0],
    // A plateia do arquivo pisa em y = 0 e começa em z = 0,7 — no jogo,
    // y = −3,13 e z = 12. A do código entra no mesmo fosso, junto dela.
    crowd: { y: -2.7, z: 5.6 },
    emissiveCap: 2.2,
    albedo: 0.6,
    fill: [],
    hide: [
      // O cubo inicial do Blender, que ficou na exportação: 6 m de caixa
      // cinza no meio do fosso.
      'Cube',
      // Painel de 13 x 3 m atravessando o palco, logo atrás de onde era a
      // bateria do Queen. A nossa fica mais para o fundo, e ele a esconderia.
      'Cube.002_769',
      // O tablado da bateria do Queen. Cai bem onde pisa o guitarrista, e os
      // pés dele sumiriam 12 cm dentro da madeira.
      'podium_143',
    ],
  },
  {
    id: 'starry',
    label: 'Estrelado (2 MB · 25 mil tri · unlit)',
    url: '/models/stages/starry_stage.glb',
    // Todos os materiais são `KHR_materials_unlit`: não respondem a luz
    // nenhuma. A luz de apoio aqui não serve para ele — serve para a banda
    // não ficar no escuro em cima dele.
    scale: 0.22,
    position: [0.01, -0.003, 0.039],
    rotation: [0, 0, 0],
    replaces: { floor: true, backdrop: true, amps: true },
    rigOffset: [0, 1.6, 0],
    crowd: { y: -0.4, z: 4 },
    emissiveCap: 2.2,
    fill: [{ color: 0xfff0dc, intensity: 22, distance: 16, position: [0, 3.2, 2] }],
  },
]

/** O cenário padrão. `null` devolve o palco construído em código. */
const PADRAO = 'club'

export function stageModelById(id: string | null): StageModel | null {
  return STAGE_MODELS.find((m) => m.id === id) ?? null
}

/**
 * Qual cenário usar.
 *
 * `?stage=classic` (ou qualquer id desconhecido) devolve `null`, que é o
 * palco de código — é o caminho de volta sem recompilar.
 */
export function activeStageModel(): StageModel | null {
  let escolhido = PADRAO
  if (typeof location !== 'undefined') {
    const pedido = new URLSearchParams(location.search).get('stage')
    if (pedido !== null) escolhido = pedido
  }
  return stageModelById(escolhido)
}

export interface LoadedStageModel {
  /** O nó que carrega a transformação; é nele que o painel mexe. */
  group: THREE.Group
  model: StageModel
  /** Caixa envolvente depois da transformação, para o painel mostrar. */
  measure(): THREE.Box3
  /** Reaplica o teto de emissivo sem perder o valor original do arquivo. */
  setEmissiveCap(cap: number): void
  dispose(): void
}

const loader = new GLTFLoader()

/**
 * Carrega o cenário e o deixa pronto para entrar no palco.
 *
 * Três coisas acontecem aqui, e só três: a transformação da tabela é
 * aplicada, os materiais emissivos são contidos e as superfícies passam a
 * receber sombra. Nada é mesclado nem simplificado — o arquivo vai para a
 * cena como veio, que é o que permite julgar o modelo, e não a nossa
 * preparação dele.
 */
export async function loadStageModel(model: StageModel): Promise<LoadedStageModel> {
  const gltf = await loader.loadAsync(model.url)
  const root = gltf.scene

  // Sai do grafo antes do primeiro quadro, então nunca chega à placa de vídeo
  // e não há o que descartar.
  //
  // A busca é pelo `userData.name`, onde o carregador guarda o nome como
  // veio do arquivo. O `name` ele limpa — tira os pontos, e `Cube.002` vira
  // `Cube002` — e ainda numera repetidos, então não bate com o Blender.
  const esconder = new Set(model.hide ?? [])
  const pecas: THREE.Object3D[] = []
  root.traverse((node) => {
    if (esconder.delete(node.userData.name)) pecas.push(node)
  })
  for (const peca of pecas) peca.removeFromParent()
  for (const nome of esconder) {
    console.warn(`cenário ${model.id}: o arquivo não tem "${nome}" para esconder`)
  }

  // A transformação fica no invólucro, não no nó do arquivo: assim o painel
  // mexe num objeto só e o que está dentro continua como veio.
  const group = new THREE.Group()
  group.add(root)
  group.scale.setScalar(model.scale)
  group.position.set(...model.position)
  group.rotation.set(...model.rotation)

  const materials = new Set<THREE.MeshStandardMaterial>()
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return

    // Só recebe sombra, não projeta.
    //
    // O cenário é imóvel e a luz que projeta sombra é uma só; o que precisa
    // aparecer no chão é a banda, que se mexe. Marcar as malhas paradas como
    // projetoras dobraria o passe de sombra para desenhar a sombra de uma
    // parede sobre ela mesma.
    mesh.castShadow = false
    mesh.receiveShadow = true

    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const standard = material as THREE.MeshStandardMaterial
      if (standard.emissiveIntensity === undefined) continue
      // O valor do arquivo é guardado na primeira vez: sem isso, arrastar o
      // controle duas vezes cortaria um valor já cortado e o telão só
      // escureceria.
      if (standard.userData.emissiveBase === undefined) {
        standard.userData.emissiveBase = standard.emissiveIntensity
      }
      materials.add(standard)
    }
  })

  const setEmissiveCap = (cap: number) => {
    for (const material of materials) {
      material.emissiveIntensity = Math.min(material.userData.emissiveBase as number, cap)
    }
  }
  setEmissiveCap(model.emissiveCap)

  // Uma vez só, e por material, não por malha: o arquivo divide o mesmo
  // material entre centenas de malhas, e multiplicar a cada uma escureceria
  // o palco até o preto. Cada carga traz materiais novos, então trocar de
  // cenário no painel e voltar não acumula.
  if (model.albedo !== undefined) {
    for (const material of materials) material.color.multiplyScalar(model.albedo)
  }

  return {
    group,
    model,
    measure: () => new THREE.Box3().setFromObject(group),
    setEmissiveCap,
    dispose() {
      root.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.geometry.dispose()
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose()
          }
          material.dispose()
        }
      })
    },
  }
}
