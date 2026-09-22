/**
 * Onde cada instrumento fica preso no corpo de quem o toca.
 *
 * ## Mexa aqui para ajustar
 *
 * Estes números são a única coisa que decide a posição do microfone na mão
 * do cantor, do baixo no baixista e da guitarra no guitarrista. Editar um
 * valor e salvar já muda o palco — não há nada escondido em outro arquivo.
 *
 * Para achar os valores sem adivinhar, abra o jogo com **`?rig`** na URL.
 * Um painel aparece no canto com um controle para cada número abaixo; mexa
 * até ficar bom e clique em **copiar**, que ele devolve o bloco pronto para
 * colar aqui.
 *
 * - `bone`  — em que osso o instrumento pendura. `hips` para o que apoia no
 *   corpo (guitarra, baixo), a mão para o que é segurado (microfone).
 * - `position` — deslocamento a partir do osso, em metros.
 * - `rotation` — giro em radianos, na ordem X, Y, Z.
 * - `scale` — tamanho do instrumento.
 *
 * As posições são aplicadas **com a pose de repouso do osso desfeita**, o
 * que quer dizer que `position: [0, 0, 0]` põe o instrumento no osso, com os
 * eixos do palco: +X à direita, +Y para cima, +Z para a plateia. Sem isso,
 * cada modelo responderia de um jeito ao mesmo número, porque cada
 * ferramenta orienta os ossos como quer.
 */

export interface Attachment {
  /** Osso onde pendura; o nome casa por letras, sem sufixos. */
  bone: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: number
}

/**
 * Valores base, válidos para todo mundo.
 *
 * A altura já é resolvida sozinha — o encaixe é trazido para a cintura de
 * cada corpo —, então o que sobra aqui costuma servir a todos. O que não
 * serve vai nos ajustes por personagem, logo abaixo.
 */
export const ATTACHMENTS: Record<string, Attachment> = {
  /** Guitarra do protagonista, pendurada na cintura. */
  guitar: {
    bone: 'Hips',
    position: [0.04, -0.02, 0.18],
    rotation: [-0.1, 0.22, -1.02],
    scale: 0.36,
  },

  /** Baixo, um pouco maior e mais baixo que a guitarra. */
  bass: {
    bone: 'Hips',
    position: [-0.12, 0.15, 0.31],
    rotation: [0.078, -0.022, -0.982],
    scale: 0.42,
  },

  /** Microfone: vai na mão, não na cintura. */
  mic: {
    bone: 'RightHand',
    position: [-0.795, -0.15, 0.015],
    rotation: [1.678, 2.638, -0.602],
    scale: 0.2,
  },
}

/**
 * Onde cada um fica no palco.
 *
 * Mesma forma dos encaixes, e o painel de `?rig` os edita do mesmo jeito —
 * mas aqui `position` é o lugar no palco, e não um deslocamento a partir de
 * um osso. `bone` fica em `palco` para deixar isso claro na tela.
 *
 * Eixos: **+X à direita**, **+Y para cima**, **+Z na direção da plateia**. O
 * guitarrista fica à esquerda, o baixista à direita, o cantor à frente e a
 * bateria ao fundo.
 *
 * `rotation` usa só o eixo Y na prática — é para que lado a pessoa olha.
 * `scale` multiplica o tamanho do integrante, que por padrão é normalizado
 * para 1,78m.
 */
export const STAGE_PLACEMENT: Record<string, Attachment> = {
  drummer: {
    bone: 'palco',
    position: [-0.04, 0.205, -4.35],
    rotation: [0.198, -0.362, -0.022],
    scale: 0.97,
  },
  drumKit: {
    bone: 'palco',
    position: [0, 0, -3.5],
    rotation: [0, 0, 0],
    scale: 2.9,
  },
  bassist: {
    bone: 'palco',
    position: [2.7, 0, -0.9],
    rotation: [0, -0.34, 0],
    scale: 1,
  },
  singer: {
    bone: 'palco',
    position: [-0.1, 0, 3.4],
    rotation: [0, 0.1, 0],
    scale: 1,
  },
}

