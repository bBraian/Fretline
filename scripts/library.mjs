/**
 * Verifica o caminho da pasta local: a música em `songs/` aparece na lista,
 * carrega o áudio e é jogável.
 *
 * É o que os testes do engine não podem cobrir — a varredura da pasta, o
 * servidor que a serve, e o `song.ini` sendo lido por cima do chart.
 */

import { chromium } from 'playwright'
import { serve } from './serve.mjs'

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

const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
page.on('pageerror', (e) => problems.push(`exceção: ${e.message}`))

await page.goto(`${BASE}/?debug&lowfx`, { waitUntil: 'networkidle' })

const index = await page.evaluate(() => fetch('/library/index.json').then((r) => r.json()))
console.log(`✓ pasta servida: ${index.root}`)
console.log(`✓ ${index.songs.length} pasta(s) com chart: ${index.songs.map((s) => s.id).join(', ')}`)
if (index.songs.length === 0) problems.push('nenhuma pasta de música encontrada em songs/')

await page.getByRole('button', { name: /Tocar/ }).first().click()
await page.getByRole('heading', { name: 'Escolha a música' }).waitFor()

const row = page.locator('.song-row', { hasText: 'Teste Local' })
await row.waitFor({ timeout: 10000 })
console.log('✓ a música aparece na lista')

// O `song.ini` precisa ter tido precedência sobre o chart.
const text = await row.innerText()
if (!text.includes('Fretline')) problems.push('o artista do song.ini não apareceu')
if (!text.includes('.chart')) problems.push('o formato detectado não apareceu')

await row.click()
await page.getByRole('button', { name: /^Tocar em/ }).click()
await page.waitForFunction(() => !document.body.innerText.includes('Afinando'), null, {
  timeout: 45000,
})
console.log('✓ o áudio da pasta decodificou')

const info = await page.evaluate(() => {
  const { chart, player } = window.__fretline
  return { notes: chart.notes.length, duration: Math.round(player.duration) }
})
console.log(`✓ ${info.notes} notas, ${info.duration}s de áudio`)
if (info.notes === 0) problems.push('o chart carregou sem notas')
if (info.duration === 0) problems.push('o áudio carregou com duração zero')

await browser.close()
await server?.close()

if (problems.length > 0) {
  console.error('\nProblemas encontrados:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('\nTudo certo.')
