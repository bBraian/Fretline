/**
 * Estado da interface e do progresso.
 *
 * Fica separado do engine de propósito: aqui mora o que sobrevive entre
 * sessões — dinheiro, desbloqueios, ajustes — enquanto o engine só conhece a
 * música que está tocando agora. O progresso é gravado no `localStorage` a
 * cada mudança relevante.
 */

import { create } from 'zustand'
import type { Difficulty } from '../engine/types'
import type { SongEntry } from '../songs/library'
import { catalogue, demoEntry, demoVisible, loadLocalLibrary } from '../songs/library'
import { CHARACTERS, SHOP_CHARACTERS } from '../content/characters'
import { GUITARS } from '../content/guitars'
import { mixer } from '../audio/mixer'
import type { Performance } from '../content/progression'
import { DEFAULT_GAMEPAD, DEFAULT_KEYBOARD, type GamepadBindings, type KeyboardBindings } from '../input/bindings'
import { DEFAULT_NOTE_SPEED } from '../render/layout'
import type { Quality } from '../render/gameScene'

export type Screen =
  | 'menu'
  | 'career'
  | 'songs'
  | 'characters'
  | 'guitars'
  | 'settings'
  | 'calibration'
  | 'play'
  | 'results'

/**
 * Idioma da interface.
 *
 * Por enquanto é só estado: nada lê este valor para escolher texto, e as
 * telas continuam em português. Ele existe para que a tradução, quando
 * vier, encontre a escolha já feita, gravada e restaurada entre sessões —
 * e não precise inventar onde ela mora no meio do trabalho.
 */
export type Language = 'en' | 'pt'

export interface Record_ {
  score: number
  stars: number
  accuracy: number
}

export interface Settings {
  difficulty: Difficulty
  /** Idioma da interface. Inglês é o padrão. Ver `Language`. */
  language: Language
  noteSpeed: number
  /** Calibração de áudio: desloca o julgamento. */
  audioOffset: number
  /** Calibração de vídeo: desloca só o desenho. */
  videoOffset: number
  volume: number
  /** Música de fundo nos menus. */
  menuMusic: boolean
  noFail: boolean
  quality: Quality
  keyboard: KeyboardBindings
  gamepad: GamepadBindings
}

export interface Profile {
  money: number
  /** Melhor resultado por música e dificuldade: `${songId}:${difficulty}`. */
  records: Record<string, Record_>
  ownedCharacters: string[]
  ownedGuitars: string[]
  characterId: string
  guitarId: string
}

interface State {
  screen: Screen
  /**
   * De qual tela a partida foi iniciada.
   *
   * Sair da música volta para lá. Antes voltava sempre para a biblioteca, e
   * quem tinha escolhido a música na carreira era despejado numa tela que
   * não pediu. Não é gravado: vale enquanto a aba estiver aberta.
   */
  playedFrom: Screen
  /**
   * Item em exibição nas telas de seleção.
   *
   * Separado do que está equipado de propósito: olhar a loja não pode
   * trocar o que a pessoa está usando. Não é gravado — vale só enquanto a
   * tela está aberta.
   */
  previewCharacterId: string | null
  previewGuitarId: string | null
  library: SongEntry[]
  /** A varredura da pasta `songs/` ainda está em andamento? */
  loadingLibrary: boolean
  selectedSongId: string | null
  lastPerformance: Performance | null
  settings: Settings
  profile: Profile

  setScreen: (screen: Screen) => void
  previewCharacter: (id: string) => void
  previewGuitar: (id: string) => void
  selectSong: (id: string) => void
  addSongs: (entries: SongEntry[]) => void
  refreshLocalLibrary: () => Promise<number>
  updateSettings: (patch: Partial<Settings>) => void
  finishSong: (performance: Performance) => void
  setLastPerformance: (performance: Performance | null) => void
  buyCharacter: (id: string) => void
  buyGuitar: (id: string) => void
  chooseCharacter: (id: string) => void
  chooseGuitar: (id: string) => void
  totalStars: () => number
}

const STORAGE_KEY = 'fretline:v1'

