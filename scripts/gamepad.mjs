/**
 * Confere que o jogo inteiro se navega de controle: menu, loja, ajustes,
 * lista de músicas e a pausa, com o volume dela.
 *
 * O controle é de mentira — `navigator.getGamepads` devolve um retrato que o
 * script escreve —, mas o caminho a partir dali é o de verdade: o laço de
 * `ui/gamepadNav.ts` lê o retrato a cada quadro, como leria o de um controle
 * ligado no cabo.
 *
 * Confere também o sorteio do palco pelos cenários que o navegador pede:
 * recomeçar pede o mesmo, uma música nova pede outro.
 */

import { chromium } from 'playwright'
import { serve } from './serve.mjs'
import { passarAbertura } from './abertura.mjs'

const external = process.env.BASE_URL
const server = external ? null : await serve()
const BASE = external ?? server.url
const problems = []

const A = 0
const B = 1
const SELECT = 8
const UP = 12
const DOWN = 13
const LEFT = 14
const RIGHT = 15

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => problems.push(`exceção: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text()}`)
})

const palcos = []
page.on('request', (r) => {
  const m = r.url().match(/\/models\/stages\/([^/?]+)/)
  if (m) palcos.push(decodeURIComponent(m[1]))
})

await page.addInitScript(() => {
  const pad = { connected: false, buttons: Array(17).fill(false), axes: [0, 0, 0, 0] }
  window.__pad = pad
  const retrato = () => ({
    id: 'Controle de teste (STANDARD GAMEPAD)',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: performance.now(),
    buttons: pad.buttons.map((p) => ({ pressed: p, touched: p, value: p ? 1 : 0 })),
    axes: [...pad.axes],
  })
  navigator.getGamepads = () => (pad.connected ? [retrato(), null, null, null] : [null, null, null, null])

  // Como o véu da loja nasce: o primeiro quadro da tela já precisa estar
  // coberto, e o carregamento pode terminar antes de o script olhar.
  window.__veuAoNascer = []
  new MutationObserver((mudancas) => {
    for (const mudanca of mudancas) {
      for (const no of mudanca.addedNodes) {
        const veu = no.nodeType === 1 ? no.querySelector?.('.picker-loading') : null
        if (veu) window.__veuAoNascer.push(veu.getAttribute('data-hidden'))
      }
    }
  }).observe(document, { subtree: true, childList: true })
  window.__conectar = () => {
    pad.connected = true
    const evento = new Event('gamepadconnected')
    Object.defineProperty(evento, 'gamepad', { value: retrato() })
    window.dispatchEvent(evento)
  }
})

/** Um toque: aperta, segura alguns quadros, solta. */
async function tocar(botao) {
  await page.evaluate((b) => (window.__pad.buttons[b] = true), botao)
  await page.waitForTimeout(90)
  await page.evaluate((b) => (window.__pad.buttons[b] = false), botao)
  await page.waitForTimeout(140)
}

const focado = () =>
  page.evaluate(() => {
    const el = document.activeElement
    return el && el !== document.body ? (el.textContent || el.getAttribute('aria-label') || el.tagName).trim() : null
  })

/** Desce no menu principal até o item pedido estar em foco, e o abre. */
async function abrirDoMenu(nome) {
  await page.getByRole('heading', { name: 'FRETLINE' }).waitFor({ timeout: 10000 })
  for (let i = 0; i < 6 && !(await focado())?.includes(nome); i++) await tocar(DOWN)
  confere((await focado())?.includes(nome), `o direcional chega em ${nome}`)
  await tocar(A)
}

function confere(condicao, descricao) {
  if (condicao) console.log(`✓ ${descricao}`)
  else problems.push(descricao)
}

// `?debug` traz a faixa de demonstração, que toca sem baixar nada.
await page.goto(`${BASE}/?debug&lowfx`, { waitUntil: 'networkidle' })
await passarAbertura(page)
await page.getByRole('heading', { name: 'FRETLINE' }).waitFor()
await page.evaluate(() => window.__conectar())
await page.waitForTimeout(200)

// --- menu principal ---------------------------------------------------------
await tocar(DOWN)
confere((await focado())?.includes('Tocar'), 'o direcional anda no menu principal')
await tocar(A)
await page.getByRole('heading', { name: 'Escolha a música' }).waitFor({ timeout: 5000 })
console.log('✓ A confirma: abriu a lista de músicas')

// Esquerda e direita mudam a dificuldade na lista.
const dificuldade = () => page.locator('.segmented button[data-active="true"]').first().textContent()
const antes = await dificuldade()
await tocar(RIGHT)
const depois = await dificuldade()
confere(antes !== depois, `a seta lateral muda a dificuldade (${antes} → ${depois})`)
await tocar(LEFT)

await tocar(B)
await page.getByRole('heading', { name: 'FRETLINE' }).waitFor({ timeout: 5000 })
console.log('✓ B volta ao menu')

// --- personagens ---------------------------------------------------------------
await abrirDoMenu('Personagem')
await page.getByRole('heading', { name: 'Quem sobe no palco' }).waitFor({ timeout: 5000 })
const veu = page.locator('.picker-loading')
const aoNascer = await page.evaluate(() => window.__veuAoNascer.at(-1))
confere(aoNascer === 'false', 'o visor já nasce coberto pelo véu')
await page.waitForFunction(() => document.querySelector('.picker-loading')?.getAttribute('data-hidden') === 'true', null, {
  timeout: 60000,
})
console.log('✓ o véu sai quando o personagem está pronto')

