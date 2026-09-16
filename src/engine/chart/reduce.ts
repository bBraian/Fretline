/**
 * Gera as dificuldades que faltam a partir da mais alta disponível.
 *
 * A maioria dos charts da comunidade traz só o expert — charter faz o nível
 * que gosta de tocar. O resultado, num jogo com quatro dificuldades, é que
 * três delas simplesmente não existem: quem escolhe médio não tem o que
 * tocar, e quem escolhe expert cai direto no chart cru, sem nenhuma rampa.
 *
 * A redução resolve os dois lados com a mesma operação, e ela é a mesma que
 * um charter faz à mão:
 *
 * 1. **grade** — o nível mais baixo aceita menos subdivisões. Do expert para
 *    o fácil, a música vai de semicolcheias para semínimas;
 * 2. **trastes** — o fácil usa três, o médio quatro, os demais cinco. Nota
 *    acima do limite desce para o traste mais alto permitido;
 * 3. **acordes** — desaparecem no fácil e no médio, viram no máximo duas
 *    notas no difícil.
 *
 * A regra de qual nota sobra quando várias caem na mesma célula da grade é o
 * que separa uma redução tocável de uma picotada: fica **a primeira**. Ela é
 * a que cai no tempo forte, e é o tempo forte que o ouvido espera.
 */

import type { Chart, Difficulty, Note } from '../types'
import { countFrets, fretsToArray, highestFret } from '../types'

interface ReductionRules {
  /** Subdivisões da batida que o nível aceita, antes de afinar. */
  cellsPerBeat: number
  /** Quantos trastes o nível usa, do verde para cima. */
  lanes: number
  /** Maior acorde permitido; 1 significa nenhum. */
  maxChord: number
  /** Sustains mais curtos que isto, em batidas, viram nota seca. */
  minSustainBeats: number
  /**
   * Teto de notas por segundo.
   *
   * Uma grade sozinha limita o *máximo* de notas por batida, mas não afina
   * uma passagem que é densa do começo ao fim: um expert em semicolcheias
   * reduzido para colcheias ainda entrega quase cinco notas por segundo, que
   * é densidade de difícil.
   *
   * Os valores vêm de medir um chart de verdade com os quatro níveis feitos
   * à mão — Barracuda dá 0,9 / 1,4 / 2,0 / 3,4 notas por segundo. São esses
   * números que fazem o jogador sentir que mudou de nível.
   */
  notesPerSecond: number
}

const RULES: Record<Difficulty, ReductionRules> = {
  easy: { cellsPerBeat: 1, lanes: 3, maxChord: 1, minSustainBeats: 1, notesPerSecond: 1.0 },
  medium: { cellsPerBeat: 2, lanes: 4, maxChord: 1, minSustainBeats: 0.75, notesPerSecond: 1.6 },
  hard: { cellsPerBeat: 4, lanes: 5, maxChord: 2, minSustainBeats: 0.5, notesPerSecond: 2.6 },
  expert: { cellsPerBeat: 8, lanes: 5, maxChord: 5, minSustainBeats: 0.25, notesPerSecond: 99 },
}

const ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'expert']

/**
 * Posição de um instante na grade de batidas, em batidas fracionárias.
 *
 * Trabalhar em batidas e não em segundos é o que faz a redução acompanhar
 * mudanças de andamento: uma semicolcheia continua sendo uma semicolcheia
 * quando a música acelera.
 */
function beatPositionAt(beats: number[], time: number): number {
  if (beats.length < 2) return time * 2

  let lo = 0
  let hi = beats.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (beats[mid] <= time) lo = mid
    else hi = mid - 1
  }

  const span = beats[lo + 1] - beats[lo]
  return span > 0 ? lo + (time - beats[lo]) / span : lo
}