const DEFAULT_SETTINGS: Settings = {
  difficulty: 'medium',
  language: 'en',
  noteSpeed: DEFAULT_NOTE_SPEED,
  audioOffset: 0,
  videoOffset: 0,
  volume: 0.8,
  menuMusic: true,
  noFail: false,
  quality: 'alta',
  keyboard: DEFAULT_KEYBOARD,
  gamepad: DEFAULT_GAMEPAD,
}

const DEFAULT_PROFILE: Profile = {
  money: 0,
  records: {},
  ownedCharacters: CHARACTERS.filter((c) => c.price === 0).map((c) => c.id),
  ownedGuitars: GUITARS.filter((g) => g.price === 0).map((g) => g.id),
  // O primeiro da vitrine, não o primeiro do elenco: o elenco começa
  // pelas marionetes de reserva, que o jogador nunca vê.
  characterId: SHOP_CHARACTERS[0].id,
  guitarId: GUITARS[0].id,
}

interface Persisted {
  settings: Settings
  profile: Profile
}

/**
 * Recusa audível: a ação não aconteceu, e quem pediu fica sabendo.
 *
 * Devolve o pedaço de estado vazio que o zustand espera de uma ação que não
 * muda nada, para a recusa caber numa linha em cada guarda.
 */
function blocked() {
  mixer.play('blocked')
  return {}
}

/** Curinga de desenvolvimento: `['*']` significa tudo liberado. */
function ownsAll(list: string[]) {
  return list.includes('*')
}

export function owns(list: string[], id: string) {
  return ownsAll(list) || list.includes(id)
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { settings: DEFAULT_SETTINGS, profile: DEFAULT_PROFILE }
    const parsed = JSON.parse(raw) as Partial<Persisted>
    // Mesclagem rasa com os padrões: um save antigo não pode derrubar o jogo
    // por não conhecer um ajuste que passou a existir depois.
    return {
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      profile: { ...DEFAULT_PROFILE, ...parsed.profile },
    }
  } catch {
    return { settings: DEFAULT_SETTINGS, profile: DEFAULT_PROFILE }
  }
}

function save(state: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Modo privado ou armazenamento cheio: o jogo continua, só não lembra.
  }
}

const initial = load()