await tocar(DOWN) // o primeiro toque só mostra onde está o foco
const primeiro = await focado()
await tocar(DOWN)
const segundo = await focado()
confere(primeiro && segundo && primeiro !== segundo, `o direcional anda pela lista da loja (${segundo})`)
await tocar(A)
await page.waitForTimeout(60)
confere((await veu.getAttribute('data-hidden')) === 'false', 'trocar de personagem cobre o visor na hora')
await page.screenshot({ path: 'scripts/gamepad-troca.png' })
await page.waitForFunction(() => document.querySelector('.picker-loading')?.getAttribute('data-hidden') === 'true', null, {
  timeout: 60000,
})
console.log('✓ o personagem novo entra pronto')
await tocar(B)
await page.getByRole('heading', { name: 'FRETLINE' }).waitFor({ timeout: 5000 })

// --- ajustes ------------------------------------------------------------------
await abrirDoMenu('Ajustes')
await page.getByRole('heading', { name: 'Ajustes' }).waitFor({ timeout: 5000 })
await tocar(DOWN) // foco no nível ativo
await tocar(DOWN) // velocidade do braço
const velocidade = () => page.locator('input[type="range"]').first().inputValue()
const v0 = Number(await velocidade())
await tocar(RIGHT)
const v1 = Number(await velocidade())
confere(v1 > v0, `a direita mexe no controle deslizante (${v0} → ${v1})`)
await tocar(LEFT)
await tocar(B)
await page.getByRole('heading', { name: 'FRETLINE' }).waitFor({ timeout: 5000 })

// --- a música e a pausa -------------------------------------------------------
/**
 * Espera a partida que acabou de montar começar a contagem. O gancho é
 * apagado antes: a tela anterior deixa o dela para trás, ainda tocando.
 */
async function esperarPartida(acao) {
  await page.evaluate(() => delete window.__fretline)
  await acao()
  await page.waitForFunction(() => window.__fretline?.player?.now() > -2.5, null, { timeout: 60000 })
  await page.waitForTimeout(300)
  return page.evaluate(() => window.__fretline.stage)
}

async function abrirMusica() {
  await abrirDoMenu('Tocar')
  await page.getByRole('heading', { name: 'Escolha a música' }).waitFor({ timeout: 5000 })
  return esperarPartida(() => tocar(A))
}

const primeiroPalco = await abrirMusica()
console.log(`✓ a música começou, no palco ${primeiroPalco}`)

await tocar(SELECT)
await page.getByRole('heading', { name: 'Pausado' }).waitFor({ timeout: 5000 })
console.log('✓ Select pausa (o Start é do star power no padrão)')
confere((await focado()) === 'Continuar', '"Continuar" já vem em foco')

// Na pausa o controle é do painel: nada do que se aperta aqui — o
// direcional é strum no padrão — pode chegar à sessão.
await page.evaluate(() => {
  const session = window.__fretline.session
  const original = session.handleInput.bind(session)
  window.__entradas = 0
  session.handleInput = (event) => {
    window.__entradas++
    return original(event)
  }
})
await page.waitForTimeout(450) // a folga depois de a navegação ser solta
await tocar(DOWN)
await tocar(DOWN)
await tocar(DOWN)
confere((await focado())?.includes('%') || (await page.evaluate(() => document.activeElement?.type)) === 'range', 'o direcional chega ao volume')
await page.screenshot({ path: 'scripts/gamepad-pausa.png' })
const volume = () => page.locator('.pause-volume .field-value').textContent()
const vol0 = await volume()
await tocar(LEFT)
await tocar(LEFT)
const vol1 = await volume()
confere(vol0 !== vol1, `a esquerda baixa o volume (${vol0} → ${vol1})`)
const aplicado = await page.evaluate(() => window.__mixerVolume?.())
confere(Math.round(aplicado * 100) + '%' === vol1, `a mesa aplicou o volume (${Math.round(aplicado * 100)}%)`)
const entradas = await page.evaluate(() => window.__entradas)
confere(entradas === 0, `os botões na pausa não chegaram à sessão (${entradas})`)

await tocar(B)
await page.getByRole('heading', { name: 'Pausado' }).waitFor({ state: 'detached', timeout: 5000 })
console.log('✓ B retoma a música')

// Recomeçar: a mesma apresentação, o mesmo palco.
await tocar(SELECT)
await page.getByRole('heading', { name: 'Pausado' }).waitFor({ timeout: 5000 })
await page.waitForTimeout(450)
await tocar(DOWN) // "Recomeçar"
confere((await focado()) === 'Recomeçar', 'o direcional anda no painel da pausa')
const palcoRecomecado = await esperarPartida(() => tocar(A))
confere(palcoRecomecado === primeiroPalco, `recomeçar mantém o palco (${palcoRecomecado})`)

// Sair e tocar de novo pela lista: outra apresentação, outro palco.
await tocar(SELECT)
await page.getByRole('heading', { name: 'Pausado' }).waitFor({ timeout: 5000 })
await page.waitForTimeout(450)
await tocar(DOWN)
await tocar(DOWN) // "Sair da música"
await tocar(A)
await page.getByRole('heading', { name: 'Escolha a música' }).waitFor({ timeout: 5000 })
await tocar(B)
const outroPalco = await abrirMusica()
confere(outroPalco !== primeiroPalco, `uma música nova sorteia outro palco (${primeiroPalco} → ${outroPalco})`)
confere(palcos.length > 0, `o navegador pediu os cenários sorteados (${[...new Set(palcos)].join(', ')})`)

await browser.close()
await server?.close()

if (problems.length) {
  console.error('\n✗ problemas:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('\n✓ o jogo se navega de controle')
