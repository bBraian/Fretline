/**
 * A carreira, organizada nos tiers do Guitar Hero III.
 *
 * O jogo não distribui áudio nenhum: esta lista é só a *estrutura* da
 * carreira — quais faixas compõem cada tier, em que ordem, e quanto é
 * preciso para abrir o próximo. Cada entrada é casada com a biblioteca do
 * jogador pelo título e pelo artista; as que ele ainda não tiver aparecem
 * como espaço vago, e as que tiver ficam jogáveis na posição certa.
 *
 * O casamento é por título normalizado, então o nome da pasta não importa —
 * o que vale é o `name` do `song.ini` ou do `.chart`.
 *
 * Para acrescentar uma faixa, basta uma linha aqui. A lista abaixo é a que
 * foi levantada até agora; ela não precisa estar completa para a carreira
 * funcionar, e um tier com menos faixas simplesmente é mais curto.
 */

export interface SetlistEntry {
  title: string
  artist: string
  year: number
  /** Faixa de encerramento do tier. */
  encore?: boolean
}

export interface Setlist {
  id: string
  /** Posição na carreira, a partir de 1. */
  order: number
  name: string
  /** Estrelas acumuladas para abrir este tier. */
  unlockAtStars: number
  songs: SetlistEntry[]
}

export const SETLISTS: Setlist[] = [
  {
    id: 'first-gig',
    order: 2,
    name: 'Your First Real Gig',
    unlockAtStars: 5,
    songs: [
      { title: 'Barracuda', artist: 'Heart', year: 1977 },
      { title: 'Bulls on Parade', artist: 'Rage Against the Machine', year: 1996, encore: true },
    ],
  },
  {
    id: 'european-invasion',
    order: 4,
    name: 'European Invasion',
    unlockAtStars: 20,
    songs: [{ title: 'Anarchy in the U.K.', artist: 'Sex Pistols', year: 1977 }],
  },
  {
    id: 'hottest-band',
    order: 6,
    name: 'Hottest Band on Earth',
    unlockAtStars: 45,
    songs: [
      { title: 'Black Magic Woman', artist: 'Santana', year: 1970 },
      { title: 'Black Sunshine', artist: 'White Zombie', year: 1992 },
      { title: 'Cherub Rock', artist: 'The Smashing Pumpkins', year: 1993 },
    ],
  },
  {
    id: 'live-in-japan',
    order: 7,
    name: 'Live in Japan',
    unlockAtStars: 65,
    songs: [
      { title: "3's & 7's", artist: 'Queens of the Stone Age', year: 2007 },
      { title: 'Before I Forget', artist: 'Slipknot', year: 2004 },
    ],
  },
  {
    id: 'encore',
    order: 8,
    name: 'Encore',
    unlockAtStars: 85,
    songs: [
      {
        title: 'Cities on Flame with Rock and Roll',
        artist: 'Blue Öyster Cult',
        year: 1972,
        encore: true,
      },
    ],
  },
]

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

/** Todas as faixas da carreira, na ordem dos tiers. */
export function careerSongs(): Array<SetlistEntry & { setlist: Setlist }> {
  return [...SETLISTS]
    .sort((a, b) => a.order - b.order)
    .flatMap((setlist) => setlist.songs.map((song) => ({ ...song, setlist })))
}