/**
 * Ajustes por personagem, somados aos valores acima.
 *
 * **Varia mesmo?** Varia, e por um motivo só: o giro. A altura já é
 * normalizada pela cintura de cada corpo, e o tamanho da guitarra é fixo em
 * `ATTACHMENTS` — mas a orientação em que cada esqueleto deixa o quadril
 * muda de ferramenta para ferramenta, e é isso que faz a mesma rotação cair
 * num ângulo diferente em cada personagem.
 *
 * Por **guitarra** não precisa variar: todas são normalizadas para o mesmo
 * comprimento, mesmo eixo e mesma face. Se uma ficar torta, é sinal de que a
 * normalização dela errou, e o lugar de consertar é `modelAdjust` em
 * `content/guitars.ts`, não aqui.
 *
 * A chave é o `id` do personagem (`glb-kratos`, `glb-dead_pool`, …). Um
 * personagem sem entrada usa os valores base.
 */
export const CHARACTER_ADJUSTMENTS: Record<string, Partial<Attachment>> = {
  'glb-kratos': {
    position: [-0.05, 0.07, -0.19],
    rotation: [0.258, 2.938, -1.342],
    scale: 0.38,
  },
  'glb-dead_pool': {
    position: [-0.07, 0.04, 0.175],
    rotation: [-0.1, -0.302, -1.222],
    scale: 0.36,
  },
  /**
   * ## Os quatro abaixo não foram achados no painel: foram medidos
   *
   * Depois que a animação passou a pôr as mãos no mesmo lugar em todos os
   * corpos (ver `render/character/animationClips.ts`), dava para parar de
   * procurar estes números arrastando controle: eles saem de onde as mãos
   * caem.
   *
   * O passo a passo está em **`docs/specs/personagem-novo.md`**, e é o que
   * se repete a cada integrante que entra. Em resumo: toca-se o clipe, tira-se
   * a média das duas mãos no referencial do encaixe, e a `position` sai daí
   * mais o braço até a origem da guitarra — braço que é constante **no espaço
   * da guitarra**, não no do encaixe. A `rotation` sai de um referencial de
   * três eixos: o braço da guitarra corre entre as duas mãos, e o para-frente
   * do corpo resolve o giro em torno dele.
   *
   * A conta foi conferida contra o Kairos, cujos valores já tinham sido
   * achados à mão: ela chega a 16 graus e 11 cm deles sem nunca tê-los visto.
   * É a margem em que dois ajustes bons discordam.
   */
  'glb-douxie_tales_of_arcadia': {
    position: [0.007, -0.089, 0.171],
    rotation: [-0.043, -0.217, -1.137],
    scale: 0.36,
  },
  'glb-fortnite_darth_vader_advanced_rig': {
    position: [0.007, -0.117, 0.125],
    rotation: [0.057, -0.206, -1.143],
    scale: 0.36,
  },
  'glb-spiderman_brand_new_day_from_fortnite': {
    position: [-0.001, -0.055, 0.183],
    rotation: [-0.072, -0.205, -1.179],
    scale: 0.36,
  },
  // Rig do esqueleto do Unreal, o mesmo do Teixeira — e os números saem
  // parecidos, o que é o sinal de que a família foi reconhecida certo.
  'glb-lara_croft_-_shorts_style': {
    position: [0.008, -0.022, 0.236],
    rotation: [-0.085, -0.184, -1.151],
    scale: 0.36,
  },
  // Biped da Valve, o do Source: é o primeiro do elenco nessa família.
  'glb-soldier_boy': {
    position: [-0.005, -0.007, 0.077],
    rotation: [-0.082, -0.198, -1.184],
    scale: 0.36,
  },
  // O Gokê é o único rig Biped do 3ds Max do elenco. Estes números são bem
  // parecidos com os dos vizinhos, e isso é o sinal de que o braço dele foi
  // mapeado certo — antes de `SKELETONS` aprender que o `Arm` do Biped é
  // clavícula, a derivação pedia um giro de 35 graus fora do resto, porque
  // era o úmero inteiro sendo dirigido como antebraço.
  'glb-goku': {
    position: [-0.038, -0.135, 0.061],
    rotation: [0.134, -0.326, -1.194],
    scale: 0.36,
  },
}

/**
 * Junta a base com o ajuste de um personagem.
 *
 * Devolve sempre uma **cópia**. O painel de `?rig` escreve no objeto que
 * recebe, e entregar a tabela base faria o ajuste de um personagem vazar
 * para todos os outros — que é o oposto do que estes ajustes existem para
 * fazer.
 */
export function attachmentFor(chave: string, characterId: string | null): Attachment {
  const base = ATTACHMENTS[chave]
  const extra = characterId ? CHARACTER_ADJUSTMENTS[characterId] : undefined
  return {
    bone: extra?.bone ?? base.bone,
    position: [...(extra?.position ?? base.position)],
    rotation: [...(extra?.rotation ?? base.rotation)],
    scale: extra?.scale ?? base.scale,
  }
}
