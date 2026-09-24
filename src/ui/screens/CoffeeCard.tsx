/**
 * O convite para pagar um café, no menu principal.
 *
 * Fica fora da navegação por setas pelo mesmo motivo do seletor de idioma:
 * as setas andam entre telas, e este cartão não abre nenhuma — ele sai do
 * jogo. Chega-se nele pelo ponteiro ou pelo Tab.
 *
 * É um link de verdade, e não um botão que chama `window.open`: assim o
 * navegador mostra o endereço antes do clique, e o botão do meio e o "abrir
 * em nova aba" funcionam como em qualquer link.
 *
 * A xícara é SVG desenhado, pela regra de sempre: nenhum bitmap na
 * interface, e nada de logotipo de terceiro no cartaz.
 */

import { mixer } from '../../audio/mixer'
import { useT } from '../useT'

const URL = 'https://buymeacoffee.com/bbraian'

export function CoffeeCard() {
  const t = useT()
  return (
    <a
      className="coffee-card"
      href={URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.coffee.label}
      onMouseEnter={() => mixer.play('move')}
      onClick={() => mixer.play('select')}
    >
      <span className="coffee-card-icon" aria-hidden>
        <CupIcon />
      </span>
      <span className="coffee-card-body">
        <span className="coffee-card-title">{t.coffee.title}</span>
        <span className="coffee-card-text">{t.coffee.text}</span>
        <span className="coffee-card-link">
          buymeacoffee.com/bbraian <span aria-hidden>↗</span>
        </span>
      </span>
    </a>
  )
}

/** Xícara em tinta chapada, com três fios de vapor. */
function CupIcon() {
  return (
    <svg viewBox="0 0 32 32" width="42" height="42" focusable="false">
      <path
        d="M10 2.5c-1.8 1.6 1.8 3.4 0 5M15.5 2.5c-1.8 1.6 1.8 3.4 0 5M21 2.5c-1.8 1.6 1.8 3.4 0 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.8"
      />
      <path d="M4 11h22v8.5A7.5 7.5 0 0 1 18.5 27h-7A7.5 7.5 0 0 1 4 19.5Z" fill="currentColor" />
      <path
        d="M26 13.5h1.8a3.7 3.7 0 0 1 0 7.4H25"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <path d="M2 30h28" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
    </svg>
  )
}
