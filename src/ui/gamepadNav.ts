/**
 * O controle nos menus, num lugar só.
 *
 * Antes cada tela que quisesse controle sondava o próprio: a lista de
 * músicas e a carreira tinham um laço, a abertura outro, e o resto — menu
 * principal, loja, ajustes, a pausa — simplesmente não respondia. Quem
 * chegava de controle na mão passava da abertura e ficava parado no menu.
 *
 * Agora um laço só, montado no roteador, lê o controle e **fala teclado**:
 * o direcional vira setas, A vira Enter e B vira Esc. As telas continuam
 * ouvindo só o teclado, e o que já funcionava com ele passa a funcionar com
 * o controle sem uma linha a mais — o Esc de cada tela é o voltar dela, a
 * pausa responde ao Esc, a lista anda com as setas.
 *
 * Tecla sintética não tem efeito padrão: um Enter de mentira sobre um botão
 * não o clica, uma seta não mexe num controle deslizante. Então, quando
 * ninguém tratou a tecla (`defaultPrevented` continua falso), é esta camada
 * que faz o que o teclado de verdade faria: clica o botão em foco, anda o
 * foco para o vizinho naquela direção (`spatialNav.ts`), mexe no controle
 * deslizante ou na lista de opções.
 *
 * Durante a música A e B são trastes, e a tela de jogo **segura** a
 * navegação (`holdGamepadNav`). Os ajustes seguram também enquanto esperam
 * o botão a ser gravado.
 */

import { useEffect, useRef } from 'react'
import { PadNavigator, type Direction, type NavIntent, type PadSnapshot } from '../input/padNav'
import { pickInDirection } from './spatialNav'
import { mixer } from '../audio/mixer'

/**
 * Quanto a navegação ignora os botões depois de ser solta.
 *
 * Ela é solta quando a música para — pausa, vaia —, com o jogador ainda
 * tocando. Um aperto de traste logo depois que o painel aparece não pode
 * valer como "de novo" sem que ele tenha lido o painel.
 */
const GRACE_MS = 400

let holds = 0
let graceUntil = 0

/**
 * Suspende a navegação por controle até a função devolvida ser chamada.
 *
 * Conta quem segura, em vez de um liga-desliga: dois donos que seguram e
 * soltam em ordens diferentes não se desfazem um ao outro.
 */
export function holdGamepadNav(): () => void {
  holds++
  let solto = false
  return () => {
    if (solto) return
    solto = true
    holds--
    if (holds === 0) graceUntil = performance.now() + GRACE_MS
  }
}

const ARROW: Record<Direction, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
}

const FOCUSABLE =
  'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * O que um controle deixa escolher sem foco nenhum na tela, em ordem de
 * preferência: o que a tela marcou para receber o foco, o selecionado de
 * uma lista, o ativo de um controle segmentado, a ação principal.
 */
const PREFERRED = ['[data-autofocus]', '.is-selected', '[data-selected="true"]', '[data-active="true"]', '.btn-primary']

function firstPad(): PadSnapshot | null {
  const pads = navigator.getGamepads?.() ?? []
  for (const pad of pads) {
    if (pad && pad.connected) return { buttons: pad.buttons.map((b) => b.pressed), axes: pad.axes }
  }
  return null
}

/**
 * Onde a navegação acontece: o painel por cima, se houver um, senão a tela.
 *
 * Sem isto, o foco atravessaria o painel da pausa e iria parar num botão
 * que nem se vê atrás dele.
 */
function scope(): HTMLElement {
  const camadas = document.querySelectorAll<HTMLElement>('[role="dialog"], .overlay')
  for (let i = camadas.length - 1; i >= 0; i--) {
    if (visible(camadas[i])) return camadas[i]
  }
  return document.querySelector<HTMLElement>('.screen, .play') ?? document.body
}

function visible(el: HTMLElement) {
  if (el.getClientRects().length === 0) return false
  return getComputedStyle(el).visibility !== 'hidden'
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !(el as HTMLButtonElement).disabled && !el.closest('[inert]') && visible(el),
  )
}

/** O elemento em foco, se ele estiver dentro de `root`. */
function focusedIn(root: HTMLElement): HTMLElement | null {
  const el = document.activeElement
  return el instanceof HTMLElement && el !== document.body && root.contains(el) ? el : null
}

/** O preferido da tela, e se ele foi marcado por ela ou só é o primeiro. */
function preferred(root: HTMLElement): { el: HTMLElement; marked: boolean } | null {
  const todos = focusables(root)
  for (const seletor of PREFERRED) {
    const el = todos.find((candidato) => candidato.matches(seletor))
    if (el) return { el, marked: true }
  }
  return todos[0] ? { el: todos[0], marked: false } : null
}

/**
 * Dispara uma tecla sintética onde o foco estiver, como o teclado faria.
 * Devolve se alguém a tratou.
 */
function press(key: string): boolean {
  const alvo = document.activeElement instanceof HTMLElement ? document.activeElement : document.body
  const event = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true })
  alvo.dispatchEvent(event)
  return event.defaultPrevented
}

