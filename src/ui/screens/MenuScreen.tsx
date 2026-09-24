/**
 * Menu principal, no desenho do Guitar Hero III: logo à esquerda, lista à
 * direita, colagem de cartaz atrás.
 *
 * Duas decisões que não são só estética:
 *
 * A lista é *dirigida por seleção*, não por ponteiro. Cima e baixo andam,
 * e o item selecionado recebe o foco de verdade do navegador — por isso
 * Enter e espaço não são tratados aqui: o botão focado já os trata
 * nativamente, e duplicar isso dispararia a tela duas vezes. O mouse
 * continua valendo, e passar por cima seleciona sem roubar o foco, que é o
 * que se espera de um ponteiro.
 *
 * Os itens têm tamanhos diferentes de propósito. O original não alinha a
 * lista num corpo só; o ritmo irregular é metade do que faz a tela ler como
 * cartaz em vez de formulário.
 */

import { useEffect, useRef, useState } from 'react'
import { useGame } from '../store'
import { characterById } from '../../content/characters'
import { guitarById } from '../../content/guitars'
import { Backdrop } from '../Backdrop'
import { LanguagePicker } from './LanguagePicker'
import { CoffeeCard } from './CoffeeCard'
import { mixer } from '../../audio/mixer'
import type { Screen } from '../store'
import { useT } from '../useT'
import { Rich } from '../Rich'

type ItemSize = 'lg' | 'md' | 'sm'

interface MenuEntry {
  screen: Screen
  label: string
  size: ItemSize
  /** Linha de contexto, mostrada só quando o item está selecionado. */
  hint: string
}

export function MenuScreen() {
  const setScreen = useGame((s) => s.setScreen)
  const profile = useGame((s) => s.profile)
  const library = useGame((s) => s.library)
  const totalStars = useGame((s) => s.totalStars())
  const difficulty = useGame((s) => s.settings.difficulty)
  const t = useT()

  const character = characterById(profile.characterId)
  const guitar = guitarById(profile.guitarId)

  const entries: MenuEntry[] = [
    { screen: 'career', label: t.menu.career, size: 'lg', hint: t.menu.careerHint },
    {
      screen: 'songs',
      label: t.menu.play,
      size: 'lg',
      hint: t.menu.playHint(library.length, t.difficulty[difficulty]),
    },
    { screen: 'characters', label: t.menu.character, size: 'md', hint: character.name },
    { screen: 'guitars', label: t.menu.guitar, size: 'md', hint: guitar.name },
    { screen: 'settings', label: t.menu.settings, size: 'lg', hint: t.menu.settingsHint },
  ]

  const [selected, setSelected] = useState(0)
  const buttons = useRef<Array<HTMLButtonElement | null>>([])

  // Só as setas passam por aqui. Confirmar é o botão focado que resolve.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const step =
        event.key === 'ArrowDown' || event.key === 's' || event.key === 'S'
          ? 1
          : event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W'
            ? -1
            : 0
      if (step === 0) return
      event.preventDefault()
      setSelected((current) => {
        const next = (current + step + entries.length) % entries.length
        buttons.current[next]?.focus()
        mixer.play('move')
        return next
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [entries.length])

  return (
    <div className="screen menu-screen">
      <Backdrop />

      <div className="menu">
        <div className="menu-brand">
          {/* O nome vai no `aria-label` porque o visual quebra a palavra em
              dois blocos: derivado dos spans, o nome acessível fica à mercê
              de como as linhas são partidas e do `text-transform`. */}
          <h1 className="wordmark" aria-label="Fretline">
            <span className="wordmark-line" aria-hidden>
              Fret
            </span>
            <span className="wordmark-line wordmark-line-2" aria-hidden>
              line
            </span>
          </h1>
          <p className="wordmark-sub">{t.brand.tagline}</p>
        </div>

        <nav className="menu-actions">
          {entries.map((entry, i) => (
            <button
              key={entry.screen}
              ref={(node) => {
                buttons.current[i] = node
              }}
              className={`menu-item menu-item-${entry.size}${i === selected ? ' is-selected' : ''}`}
              onMouseEnter={() => {
                if (i !== selected) mixer.play('move')
                setSelected(i)
              }}
              onFocus={() => setSelected(i)}
              onClick={() => {
                mixer.play('select')
                setScreen(entry.screen)
              }}
            >
              <span className="menu-item-mark" aria-hidden>
                ◆
              </span>
              <span className="menu-item-label">{entry.label}</span>
              <span className="menu-item-mark" aria-hidden>
                ◆
              </span>
            </button>
          ))}

          <p className="menu-hint">{entries[selected].hint}</p>

          {/* Fora da lista dirigida por seleção de propósito: as setas andam
              entre telas, e o idioma não abre nenhuma. Chega-se nele pelo
              ponteiro ou pelo Tab, como em qualquer outro ajuste. */}
          <LanguagePicker />
        </nav>

        <CoffeeCard />
      </div>

      <footer className="menu-foot">
        <div className="menu-version">{t.menu.version(__APP_VERSION__)}</div>
        <div className="menu-prompts">
          <span className="prompt">
            <span className="prompt-key prompt-key-round" aria-hidden />
            {t.menu.select}
          </span>
          <span className="prompt">
            <span className="prompt-key prompt-key-bar" aria-hidden />
            {t.menu.upDown}
          </span>
        </div>
        <div className="menu-foot-stats">
          <Rich
            text={t.menu.stats(
              totalStars,
              profile.money,
              profile.ownedCharacters.length + profile.ownedGuitars.length,
            )}
          />
        </div>
      </footer>
    </div>
  )
}