/** Encolhe um acorde para o tamanho permitido, mantendo os graves. */
function trimChord(frets: number, maxChord: number, lanes: number): number {
  const lanesUsed = fretsToArray(frets).map((lane) => Math.min(lane, lanes - 1))
  const unique = [...new Set(lanesUsed)].sort((a, b) => a - b)
  const kept = unique.slice(0, maxChord)
  return kept.reduce((mask, lane) => mask | (1 << lane), 0)
}

/**
 * Reduz um chart para a dificuldade pedida.
 *
 * Exportada para ser testável sozinha: é onde mora a decisão de qual nota
 * fica, e é isso que decide se o nível resultante soa como a música.
 */
export function reduceChart(source: Chart, target: Difficulty): Chart {
  const rules = RULES[target]

  const notes = pass(source, rules, rules.cellsPerBeat)

  // "Notas por segundo" só quer dizer alguma coisa sobre um trecho longo o
  // bastante. Num punhado de notas em dois segundos a medida é ruído, e
  // afinar por ela reduziria uma frase inteira a uma nota só.
  const trimmed = measurable(notes) ? thinToTarget(notes, source.beats, rules) : notes

  return {
    difficulty: target,
    // Os índices precisam ficar seguidos depois do descarte: a sessão usa o
    // índice como identidade da nota.
    notes: trimmed.map((note, index) => ({ ...note, index })),
    // Os trechos de star power continuam valendo: eles marcam compassos da
    // música, não notas específicas.
    starPower: source.starPower,
    beats: source.beats,
  }
}

/**
 * Descarta notas até a densidade caber no nível, pela força métrica.
 *
 * A alternativa óbvia — ir dobrando a grade até caber — erra feio: de
 * colcheias para semínimas a densidade cai pela metade de uma vez, e um
 * nível que deveria ficar em 2,6 notas por segundo aterrissa em 1,3. Foi o
 * que aconteceu com um dos charts, em que médio e difícil saíram idênticos.
 *
 * Aqui o descarte é nota a nota, das mais fracas para as mais fortes. A
 * força é a posição métrica: quem cai no tempo é forte, na metade do tempo
 * menos, na semicolcheia menos ainda. É a ordem em que um músico abandonaria
 * notas ao simplificar uma frase — e ela converge no alvo exatamente.
 */
function thinToTarget(notes: Note[], beats: number[], rules: ReductionRules): Note[] {
  const span = (notes.at(-1)?.time ?? 0) - notes[0].time
  const allowed = Math.floor(span * rules.notesPerSecond)
  if (span <= 0 || notes.length <= allowed) return notes

  // Agrupa por força métrica: todas as semicolcheias juntas, todas as
  // colcheias juntas, e assim por diante.
  const groups = new Map<number, number[]>()
  notes.forEach((note, position) => {
    const strength = metricStrength(beatPositionAt(beats, note.time))
    const group = groups.get(strength)
    if (group) group.push(position)
    else groups.set(strength, [position])
  })

  const dropped = new Set<number>()
  let remaining = notes.length

  // Das mais fracas para as mais fortes.
  for (const strength of [...groups.keys()].sort((a, b) => b - a)) {
    if (remaining <= allowed) break

    const group = groups.get(strength)!
    const need = Math.min(group.length, remaining - allowed)

    if (need === group.length) {
      for (const position of group) dropped.add(position)
    } else {
      // Descarte espalhado, e não um pedaço contínuo.
      //
      // Tirar as últimas notas do grupo é o que a ordenação ingênua faz, e o
      // resultado é a segunda metade da música desaparecer enquanto a
      // primeira continua cheia — a densidade média nem se move. Espaçar os
      // descartes afina o trecho inteiro por igual.
      for (let i = 0; i < need; i++) {
        dropped.add(group[Math.floor((i * group.length) / need)])
      }
    }

    remaining = notes.length - dropped.size
  }

  return notes.filter((_, position) => !dropped.has(position))
}

/**
 * Quão forte é a posição métrica de um instante.
 *
 * Zero no tempo, um na metade, dois na semicolcheia, e assim por diante. O
 * limite de seis evita laço infinito em posições que não caem em nenhuma
 * subdivisão binária — um trio, por exemplo.
 */
