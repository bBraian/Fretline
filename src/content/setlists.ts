/**
 * A carreira, montada a partir da biblioteca.
 *
 * Antes isto era uma lista fixa de faixas do Guitar Hero III, e cada música
 * nova exigia editar código. Não é o formato certo para uma biblioteca que
 * cresce: o jogador baixa um pack e espera que ele apareça.
 *
 * Agora os tiers são estrutura — nome e quanto custa abrir — e as músicas
 * entram neles sozinhas, ordenadas da mais fácil para a mais difícil. Só
 * entra o que dá para tocar: chart mais áudio. Um chart sem áudio existe na
 * biblioteca como lembrete do que falta, mas não vira etapa de carreira.
 */

import type { SongEntry } from '../songs/library'
import { isPlayable } from '../songs/library'
import type { Difficulty } from '../engine/types'

/** Quantas músicas cada tier recebe. */
const SONGS_PER_TIER = 4

/**
 * Nomes dos tiers, na ordem da carreira.
 *
 * São os do original, porque é a progressão que o jogo conta: começar tocando
 * em bar, terminar num estádio. Ficam em inglês em todo idioma, como no
 * original. Se a biblioteca crescer além destes, os tiers seguintes ficam
 * sem nome, e a interface os numera.
 */
const TIER_NAMES = [
  'Starting Out Small',
  'Your First Real Gig',
  'Making the Video',
  'European Invasion',
  'Bon Voyage',
  'Hottest Band on Earth',
  'Live in Japan',
  'Encore',
]

export interface CareerSong {
  entry: SongEntry
  /** Fecha o tier. */
  encore: boolean
}

export interface CareerTier {
  id: string
  /** Posição na carreira, a partir de 1. */
  order: number
  /** Nome do original; `null` além deles — a tela numera, no idioma dela. */
  name: string | null
  /** Estrelas acumuladas para abrir este tier. */
  unlockAtStars: number
  songs: CareerSong[]
}

/**
 * Estrelas para abrir cada tier.
 *
 * Cresce mais rápido que o teto de estrelas que o tier anterior oferece, o
 * que obriga a voltar e tocar melhor em vez de só atravessar tudo uma vez —
 * é assim que a carreira do original segura o jogador.
 */
function unlockCost(index: number) {
  return index === 0 ? 0 : Math.round(index * SONGS_PER_TIER * 2.4)
}

/**
 * Quão difícil é uma música.
 *
 * A dificuldade declarada no `song.ini` tem precedência: é a avaliação de
 * quem charteou, e captura coisas que uma média não vê — um solo curto e
 * impossível no meio de uma música tranquila, por exemplo. Sem ela, sobra
 * medir a densidade de notas do expert, que é uma aproximação grosseira mas
 * ordena razoavelmente.
 */
export function difficultyScore(entry: SongEntry): number {
  if (entry.declaredDifficulty >= 0) return entry.declaredDifficulty

  const order: Difficulty[] = ['expert', 'hard', 'medium', 'easy']
  const chart = order.map((level) => entry.song.charts[level]).find(Boolean)
  if (!chart || chart.notes.length === 0) return 0

  const span = (chart.notes.at(-1)?.time ?? 0) - chart.notes[0].time
  if (span <= 0) return 0

  // Notas por segundo, numa escala parecida com a do `song.ini` (0 a 6).
  return Math.min(6, (chart.notes.length / span) * 1.6)
}

/** Monta a carreira com o que está tocável na biblioteca. */
export function buildCareer(library: SongEntry[]): CareerTier[] {
  const playable = library
    .filter((entry) => isPlayable(entry) && Object.keys(entry.song.charts).length > 0)
    .sort((a, b) => {
      const byDifficulty = difficultyScore(a) - difficultyScore(b)
      if (Math.abs(byDifficulty) > 0.01) return byDifficulty
      // Empate resolvido pelo nome, para a ordem não dançar entre sessões.
      return a.song.meta.name.localeCompare(b.song.meta.name)
    })

  const tiers: CareerTier[] = []

  for (let i = 0; i < playable.length; i += SONGS_PER_TIER) {
    const slice = playable.slice(i, i + SONGS_PER_TIER)
    const index = tiers.length

    tiers.push({
      id: `tier-${index + 1}`,
      order: index + 1,
      name: TIER_NAMES[index] ?? null,
      unlockAtStars: unlockCost(index),
      songs: slice.map((entry, position) => ({
        // A última de cada tier fecha o show — menos num tier incompleto,
        // que ainda está esperando música.
        encore: position === slice.length - 1 && slice.length === SONGS_PER_TIER,
        entry,
      })),
    })
  }

  return tiers
}

/**
 * Normaliza um título para comparação.
 *
 * Os mesmos títulos aparecem escritos de formas diferentes entre packs:
 * acentuação, aspas curvas, "and" contra "&", artigo inicial, sufixos de
 * remaster entre parênteses. Reduzir tudo a letras e dígitos resolve a
 * maioria dos casos sem precisar de uma tabela de exceções.
 */
export function normalizeTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/&/g, ' and ')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '')
}
