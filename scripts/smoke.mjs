/**
 * Teste de fumaça: abre o jogo num navegador de verdade, toca a faixa de
 * demonstração corretamente e confere que pontuação, multiplicador e star
 * power responderam.
 *
 * Existe porque o engine é testado sem navegador de propósito, e há coisas
 * que só um navegador mostra: WebGL subindo, o áudio sintetizado
 * renderizando, os eventos de teclado atravessando o gerenciador de input e
 * chegando à sessão com o carimbo de tempo certo.
 *
 * O jogo é tocado por um piloto automático injetado na página, que lê o
 * chart pelo gancho de depuração e dispara eventos de teclado nos tempos
 * corretos — o mesmo caminho que um teclado de verdade percorre. Não há
 * palhetada: as notas são tocadas nos trastes, e as abertas soltando todos.
 */

import { chromium } from 'playwright'
import { serve } from './serve.mjs'
import { passarAbertura } from './abertura.mjs'

// Sem BASE_URL, o script constrói e sobe o próprio servidor.
const external = process.env.BASE_URL
const server = external ? null : await serve()
const BASE = external ?? server.url
const problems = []

const browser = await chromium.launch({
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader',
    '--use-gl=swiftshader',
  ],
})

// Viewport pequeno de propósito: o navegador headless rasteriza por
// software, e a 1440×900 o render bloqueia a thread principal a ponto de o
// próprio piloto automático atrasar. Isso mediria o rasterizador, não o jogo.
const page = await browser.newPage({ viewport: { width: 480, height: 270 } })

page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => problems.push(`exceção: ${error.message}`))

await page.goto(`${BASE}/?lang=pt&debug&lowfx`, { waitUntil: 'networkidle' })
await passarAbertura(page)

await page.getByRole('heading', { name: 'FRETLINE' }).waitFor({ timeout: 15000 })
console.log('✓ menu carregou')

await page.getByRole('button', { name: /Tocar/ }).first().click()
await page.getByRole('heading', { name: 'Escolha a música' }).waitFor()
console.log('✓ lista de músicas')

await page.getByRole('button', { name: /^Tocar em/ }).click()

await page.waitForFunction(() => !document.body.innerText.includes('Afinando'), null, {
  timeout: 60000,
})
console.log('✓ áudio pronto')

const canvas = await page.evaluate(() => {
  const el = document.querySelector('canvas')
  return el ? { w: el.width, h: el.height } : null
})
if (!canvas || canvas.w === 0) problems.push('canvas não foi dimensionado')
else console.log(`✓ canvas ${canvas.w}×${canvas.h}`)

// Uma captura no meio da música, enquanto o braço está cheio, serve de
// conferência visual do render — a tela de resultado não mostra nada disso.
void page
  .waitForTimeout(14000)
  .then(() => page.screenshot({ path: 'scripts/smoke-highway.png' }))
  // A música pode acabar antes; nesse caso a página já fechou e não há nada
  // a capturar.
  .catch(() => {})