function metricStrength(beat: number): number {
  const fraction = beat - Math.floor(beat)
  if (fraction < 1e-6) return 0

  for (let level = 1; level <= 6; level++) {
    const step = 1 / 2 ** level
    if (Math.abs(fraction / step - Math.round(fraction / step)) < 1e-6) return level
  }
  return 7
}

/**
 * Há material suficiente para a densidade significar alguma coisa?
 *
 * Os dois limites juntos: um trecho curto tem densidade instável, e poucas
 * notas tornam a média sensível a uma única pausa.
 */
function measurable(notes: Note[]): boolean {
  if (notes.length < 40) return false
  const span = (notes.at(-1)?.time ?? 0) - notes[0].time
  return span >= 20
}

/** Uma passada de redução com a grade dada. */
function pass(source: Chart, rules: ReductionRules, cellsPerBeat: number): Note[] {
  const notes: Note[] = []

  let lastCell = -Infinity
  let lastFrets = -1

  for (const note of source.notes) {
    const beat = beatPositionAt(source.beats, note.time)
    const cell = Math.floor(beat * cellsPerBeat + 1e-6)

    // Uma nota por célula da grade: fica a primeira, que é a do tempo forte.
    if (cell === lastCell) continue

    let frets = note.frets
    let isOpen = note.isOpen

    if (!isOpen) {
      if (countFrets(frets) > rules.maxChord) {
        frets = trimChord(frets, rules.maxChord, rules.lanes)
      } else {
        // Nota acima do alcance do nível desce para o traste mais alto dele.
        frets = fretsToArray(frets)
          .map((lane) => Math.min(lane, rules.lanes - 1))
          .reduce((mask, lane) => mask | (1 << lane), 0)
      }

      // Duas notas seguidas no mesmo traste exigem soltar e apertar de novo,
      // o que é justamente o movimento difícil neste jogo. Nos níveis baixos
      // a segunda muda de traste em vez de repetir.
      if (rules.lanes <= 4 && frets === lastFrets && countFrets(frets) === 1) {
        const lane = highestFret(frets)
        const alternative = lane > 0 ? lane - 1 : Math.min(1, rules.lanes - 1)
        frets = 1 << alternative
      }
    }

    // Nota aberta é gesto próprio — soltar tudo — e nos níveis baixos ela
    // atrapalha mais do que ensina.
    if (isOpen && rules.lanes <= 4) {
      isOpen = false
      frets = 1
    }

    const beatsOfSustain = note.duration > 0
      ? beatPositionAt(source.beats, note.time + note.duration) - beat
      : 0

    notes.push({
      index: notes.length,
      time: note.time,
      duration: beatsOfSustain >= rules.minSustainBeats ? note.duration : 0,
      frets,
      type: note.type,
      isOpen,
    })

    lastCell = cell
    lastFrets = frets
  }

  return notes
}

/**
 * Preenche as dificuldades ausentes de uma música.
 *
 * Cada nível ausente é derivado do mais próximo acima dele, em cascata — o
 * difícil sai do expert, o médio do difícil, o fácil do médio. Derivar tudo
 * direto do expert daria níveis baixos com notas que o nível de cima já
 * tinha descartado, e a progressão entre eles ficaria irregular.
 */
export function fillMissingDifficulties(
  charts: Partial<Record<Difficulty, Chart>>,
): Partial<Record<Difficulty, Chart>> {
  const filled = { ...charts }

  const highest = [...ORDER].reverse().find((level) => filled[level])
  if (!highest) return filled

  for (let i = ORDER.indexOf(highest) - 1; i >= 0; i--) {
    const level = ORDER[i]
    if (filled[level]) continue

    const above = filled[ORDER[i + 1]]
    if (above) filled[level] = reduceChart(above, level)
  }

  return filled
}
