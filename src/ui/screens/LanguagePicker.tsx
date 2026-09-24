/**
 * O seletor de idioma do menu principal.
 *
 * Grava `settings.language`, e as telas, que leem o texto por `useT`,
 * desenham de novo na outra língua na hora — sem recarregar e sem sair do
 * menu. Ver `i18n/`.
 *
 * As bandeiras são SVG desenhado, não arquivo. É a mesma regra do resto do
 * projeto — nenhum bitmap na interface —, e num corpo de vinte pixels um
 * PNG não ganharia nada de uma dúzia de retângulos.
 */

import type { ReactElement } from 'react'
import { useGame } from '../store'
import { mixer } from '../../audio/mixer'
import type { Language } from '../../i18n'
import { useT } from '../useT'

interface Option {
  code: Language
  /** O nome do idioma na própria língua: quem procura não lê o atual. */
  label: string
  /** O `lang` do rótulo, para o leitor de tela pronunciar na língua dele. */
  tag: string
  flag: () => ReactElement
}

const OPTIONS: Option[] = [
  { code: 'en', label: 'English', tag: 'en', flag: UsaFlag },
  { code: 'pt', label: 'Português', tag: 'pt-BR', flag: BrazilFlag },
]

export function LanguagePicker() {
  const language = useGame((s) => s.settings.language)
  const updateSettings = useGame((s) => s.updateSettings)
  const t = useT()

  return (
    <div className="lang-picker" role="group" aria-label={t.menu.language}>
      {OPTIONS.map((option) => {
        const active = option.code === language
        const Flag = option.flag
        return (
          <button
            key={option.code}
            type="button"
            className="lang-option"
            data-active={active}
            aria-pressed={active}
            onMouseEnter={() => {
              if (!active) mixer.play('move')
            }}
            onClick={() => {
              if (active) return
              mixer.play('select')
              updateSettings({ language: option.code })
            }}
          >
            <span className="lang-flag" aria-hidden>
              <Flag />
            </span>
            <span className="lang-label" lang={option.tag}>
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Treze listras e a união.
 *
 * As cinquenta estrelas não cabem: num corpo desse tamanho elas viram uma
 * mancha cinza. Nove pontos arrumados em grade leem como estrelas e mantêm
 * a silhueta, que é o que identifica a bandeira de relance.
 */
function UsaFlag() {
  const stripe = 14 / 13
  return (
    <svg viewBox="0 0 20 14" width="20" height="14" focusable="false">
      <rect width="20" height="14" fill="#f4f4f4" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect key={i} y={i * stripe} width="20" height={stripe} fill="#b22234" />
      ))}
      <rect width="8" height={stripe * 7} fill="#3c3b6e" />
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((col) => (
          <circle
            key={`${row}-${col}`}
            cx={1.6 + col * 2.4}
            cy={1.5 + row * 2.3}
            r="0.52"
            fill="#f4f4f4"
          />
        )),
      )}
      <rect width="20" height="14" fill="none" stroke="rgba(23, 16, 10, 0.75)" strokeWidth="1" />
    </svg>
  )
}

/**
 * Losango, globo e faixa.
 *
 * A faixa é um arco recortado pelo círculo: desenhá-la como polígono daria
 * uma linha reta atravessando o globo, que é justamente o que a bandeira
 * não tem. As vinte e sete estrelas ficam de fora pelo mesmo motivo das
 * cinquenta da outra.
 */
function BrazilFlag() {
  return (
    <svg viewBox="0 0 20 14" width="20" height="14" focusable="false">
      <defs>
        <clipPath id="fretline-br-globe">
          <circle cx="10" cy="7" r="3.5" />
        </clipPath>
      </defs>
      <rect width="20" height="14" fill="#009739" />
      <polygon points="10,1.2 18.3,7 10,12.8 1.7,7" fill="#fedd00" />
      <circle cx="10" cy="7" r="3.5" fill="#012169" />
      <g clipPath="url(#fretline-br-globe)">
        <path
          d="M3.8 10.9 A 7.4 7.4 0 0 1 16.6 6.1"
          fill="none"
          stroke="#f4f4f4"
          strokeWidth="1.15"
        />
      </g>
      <rect width="20" height="14" fill="none" stroke="rgba(23, 16, 10, 0.75)" strokeWidth="1" />
    </svg>
  )
}
