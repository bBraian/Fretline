/**
 * Captura de tela para conferência visual.
 *
 * Separado do teste de fumaça porque as duas coisas querem resoluções
 * opostas: o teste precisa de uma janela pequena para o rasterizador por
 * software não atrasar o piloto automático, e a conferência visual precisa
 * de uma janela grande para valer alguma coisa. Aqui nada é verificado — só
 * se joga um trecho e se fotografa.
 */

import { chromium } from 'playwright'
import { serve } from './serve.mjs'

// Sem BASE_URL, o script constrói e sobe o próprio servidor.
const external = process.env.BASE_URL
const server = external ? null : await serve()
const BASE = external ?? server.url

const browser = await chromium.launch({
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader',
    '--use-gl=swiftshader',
  ],
})

const page = await browser.newPage({ viewport: { width: 1360, height: 765 } })

// Modo sem falha e dificuldade expert: nesta resolução o rasterizador por
// software atrasa o piloto automático o bastante para zerar o medidor, e a
// música acabaria antes da foto. O expert enche mais o braço, que é
// justamente o que se quer conferir.
await page.addInitScript(() => {
  localStorage.setItem(
    'fretline:v1',
    JSON.stringify({ settings: { noFail: true, difficulty: 'expert', noteSpeed: 11 } }),
  )
})

await page.goto(`${BASE}/?debug`, { waitUntil: 'networkidle' })

await page.getByRole('heading', { name: 'FRETLINE' }).waitFor({ timeout: 20000 })
await page.screenshot({ path: 'scripts/shot-menu.png' })

await page.getByRole('button', { name: /Tocar/ }).first().click()
await page.getByRole('heading', { name: 'Escolha a música' }).waitFor()
await page.screenshot({ path: 'scripts/shot-songs.png' })

await page.getByRole('button', { name: /^Tocar em/ }).click()
await page.waitForFunction(() => !document.body.innerText.includes('Afinando'), null, {
  timeout: 90000,
})

// Piloto automático em segundo plano, tolerante a atraso: aqui só importa
// que haja notas acertadas e efeitos na tela na hora da foto.
await page.evaluate(() => {
  const { session, player, chart } = window.__fretline
  const FRET_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG']
  const send = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }))
  let held = new Set()
  let index = 0

  setInterval(() => {
    const now = player.now()
    while (index < chart.notes.length && chart.notes[index].time <= now + 0.01) {
      const note = chart.notes[index]
      const wanted = new Set()
      if (!note.isOpen) {
        for (let i = 0; i < 5; i++) if (note.frets & (1 << i)) wanted.add(FRET_KEYS[i])
      }
      // Solta tudo antes de apertar: só a transição de solto para
      // pressionado resolve nota, e soltar tudo é como se toca a nota aberta.
      for (const code of held) send('keyup', code)
      for (const code of wanted) send('keydown', code)
      held = wanted
      index++
    }
    if (session.getState().starPowerAmount >= 0.5 && !session.getState().starPowerActive) {
      send('keydown', 'Space')
      send('keyup', 'Space')
    }
  }, 4)
})

for (const [label, wait] of [
  ['inicio', 6000],
  ['refrao', 8000],
  ['solo', 8000],
]) {
  await page.waitForTimeout(wait)
  await page.screenshot({ path: `scripts/shot-${label}.png` })
}

await browser.close()
await server?.close()
console.log('Capturas salvas em scripts/shot-*.png')