export const useGame = create<State>((set, get) => ({
  screen: 'menu',
  playedFrom: 'songs',
  previewCharacterId: null,
  previewGuitarId: null,
  library: [demoEntry()],
  loadingLibrary: false,
  selectedSongId: 'fretline-demo',
  lastPerformance: null,
  settings: initial.settings,
  profile: initial.profile,

  setScreen: (screen) =>
    set((state) => {
      // `play` e `results` não contam como origem: são etapas da própria
      // partida, e "de novo" precisa continuar apontando para a tela que
      // abriu a primeira.
      const playedFrom =
        screen === 'play' && state.screen !== 'play' && state.screen !== 'results'
          ? state.screen
          : state.playedFrom
      return { screen, playedFrom }
    }),

  // Trocar o item em exibição é navegar por um menu, e soa como tal. O som
  // mora aqui, e não nas telas, porque personagens, guitarras e músicas são
  // três listas com o mesmo gesto — repetir a chamada em cada uma é o
  // caminho curto para uma delas ficar muda numa refatoração.
  previewCharacter: (id) =>
    set((state) => {
      if (state.previewCharacterId !== id) mixer.play('move')
      return { previewCharacterId: id }
    }),

  previewGuitar: (id) =>
    set((state) => {
      if (state.previewGuitarId !== id) mixer.play('move')
      return { previewGuitarId: id }
    }),

  selectSong: (id) =>
    set((state) => {
      if (state.selectedSongId !== id) mixer.play('move')
      return { selectedSongId: id }
    }),

  addSongs: (entries) =>
    set((state) => {
      const known = new Set(state.library.map((e) => e.song.meta.id))
      const fresh = entries.filter((e) => !known.has(e.song.meta.id))
      const library = [...state.library, ...fresh]

      // A demo é rede de segurança, não catálogo: quando entra música de
      // verdade ela sai das listas, e a seleção precisa sair junto — senão
      // o botão de tocar apontaria para uma faixa que a lista não mostra.
      const atual = library.find((e) => e.song.meta.id === state.selectedSongId)
      const orfa = !demoVisible() && (!atual || atual.synthesized)
      const primeira = catalogue(library)
        .filter((e) => !e.synthesized)
        .sort((a, b) => a.song.meta.name.localeCompare(b.song.meta.name, 'pt-BR'))[0]

      return {
        library,
        selectedSongId: orfa && primeira ? primeira.song.meta.id : state.selectedSongId,
      }
    }),

  /** Relê a pasta `songs/` e devolve quantas músicas novas entraram. */
  refreshLocalLibrary: async () => {
    set({ loadingLibrary: true })
    try {
      const entries = await loadLocalLibrary()
      const before = get().library.length
      get().addSongs(entries)
      return get().library.length - before
    } finally {
      set({ loadingLibrary: false })
    }
  },

  updateSettings: (patch) =>
    set((state) => {
      const settings = { ...state.settings, ...patch }
      // A mesa de som é quem manda no volume de verdade; o ajuste só
      // atravessa por aqui. Aplicado na hora, sem esperar a próxima música.
      if (patch.volume !== undefined) mixer.setVolume(patch.volume)
      if (patch.menuMusic !== undefined) mixer.setMenuMusicEnabled(patch.menuMusic)
      save({ settings, profile: state.profile })
      return { settings }
    }),

  finishSong: (performance) =>
    set((state) => {
      const { selectedSongId, settings } = state
      if (!selectedSongId) return {}

      const key = `${selectedSongId}:${settings.difficulty}`
      const previous = state.profile.records[key]
      const isBetter = !previous || performance.score > previous.score

      const profile: Profile = {
        ...state.profile,
        money: state.profile.money + performance.money,
        records: isBetter
          ? {
              ...state.profile.records,
              [key]: {
                score: performance.score,
                stars: performance.stars,
                accuracy: performance.accuracy,
              },
            }
          : state.profile.records,
      }

      save({ settings, profile })
      return { profile, lastPerformance: performance, screen: 'results' }
    }),

  setLastPerformance: (performance) => set({ lastPerformance: performance }),

  buyCharacter: (id) =>
    set((state) => {
      const character = CHARACTERS.find((c) => c.id === id)
      if (!character) return {}
      // A recusa tem som próprio. É aqui, e não no botão, porque é aqui que
      // a regra mora: quem decide se a compra acontece decide o que se ouve.
      if (owns(state.profile.ownedCharacters, id)) return blocked()
      if (state.profile.money < character.price) return blocked()

      // Depois das guardas, nunca antes: a compra que não acontece — sem
      // saldo, ou de algo que já é seu — não pode soar como caixa registrando.
      mixer.playCue('cash')

      // Comprar não equipa. São duas decisões, e juntá-las tira do jogador a
      // possibilidade de comprar algo para depois.
      const profile: Profile = {
        ...state.profile,
        money: state.profile.money - character.price,
        ownedCharacters: [...state.profile.ownedCharacters, id],
      }
      save({ settings: state.settings, profile })
      return { profile }
    }),

  buyGuitar: (id) =>
    set((state) => {
      const guitar = GUITARS.find((g) => g.id === id)
      if (!guitar) return {}
      if (owns(state.profile.ownedGuitars, id)) return blocked()
      if (state.profile.money < guitar.price) return blocked()

      mixer.playCue('cash')

      const profile: Profile = {
        ...state.profile,
        money: state.profile.money - guitar.price,
        ownedGuitars: [...state.profile.ownedGuitars, id],
      }
      save({ settings: state.settings, profile })
      return { profile }
    }),

  chooseCharacter: (id) =>
    set((state) => {
      if (!owns(state.profile.ownedCharacters, id)) return blocked()
      // Equipar é a confirmação de uma escolha, e usa o som de confirmar.
      mixer.play('select')
      const profile = { ...state.profile, characterId: id }
      save({ settings: state.settings, profile })
      return { profile }
    }),

  chooseGuitar: (id) =>
    set((state) => {
      if (!owns(state.profile.ownedGuitars, id)) return blocked()
      mixer.play('select')
      const profile = { ...state.profile, guitarId: id }
      save({ settings: state.settings, profile })
      return { profile }
    }),

  totalStars: () =>
    Object.values(get().profile.records).reduce((sum, record) => sum + record.stars, 0),
}))

export function selectedEntry(): SongEntry | null {
  const { library, selectedSongId } = useGame.getState()
  return library.find((e) => e.song.meta.id === selectedSongId) ?? null
}
