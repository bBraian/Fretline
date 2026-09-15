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
import { demoEntry } from '../songs/library'
import { CHARACTERS } from '../content/characters'
import { GUITARS } from '../content/guitars'
import type { Performance } from '../content/progression'
import { DEFAULT_GAMEPAD, DEFAULT_KEYBOARD, type GamepadBindings, type KeyboardBindings } from '../input/bindings'
import { DEFAULT_NOTE_SPEED } from '../render/layout'

export type Screen =
  | 'menu'
  | 'songs'
  | 'characters'
  | 'guitars'
  | 'settings'
  | 'calibration'
  | 'play'
  | 'results'

export interface Record_ {
  score: number
  stars: number
  accuracy: number
}

export interface Settings {
  difficulty: Difficulty
  noteSpeed: number
  /** Calibração de áudio: desloca o julgamento. */
  audioOffset: number
  /** Calibração de vídeo: desloca só o desenho. */
  videoOffset: number
  volume: number
  noFail: boolean
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
  library: SongEntry[]
  selectedSongId: string | null
  lastPerformance: Performance | null
  settings: Settings
  profile: Profile

  setScreen: (screen: Screen) => void
  selectSong: (id: string) => void
  addSongs: (entries: SongEntry[]) => void
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
  noteSpeed: DEFAULT_NOTE_SPEED,
  audioOffset: 0,
  videoOffset: 0,
  volume: 0.8,
  noFail: false,
  keyboard: DEFAULT_KEYBOARD,
  gamepad: DEFAULT_GAMEPAD,
}

const DEFAULT_PROFILE: Profile = {
  money: 0,
  records: {},
  ownedCharacters: CHARACTERS.filter((c) => c.price === 0).map((c) => c.id),
  ownedGuitars: GUITARS.filter((g) => g.price === 0).map((g) => g.id),
  characterId: CHARACTERS[0].id,
  guitarId: GUITARS[0].id,
}

interface Persisted {
  settings: Settings
  profile: Profile
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
  library: [demoEntry()],
  selectedSongId: 'fretline-demo',
  lastPerformance: null,
  settings: initial.settings,
  profile: initial.profile,

  setScreen: (screen) => set({ screen }),

  selectSong: (id) => set({ selectedSongId: id }),

  addSongs: (entries) =>
    set((state) => {
      const known = new Set(state.library.map((e) => e.song.meta.id))
      const fresh = entries.filter((e) => !known.has(e.song.meta.id))
      return { library: [...state.library, ...fresh] }
    }),

  updateSettings: (patch) =>
    set((state) => {
      const settings = { ...state.settings, ...patch }
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
      if (state.profile.ownedCharacters.includes(id)) return {}
      if (state.profile.money < character.price) return {}

      const profile: Profile = {
        ...state.profile,
        money: state.profile.money - character.price,
        ownedCharacters: [...state.profile.ownedCharacters, id],
        characterId: id,
      }
      save({ settings: state.settings, profile })
      return { profile }
    }),

  buyGuitar: (id) =>
    set((state) => {
      const guitar = GUITARS.find((g) => g.id === id)
      if (!guitar) return {}
      if (state.profile.ownedGuitars.includes(id)) return {}
      if (state.profile.money < guitar.price) return {}

      const profile: Profile = {
        ...state.profile,
        money: state.profile.money - guitar.price,
        ownedGuitars: [...state.profile.ownedGuitars, id],
        guitarId: id,
      }
      save({ settings: state.settings, profile })
      return { profile }
    }),

  chooseCharacter: (id) =>
    set((state) => {
      if (!state.profile.ownedCharacters.includes(id)) return {}
      const profile = { ...state.profile, characterId: id }
      save({ settings: state.settings, profile })
      return { profile }
    }),

  chooseGuitar: (id) =>
    set((state) => {
      if (!state.profile.ownedGuitars.includes(id)) return {}
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
