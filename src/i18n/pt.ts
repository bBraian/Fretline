/**
 * Português. É o dicionário que define o formato: `Messages` sai daqui, e o
 * inglês precisa ter cada chave.
 *
 * Duas marcações valem dentro dos textos, lidas por `ui/Rich.tsx`: crases
 * viram código (`songs/`) e asteriscos duplos viram negrito. Só onde a tela
 * passa o texto pelo `Rich` — no resto, são caracteres comuns.
 */

import type { Difficulty, FretName } from '../engine/types'
import type { BodyBuild } from '../content/characters'
import type { BodyShape } from '../render/guitar/shapes'
import type { Language } from '.'

const LOCALE = 'pt-BR'
const num = (n: number) => n.toLocaleString(LOCALE)
/** O `s` do plural, para as frases em que só ele muda. */
const s = (n: number) => (n === 1 ? '' : 's')

export const pt = {
  language: 'pt' as Language,
  /** Para o `lang` do documento e para formatar números. */
  locale: LOCALE as string,

  number: num,
  money: (n: number) => `$${num(n)}`,
  /** A palavra, para ir depois de um número em negrito. */
  starsWord: (n: number): string => (n === 1 ? 'estrela' : 'estrelas'),
  songsWord: (n: number): string => (n === 1 ? 'música' : 'músicas'),

  difficulty: {
    easy: 'Fácil',
    medium: 'Médio',
    hard: 'Difícil',
    expert: 'Expert',
  } satisfies Record<Difficulty, string>,

  frets: {
    green: 'verde',
    red: 'vermelho',
    yellow: 'amarelo',
    blue: 'azul',
    orange: 'laranja',
  } satisfies Record<FretName, string>,

  builds: {
    slim: 'Magro',
    regular: 'Médio',
    heavy: 'Encorpado',
  } satisfies Record<BodyBuild, string>,

  shapes: {
    'single-cut': 'Corte simples',
    'double-cut': 'Corte duplo',
    sg: 'Chifres duplos',
    tele: 'Prancha',
    offset: 'Contorno deslocado',
    v: 'Formato V',
    explorer: 'Angular',
    'super-strat': 'Corte duplo esticado',
    'swept-wing': 'Asa varrida',
    mustang: 'Escala curta',
  } satisfies Record<BodyShape, string>,

  common: {
    back: '← Voltar',
    loading: 'Carregando',
    dragToRotate: 'arraste para girar',
    inPocket: 'no bolso',
  },

  brand: {
    tagline: 'Cinco trastes, sem palhetada',
  },

  boot: {
    press: 'Pressione qualquer tecla',
    progressLabel: 'Baixando o jogo',
    connecting: 'Conectando…',
    files: (done: number, total: number) => `${done}/${total} arquivos`,
    readingLibrary: 'Lendo a biblioteca…',
    noLibrary: 'Sem biblioteca — entra a faixa de demonstração',
    someSongs: (loaded: number, total: number) => `${loaded} de ${total} músicas`,
    libraryPending: 'Biblioteca…',
    libraryProgress: (done: number, total: number) => `Biblioteca ${done}/${total}`,
    failures: (n: number) =>
      n === 1
        ? '1 arquivo não veio — carrega quando precisar'
        : `${n} arquivos não vieram — carregam quando precisar`,
  },

  menu: {
    career: 'Carreira',
    careerHint: 'Os tiers na ordem original, preenchidos pela sua biblioteca',
    play: 'Tocar',
    playHint: (songs: number, difficulty: string) =>
      `${songs} música${s(songs)} na biblioteca · ${difficulty}`,
    character: 'Personagem',
    guitar: 'Guitarra',
    settings: 'Ajustes',
    settingsHint: 'Dificuldade, velocidade, controles e calibração',
    version: (version: string) => `Versão ${version}`,
    select: 'Selecionar',
    upDown: 'Cima/Baixo',
    stats: (stars: number, money: number, items: number) =>
      `**${num(stars)}** ${stars === 1 ? 'estrela' : 'estrelas'} · **$${num(money)}** no bolso · **${num(items)}** ${items === 1 ? 'item' : 'itens'}`,
    language: 'Idioma',
  },

  coffee: {
    label: 'Me paga um café, no Buy Me a Coffee (abre em nova aba)',
    title: 'Me paga um café',
    text: 'O Fretline é de graça e sem anúncio. Se ele te rendeu um bom show, um café mantém o palco aceso.',
  },

  fullscreen: {
    enter: 'Tela cheia',
    exit: 'Sair da tela cheia',
    exitShort: 'Sair',
  },

  pad: {
    connected: 'Controle conectado',
    unnamed: 'Controle',
    frets: (map: string) => `Trastes: ${map}`,
    pause: (button: string) => `Pausa: ${button}`,
  },

  /** Os rótulos de tecla, botão e eixo; ver `input/bindings.ts`. */
  input: {
    keys: { Space: 'Espaço', ShiftLeft: 'Shift', ShiftRight: 'Shift D', Enter: 'Enter' } as Record<
      string,
      string
    >,
    back: 'Voltar',
    guide: 'Guia',
    button: (index: number) => `Botão ${index}`,
    axisOff: 'desligado',
    axes: ['Analógico esq. ↔', 'Analógico esq. ↕', 'Analógico dir. ↔', 'Analógico dir. ↕'],
    axis: (index: number) => `Eixo ${index}`,
  },

  songRow: {
    previewing: 'tocando prévia',
    neverPlayed: 'nunca tocada',
    starsOf: (won: number, max: number) => `${won} de ${max} estrelas`,
  },

  shop: {
    equipped: 'Em uso',
    equip: 'Equipar',
    locked: 'Bloqueado',
    unlockAt: (stars: number) => `Abre com ${stars} estrelas na carreira.`,
    buy: (price: number) => `Comprar por $${num(price)}`,
    short: (missing: number) => `Faltam $${num(missing)}.`,
    owned: 'Sua',
  },

  career: {
    title: 'Carreira',
    subtitle:
      'As músicas da sua biblioteca, da mais fácil para a mais difícil. Cada pack novo entra sozinho no tier que couber.',
    empty:
      'Nenhuma música tocável ainda. Coloque as pastas em `songs/` — cada uma com o chart e o áudio dentro — e elas aparecem aqui.',
    tierLocked: (stars: number) => `Abre com ${stars} estrelas`,
    tierSongs: (n: number) => `${n} música${s(n)}`,
    /** Tier além dos nomes do original. */
    tour: (order: number) => `Turnê ${order}`,
    notes: (n: number) => `${num(n)} notas`,
    missingLevel: (difficulty: string) => `sem ${difficulty}`,
    waiting: (n: number) =>
      `${n} pasta${s(n)} com chart mas sem áudio, esperando o arquivo. Elas aparecem na biblioteca, não na carreira.`,
    fullLibrary: 'Ver a biblioteca inteira',
  },

  songs: {
    title: 'Escolha a música',
    subtitle:
      'Uma pasta por música, com o chart e o áudio dentro — o mesmo arranjo do Clone Hero. Largue as pastas em `songs/` dentro do projeto e elas entram sozinhas.',
    notes: (n: number) => `${num(n)} notas`,
    noLevel: 'sem este nível',
    generated: 'faixa gerada pelo jogo',
    separateTracks: 'faixas separadas',
    waitingHeading: 'Esperando áudio',
    waitingNote: (n: number) =>
      `${n} pasta${s(n)} com o chart, sem o arquivo de som. Coloque um \`song.ogg\` dentro e a música entra.`,
    /** Vem depois do nome da música, em negrito. */
    noAudio:
      'tem o chart, mas nenhum arquivo de áudio na pasta. Use `tools/gh3/place-audio.mjs` para preencher várias de uma vez, ou `tools/prune-library.mjs` para tirá-las da lista.',
    missingLevel: (difficulty: string, available: string) =>
      `Essa música não tem o nível ${difficulty}. Disponíveis: ${available}.`,
    readingFolder: 'Lendo a pasta…',
    folderError: 'Não consegui ler essa pasta.',
    readingFiles: 'Lendo os arquivos…',
    newSongs: (n: number) =>
      n === 1 ? '1 música nova na pasta songs/.' : `${n} músicas novas na pasta songs/.`,
    nothingNew: 'Nada novo na pasta songs/.',
    rereading: 'Lendo songs/…',
    reread: 'Reler a pasta songs/',
    importFolder: 'Importar pasta de fora',
    playOn: (difficulty: string) => `Tocar em ${difficulty}`,
    noCharts: 'Nenhum chart encontrado aí.',
    imported: (n: number) => (n === 1 ? '1 música importada.' : `${n} músicas importadas.`),
  },

  characters: {
    title: 'Quem sobe no palco',
    subtitle: 'Personagens novos abrem por estrelas e são comprados com o dinheiro dos shows.',
    footer:
      'Clique em qualquer personagem para vê-lo tocando. Comprar e equipar são os botões no visor.',
  },

  guitars: {
    title: 'A guitarra',
    subtitle: 'Só muda o que você vê — nenhuma delas toca melhor que a outra.',
    footer: 'Clique em qualquer guitarra para vê-la de perto. Comprar e equipar são os botões no visor.',
  },

  settings: {
    title: 'Ajustes',
    subtitle: 'Tudo é gravado no navegador assim que você muda.',
    difficulty: 'Dificuldade',
    noteSpeed: 'Velocidade do braço',
    noteSpeedHint:
      'Não muda a música, só o quanto ela ocupa da tela. Mais rápido significa notas mais espalhadas e mais fáceis de ler nos trechos densos.',
    volume: 'Volume',
    menuMusic: 'Música nos menus',
    menuMusicHint:
      'Um laço de fundo enquanto você escolhe música e personagem. Toca à metade do volume geral, para não disputar com os efeitos.',
    on: 'Ligada',
    off: 'Desligada',
    quality: 'Qualidade gráfica',
    qualityHint:
      'Na alta, o show ganha brilho difuso e sombras projetadas. Na baixa esses dois saem, o que devolve bastante quadro por segundo em máquinas modestas — a jogabilidade e o julgamento das notas não mudam em nada.',
    high: 'Alta',
    low: 'Baixa',
    noFail: 'Sem falha',
    noFailHint:
      'O medidor continua se mexendo, mas a música nunca é interrompida. Útil para aprender um trecho difícil.',
    noFailToggle: 'Nunca falhar a música',
    calibration: 'Calibração',
    calibrationHint:
      'Dois números diferentes: o de áudio desloca o julgamento das notas, o de vídeo desloca só o desenho. A tela de calibração mede os dois para você.',
    audio: 'Áudio',
    video: 'Vídeo',
    measure: 'Medir automaticamente',
    keyboard: 'Teclado',
    keyboardHint:
      'Não há palhetada: a nota é tocada no traste. Notas abertas — a barra larga que ocupa a pista inteira — são tocadas soltando todos os trastes.',
    fret: (color: string) => `Traste ${color}`,
    starPower: 'Star power',
    whammy: 'Alavanca',
    pressKey: 'aperte…',
    pressButton: 'aperte um botão…',
    restore: 'Restaurar o padrão',
    controller: 'Controle',
    connected: (name: string) =>
      `Conectado: ${name}. Clique num comando e aperte o botão que quer usar.`,
    noController:
      'Nenhum controle detectado. Conecte e aperte um botão — o navegador só o revela depois disso.',
    strumUp: 'Strum para cima',
    strumDown: 'Strum para baixo',
    whammyOff: 'desligada',
    pressedNow: (buttons: string) => `Apertados agora: ${buttons || 'nenhum'}`,
  },

  calibration: {
    title: 'Calibração',
    subtitle:
      'Bata espaço junto com a referência, umas quinze vezes. Vale a mediana, então errar uma ou outra não estraga a medida.',
    audio: '1. Áudio',
    audioHint:
      'Ouça o clique e bata junto, sem olhar a tela. Mede o atraso da saída de som — é o que desloca o julgamento das notas.',
    video: '2. Vídeo',
    videoHint:
      'Sem som: bata junto com o pulso na tela. Mede o atraso do display — desloca só o desenho das notas, nunca o julgamento.',
    start: 'Começar',
    measuring: 'Medindo…',
    current: (ms: number) => `atual: ${ms} ms`,
    progress: (taps: number, needed: number) => `${taps} de ${needed} batidas · desvio mediano`,
    apply: (ms: number) => `Aplicar ${ms} ms`,
    cancel: 'Cancelar',
  },

  results: {
    booed: 'A plateia foi embora',
    /** O título pelas estrelas; a sexta é a música inteira sem erro. */
    verdict: (stars: number) =>
      stars >= 6
        ? 'Sem um erro'
        : ['Não passou', 'Sobreviveu', 'Passou raspando', 'Aprovado', 'Muito bom', 'Impecável'][stars],
    starsOf: (stars: number) => `${stars} de 6 estrelas`,
    score: 'Pontos',
    accuracy: 'Notas acertadas',
    streak: 'Maior corrente',
    money: 'Cachê',
    fullCombo: 'Música inteira sem errar uma nota.',
    menu: 'Menu',
    anotherSong: 'Outra música',
    playAgain: 'Tocar de novo',
  },

  play: {
    tuning: 'Afinando',
    preparingStage: 'Preparando o palco…',
    buildingStage: (done: number, total: number) => `Montando o palco (${done}/${total || '…'})`,
    synthesizing: 'Sintetizando a faixa de demonstração…',
    connecting: 'Conectando…',
    downloading: (loaded: string, total: string) => `Baixando a música ${loaded} / ${total} MB`,
    downloadingTracks: (done: number, total: number) => `Baixando a música (${done}/${total} faixas)`,
    decoding: 'Decodificando o áudio…',
    /** Os itens do palco, pela chave que `render/stage.ts` registra. */
    assets: {
      scenery: 'Cenário',
      drums: 'Bateria',
      bass: 'Baixo',
      mic: 'Microfone',
      character: 'Personagem',
      guitar: 'Guitarra',
      bassist: 'Baixista',
      singer: 'Vocalista',
      drummer: 'Baterista',
    },
    back: 'Voltar',
    errorTitle: 'Não deu',
    errors: {
      noChart: 'Essa música não tem chart para a dificuldade escolhida.',
      missing: 'O áudio dessa música não está no servidor.',
      network: 'Não consegui baixar a música. Confira a conexão e tente de novo.',
      decode: 'Não consegui decodificar o áudio dessa música.',
    },
    tryAgain: 'Tentar de novo',
    paused: 'Pausado',
    pausedHint: 'Esc volta ao jogo — no controle, B.',
    resume: 'Continuar',
    restart: 'Recomeçar',
    quit: 'Sair da música',
    volume: 'Volume',
    booedTitle: 'Você foi vaiado',
    booedText:
      'O medidor zerou. Dá para tentar de novo, baixar a dificuldade, ou ligar o modo sem falha nos ajustes.',
    retry: 'De novo',
    seeResults: 'Ver o resultado',
  },

  hud: {
    perfect: 'no ponto',
    early: 'adiantado',
    late: 'atrasado',
    rockMeter: (rock: number, starPower: number) =>
      `Medidor de rock em ${rock}%, star power em ${starPower}%`,
    multiplier: (n: number) => `Multiplicador ${n}×`,
    streak: (n: number) => `${n} notas seguidas`,
  },
}

export type Messages = typeof pt