// Piloto automático: dispara os eventos de teclado nos tempos do chart.
const result = await page.evaluate(async () => {
  const debug = window.__fretline
  if (!debug) return { error: 'gancho de depuração ausente' }

  const { session, player, chart, scene } = debug

  // O palco sai do desenho durante o teste.
  //
  // Não é para o teste passar mais fácil: é que o navegador headless
  // rasteriza por software, e o show — painel de LED, banda, plateia —
  // consome quase todo o quadro. Com a thread principal travada em rajadas,
  // o próprio piloto automático atrasa e a medição vira um teste do
  // rasterizador, não da corrente que importa aqui: relógio de áudio,
  // input, julgamento e notas. O palco é conferido pelas capturas visuais,
  // que é onde ele de fato precisa ser olhado.
  scene.setVisible('stage', false)
  const FRET_KEYS = ['KeyA', 'KeyS', 'KeyJ', 'KeyK', 'KeyL']

  const send = (type, code) =>
    window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }))

  let held = new Set()

  // Solta tudo antes de apertar, sempre. Sem palhetada, só a transição de
  // solto para pressionado resolve nota, então duas notas seguidas no mesmo
  // traste exigem o release no meio. Soltar tudo também é como se toca uma
  // nota aberta.
  const setFrets = (wanted) => {
    for (const code of held) send('keyup', code)
    for (const code of wanted) send('keydown', code)
    held = wanted
  }

  let index = 0
  let activated = false
  let frames = 0
  let maxGap = 0
  let lastTick = performance.now()
  const rafCount = () => { frames++; requestAnimationFrame(rafCount) }
  requestAnimationFrame(rafCount)
  const startedAt = performance.now()
  const deadline = performance.now() + 40000

  // Um temporizador curto, e não requestAnimationFrame: o piloto precisa ser
  // mais preciso que a taxa de quadros, ainda mais num navegador headless
  // rasterizando por software. Acoplar o input ao render mediria o
  // rasterizador, não o jogo.
  await new Promise((resolve) => {
    const tick = () => {
      const wall = performance.now()
      maxGap = Math.max(maxGap, wall - lastTick)
      lastTick = wall
      const now = player.now()

      // Ativa o star power assim que houver medidor suficiente, para o
      // teste cobrir também esse caminho.
      if (!activated && session.getState().starPowerAmount >= 0.5) {
        send('keydown', 'Space')
        send('keyup', 'Space')
        activated = true
      }

      while (index < chart.notes.length && chart.notes[index].time <= now + 0.008) {
        const note = chart.notes[index]
        const wanted = new Set()
        if (!note.isOpen) {
          for (let i = 0; i < 5; i++) if (note.frets & (1 << i)) wanted.add(FRET_KEYS[i])
        }
        setFrets(wanted)
        index++
      }

      const state = session.getState()
      if (state.finished || state.failed || performance.now() > deadline) {
        clearInterval(timer)
        resolve()
      }
    }
    const timer = setInterval(tick, 4)
  })

  const state = session.getState()
  return {
    fps: Math.round((frames * 1000) / (performance.now() - startedAt)),
    maxGapMs: Math.round(maxGap),
    score: state.score,
    notesHit: state.notesHit,
    notesTotal: state.notesTotal,
    notesSeen: state.notesSeen,
    maxMultiplier: state.multiplier,
    longestStreak: state.longestStreak,
    rockMeter: state.rockMeter,
    starPowerUsed: activated,
    failed: state.failed,
    finished: state.finished,
  }
})

if (result.error) {
  problems.push(result.error)
} else {
  // O número de quadros aqui mede o rasterizador por software do navegador
  // headless, não a máquina de quem joga; serve só para explicar a precisão.
  console.log(`  ${result.fps} fps no rasterizador por software, maior atraso do piloto ${result.maxGapMs} ms`)
  const accuracy = result.notesSeen > 0 ? result.notesHit / result.notesSeen : 0
  console.log(
    `✓ tocou: ${result.notesHit}/${result.notesSeen} notas vistas ` +
      `(${Math.round(accuracy * 100)}%), ${result.score} pontos, ` +
      `maior corrente ${result.longestStreak}`,
  )
  console.log(`✓ medidor ao fim: ${Math.round(result.rockMeter * 100)}%`)
  console.log(`✓ star power ativado: ${result.starPowerUsed ? 'sim' : 'não'}`)

  // Com o palco fora do desenho, o piloto automático toca quase perfeito, e
  // um limiar alto volta a ser honesto: qualquer defeito no julgamento
  // derruba isso de imediato.
  if (result.score <= 0) problems.push('o placar não saiu do zero')
  if (accuracy < 0.95) problems.push(`precisão baixa demais para um piloto automático: ${Math.round(accuracy * 100)}%`)
  if (result.failed) problems.push('o piloto automático falhou a música')
  if (result.longestStreak < 20) problems.push('a corrente de acertos não se sustentou')
  if (!result.starPowerUsed) problems.push('o medidor de star power nunca encheu')
}

await page.screenshot({ path: 'scripts/smoke-gameplay.png' })
console.log('✓ captura salva em scripts/smoke-gameplay.png')

await browser.close()
await server?.close()

if (problems.length > 0) {
  console.error('\nProblemas encontrados:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log('\nTudo certo.')
