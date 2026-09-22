/**
 * Uma linha da folha de setlist, compartilhada pela carreira e pela
 * biblioteca.
 *
 * As duas telas mostram a mesma coisa — nome, quem tocou, quantas estrelas,
 * quantos pontos — e antes cada uma montava a linha do seu jeito, com
 * colunas em ordens diferentes. Uma linha só, em um lugar só, é o que
 * mantém as duas parecidas depois da terceira mudança.
 *
 * O desenho segue a folha de caderno do original: o nome à esquerda em
 * letra de mão, os dados em caixa alta miúda embaixo, e as estrelas e a
 * pontuação à direita, ligados ao nome por uma linha pontilhada.
 */

import { blockable } from '../blocked'

interface SongRowProps {
  name: string
  /** Quem tocou, e o ano quando houver. */
  artist: string
  /** Notas, duração, formato: o que a folha do original não tem, mas é útil. */
  meta?: string
  /** Estrelas conquistadas, de 0 a 5; `null` quando nunca foi tocada. */
  stars: number | null
  score: number | null
  selected?: boolean
  /** O preview desta linha está tocando agora. */
  previewing?: boolean
  /**
   * O que liga a linha ao seletor: referência, passagem do mouse e foco.
   *
   * Vem de fora porque quem sabe navegar é a lista, não a linha — as duas
   * telas que usam esta linha têm listas de formatos diferentes, e uma
   * carreira em tiers precisa de um índice achatado que a linha não tem
   * como calcular sozinha.
   */
  nav?: {
    ref: (node: HTMLElement | null) => void
    onMouseEnter: () => void
    onFocus: () => void
  }
  disabled?: boolean
  /** Tem chart mas ainda não tem áudio. */
  waiting?: boolean
  onClick: () => void
}

const MAX_STARS = 5

export function SongRow({
  name,
  artist,
  meta,
  stars,
  score,
  selected,
  previewing,
  nav,
  disabled,
  waiting,
  onClick,
}: SongRowProps) {
  return (
    <button
      className="song-row"
      data-selected={selected}
      data-previewing={previewing}
      data-waiting={waiting}
      {...nav}
      {...blockable(disabled ?? false, onClick)}
    >
      {/* O clipe do seletor: aparece quando o preview de fato começa, e não
          quando o destaque chega. É o retorno de que os dois segundos
          fecharam — sem ele, o som sai sem nada na tela explicando de onde. */}
      {previewing && (
        <span className="song-row-eq" aria-label="tocando prévia">
          <i aria-hidden />
          <i aria-hidden />
          <i aria-hidden />
        </span>
      )}

      <span className="song-row-main">
        <span className="song-name">{name}</span>
        <span className="song-artist">
          {artist}
          {meta ? ` · ${meta}` : ''}
        </span>
      </span>

      {/* A pontilhada é um elemento vazio que estica: encostar nome e
          estrelas com `justify-content` deixaria a linha sem o fio que
          liga os dois lados, que é o que o original tem. */}
      <span className="song-row-lead" aria-hidden />

      <span className="song-row-side">
        <Stars value={stars} />
        <span className="song-score">
          {score == null ? '—' : score.toLocaleString('pt-BR')}
        </span>
      </span>
    </button>
  )
}

/**
 * As cinco estrelas.
 *
 * Nunca some nenhuma: no original as não conquistadas continuam desenhadas,
 * apagadas, e é isso que deixa ver de longe o quanto falta.
 */
function Stars({ value }: { value: number | null }) {
  const won = value ?? 0
  return (
    <span className="stars" aria-label={value == null ? 'nunca tocada' : `${won} de ${MAX_STARS} estrelas`}>
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <span key={i} className={i < won ? undefined : 'off'} aria-hidden>
          ★
        </span>
      ))}
    </span>
  )
}
