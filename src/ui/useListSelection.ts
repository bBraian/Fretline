/**
 * O seletor das listas de música.
 *
 * Antes só dava para clicar, e clicar já era escolher: não existia o estado
 * intermediário de *estar olhando* uma música sem tê-la iniciado. É esse
 * estado que o preview precisa — e é ele que o jogo do gênero tem desde
 * sempre, com o destaque andando pela lista enquanto a música toca ao fundo.
 *
 * ## Uma origem só
 *
 * Teclado, controle e mouse escrevem no mesmo índice. Não são três
 * navegações concorrentes com três relógios: quem chegou por último manda, e
 * o relógio dos dois segundos é um só. Sem isso, passar o mouse por cima
 * enquanto se navega pelas setas deixaria dois previews disputando.
 *
 * ## O descanso
 *
 * `resting` é o índice onde o seletor ficou parado tempo suficiente. Ele
 * nasce nulo a cada movimento e só aparece quando o relógio fecha — quem
 * consome reage à mudança dele, e não precisa saber de temporizador nenhum.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface ListSelectionOptions {
  /** Quantos itens a lista tem agora. */
  count: number
  /** Quanto tempo parado até `resting` apontar para o item. */
  restDelay: number
  /** Enter, espaço ou o botão de confirmar do controle. */
  onConfirm?: (index: number) => void
  /** Desliga teclado e controle enquanto algo por cima estiver aberto. */
  enabled?: boolean
}

export interface ListSelection {
  index: number
  /** Onde o seletor está parado há `restDelay`, ou `null` se acabou de mexer. */
  resting: number | null
  setIndex: (index: number) => void
  /** Propriedades da linha `i`. */
  itemProps(i: number): {
    ref: (node: HTMLElement | null) => void
    onMouseEnter: () => void
    onFocus: () => void
  }
}

/** Botão 0 do controle: o de baixo do losango, confirmar por convenção. */
const CONFIRM_BUTTON = 0
const DPAD_UP = 12
const DPAD_DOWN = 13
/** Analógico esquerdo, eixo vertical. */
const STICK_Y = 1
const STICK_THRESHOLD = 0.5
/** Quanto o direcional segura antes de repetir, e de quanto em quanto repete. */
const REPEAT_FIRST = 420
const REPEAT_NEXT = 140

export function useListSelection({
  count,
  restDelay,
  onConfirm,
  enabled = true,
}: ListSelectionOptions): ListSelection {
  const [index, setIndexState] = useState(0)
  const [resting, setResting] = useState<number | null>(null)
  const nodes = useRef<Array<HTMLElement | null>>([])

  // O que o laço do controle precisa ler sem virar dependência dele.
  const live = useRef({ index, count, onConfirm, enabled })
  live.current = { index, count, onConfirm, enabled }

  /** Move sem mexer no foco: é como o mouse entra. */
  const setIndex = useCallback((next: number) => {
    setIndexState((current) => {
      if (next === current) return current
      return next
    })
  }, [])

  /** Move e leva o foco junto: é como teclado e controle entram. */
  const move = useCallback((next: number) => {
    setIndexState((current) => {
      if (next === current) return current
      // `focus` também rola a lista até o item, que é o que mantém o
      // destaque à vista numa lista de vinte e cinco músicas.
      nodes.current[next]?.focus()
      return next
    })
  }, [])

  const step = useCallback(
    (delta: number) => {
      const { count: n } = live.current
      if (n === 0) return
      move((live.current.index + delta + n) % n)
    },
    [move],
  )

  // O índice não pode sobreviver ao encolhimento da lista — ela cresce
  // sozinha enquanto a pasta é varrida.
  useEffect(() => {
    if (count > 0 && index >= count) setIndexState(count - 1)
  }, [count, index])

  // O relógio do descanso. Reinicia a cada movimento, venha ele de onde vier.
  useEffect(() => {
    setResting(null)
    if (count === 0) return
    const timer = window.setTimeout(() => setResting(index), restDelay)
    return () => window.clearTimeout(timer)
  }, [index, count, restDelay])

  // Teclado.
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      // Um campo de texto em foco fica com as teclas.
      const alvo = event.target as HTMLElement | null
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA')) return

      switch (event.key) {
        case 'ArrowDown':
        case 's':
        case 'S':
          event.preventDefault()
          step(1)
          return
        case 'ArrowUp':
        case 'w':
        case 'W':
          event.preventDefault()
          step(-1)
          return
        case 'Enter':
        case ' ':
          // `preventDefault` aqui não é zelo: sem ele o botão em foco
          // dispararia o próprio clique logo depois, e o gesto valeria
          // duas vezes — duas confirmações, dois sons.
          event.preventDefault()
          live.current.onConfirm?.(live.current.index)
          return
        default:
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, step])

  // Controle. Um laço de quadro, porque a API de gamepad é de sondagem —
  // não há evento para "o direcional foi pressionado".
  useEffect(() => {
    if (!enabled) return
    let frame = 0
    let held = 0
    let repeatAt = 0
    let confirmHeld = false

    const tick = () => {
      frame = requestAnimationFrame(tick)
      const pads = navigator.getGamepads?.() ?? []
      const pad = [...pads].find((p) => p && p.connected)
      if (!pad) {
        held = 0
        confirmHeld = false
        return
      }

      const eixo = pad.axes[STICK_Y] ?? 0
      const direcao =
        pad.buttons[DPAD_DOWN]?.pressed || eixo > STICK_THRESHOLD
          ? 1
          : pad.buttons[DPAD_UP]?.pressed || eixo < -STICK_THRESHOLD
            ? -1
            : 0

      const agora = performance.now()
      if (direcao === 0) {
        held = 0
      } else if (held !== direcao) {
        // Primeira pressão: anda um e espera mais antes de repetir, senão
        // um toque no direcional atravessa a lista inteira.
        held = direcao
        repeatAt = agora + REPEAT_FIRST
        step(direcao)
      } else if (agora >= repeatAt) {
        repeatAt = agora + REPEAT_NEXT
        step(direcao)
      }

      const confirma = pad.buttons[CONFIRM_BUTTON]?.pressed ?? false
      if (confirma && !confirmHeld) live.current.onConfirm?.(live.current.index)
      confirmHeld = confirma
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [enabled, step])

  const itemProps = useCallback(
    (i: number) => ({
      ref: (node: HTMLElement | null) => {
        nodes.current[i] = node
      },
      onMouseEnter: () => setIndex(i),
      onFocus: () => setIndex(i),
    }),
    [setIndex],
  )

  return { index, resting, setIndex, itemProps }
}