/**
 * Mexe no valor de um controle deslizante ou de uma lista de opções.
 *
 * O deslizante anda um vigésimo do curso por toque, e não o `step` dele:
 * o volume tem passo de 1%, e ir de zero a cem no direcional levaria cem
 * toques. Quem quer precisão fina tem o teclado e o mouse.
 *
 * O evento sai do próprio elemento, e o React o recebe como `onChange`:
 * `stepUp` muda o valor por dentro, sem passar pelo `value` que o React
 * vigia, e é essa diferença que ele reconhece como mudança.
 */
function adjust(el: HTMLElement, delta: 1 | -1): boolean {
  if (el instanceof HTMLInputElement && el.type === 'range') {
    const min = Number(el.min || 0)
    const max = Number(el.max || 100)
    const step = Number(el.step) || 1
    const passos = Math.max(1, Math.round((max - min) / 20 / step))
    const antes = el.value
    if (delta > 0) el.stepUp(passos)
    else el.stepDown(passos)
    if (el.value === antes) return true
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }
  if (el instanceof HTMLSelectElement) {
    const next = Math.min(el.options.length - 1, Math.max(0, el.selectedIndex + delta))
    if (next !== el.selectedIndex) {
      el.selectedIndex = next
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    return true
  }
  return false
}

function move(dir: Direction) {
  if (press(ARROW[dir])) return
  const root = scope()
  const atual = focusedIn(root)
  if (!atual) {
    // Nada em foco ainda: o primeiro toque só mostra onde se está.
    preferred(root)?.el.focus()
    return
  }
  if ((dir === 'left' || dir === 'right') && adjust(atual, dir === 'right' ? 1 : -1)) return

  const candidatos = focusables(root).filter((el) => el !== atual)
  const i = pickInDirection(
    atual.getBoundingClientRect(),
    candidatos.map((el) => el.getBoundingClientRect()),
    dir,
  )
  if (i < 0) return
  candidatos[i].focus()
  mixer.play('move')
}

function confirm() {
  if (press('Enter')) return
  const root = scope()
  let el = focusedIn(root)
  if (!el) {
    const escolhido = preferred(root)
    if (!escolhido) return
    escolhido.el.focus()
    // Só age sozinho sobre o que a tela marcou. Sem marca, o primeiro
    // focável pode ser o "Voltar" — e apertar A não pode sair da tela.
    if (!escolhido.marked) return
    el = escolhido.el
  }
  if (el instanceof HTMLSelectElement) {
    adjust(el, 1)
    return
  }
  if (el instanceof HTMLInputElement && el.type === 'range') return
  el.click()
}

function act(intent: NavIntent) {
  // O anel de foco fica visível enquanto se navega de controle; ver
  // `theme.css`. Mouse e teclado de verdade o devolvem ao normal.
  document.documentElement.dataset.nav = 'pad'
  if (intent === 'back') press('Escape')
  else if (intent === 'confirm') confirm()
  else move(intent)
}

/**
 * Liga o controle às telas de menu.
 *
 * `enabled` é falso na abertura, que trata o controle do jeito dela — sai
 * ao soltar qualquer botão. O laço só roda com um controle conectado: o
 * navegador anuncia o controle no primeiro botão apertado, e antes disso
 * não há o que ler.
 */
export function useGamepadNav(enabled: boolean) {
  const ligado = useRef(enabled)
  ligado.current = enabled

  useEffect(() => {
    const nav = new PadNavigator()
    let frame = 0

    const tick = () => {
      frame = requestAnimationFrame(tick)
      const pad = firstPad()
      if (!pad) {
        cancelAnimationFrame(frame)
        frame = 0
        return
      }
      const agora = performance.now()
      if (!ligado.current || holds > 0 || agora < graceUntil) {
        nav.sync(pad)
        return
      }
      for (const intent of nav.read(pad, agora)) act(intent)
    }

    const start = () => {
      if (!frame) frame = requestAnimationFrame(tick)
    }

    const soltar = (event: Event) => {
      if (!event.isTrusted) return
      // O navegador também manda movimento de ponteiro sem o mouse sair do
      // lugar, quando a página rola por baixo dele — e o foco do controle
      // rola a lista. Só vale ponteiro que andou de fato.
      if (event instanceof PointerEvent && event.type === 'pointermove' && !event.movementX && !event.movementY) {
        return
      }
      delete document.documentElement.dataset.nav
    }

    window.addEventListener('gamepadconnected', start)
    window.addEventListener('pointerdown', soltar)
    window.addEventListener('pointermove', soltar)
    window.addEventListener('keydown', soltar)
    // O controle pode já estar conectado — ele sobrevive à troca de tela e
    // a um recarregamento do módulo em desenvolvimento.
    if (firstPad()) start()

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('gamepadconnected', start)
      window.removeEventListener('pointerdown', soltar)
      window.removeEventListener('pointermove', soltar)
      window.removeEventListener('keydown', soltar)
    }
  }, [])
}
