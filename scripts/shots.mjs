/**
 * Percorre cada plano do diretor de câmera e fotografa.
 *
 * O diretor sorteia planos durante a música, então esperar o ângulo que se
 * quer conferir aparecer é loteria. Com `?shot=<id>` o plano fica travado, e
 * este script visita todos em sequência.
 */

import { chromium } from 'playwright'
import { serve } from './serve.mjs'
import { passarAbertura } from './abertura.mjs'

const external = process.env.BASE_URL
const server = external ? null : await serve()
const BASE = external ?? server.url

const SHOTS = [
  'wide',
  'guitar-hero',
  'guitar-hands',
  'guitar-orbit',
  'drummer',
  'bassist',
  'singer',
  'crowd',
  'truss',
  'dolly',
]

const browser = await chromium.launch({
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader',
    '--use-gl=swiftshader',
  ],
})

for (const shot of SHOTS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.addInitScript(() => {
    localStorage.setItem(
      'fretline:v1',
      JSON.stringify({ settings: { noFail: true, difficulty: 'hard' } }),
    )
  })

  // Palco fixo: o jogo sorteia um por música, e as fotos só se comparam
  // umas com as outras no mesmo cenário.
  await page.goto(`${BASE}/?debug&shot=${shot}&stage=club`, { waitUntil: 'networkidle' })
  await passarAbertura(page)
  await page.getByRole('button', { name: /Tocar/ }).first().click()
  await page.getByRole('button', { name: /^Tocar em/ }).click()
  await page.waitForFunction(() => !document.body.innerText.includes('Afinando'), null, {
    timeout: 90000,
  })

  // Deixa a música andar até o refrão, onde há mais luz e movimento.
  await page.waitForTimeout(12000)
  await page.screenshot({ path: `scripts/cam-${shot}.png` })
  console.log(`  ${shot}`)
  await page.close()
}

await browser.close()
await server?.close()
console.log('Planos salvos em scripts/cam-*.png')
