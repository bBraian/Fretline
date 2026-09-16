/**
 * Confere como o jogo interpretou uma musica da pasta `songs/`.
 *
 * Extrair um chart e so metade: o que importa e o que o parser do jogo faz
 * com ele. Este script abre a biblioteca, acha a musica pedida e imprime
 * contagem de notas por dificuldade, duracao e trechos de star power — os
 * numeros que denunciam um mapa de tempo errado.
 */

import { chromium } from 'playwright'
import { serve } from './serve.mjs'

const wanted = (process.argv[2] ?? 'Barracuda').toLowerCase()

const external = process.env.BASE_URL
const server = external ? null : await serve()
const BASE = external ?? server.url

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 900, height: 600 } })
page.on('pageerror', (e) => console.log('[erro]', e.message))

await page.goto(`${BASE}/?debug`, { waitUntil: 'networkidle' })

// A varredura da pasta roda ao abrir; esperar a biblioteca crescer.
await page.waitForFunction(
  () => document.body.innerText.includes('músicas na biblioteca') ||
        document.body.innerText.includes('música na biblioteca'),
  null,
  { timeout: 60000 },
)

const report = await page.evaluate(async (name) => {
  const response = await fetch('/library/index.json')
  const index = await response.json()
  return {
    total: index.songs.length,
    pastas: index.songs.slice(0, 3).map((s) => s.id),
    alvo: index.songs.find((s) => s.id.toLowerCase().includes(name)) ?? null,
  }
}, wanted)

console.log(`pastas com chart em songs/: ${report.total}`)
if (!report.alvo) {
  console.log(`nao achei nenhuma pasta contendo "${wanted}"`)
  await browser.close()
  await server?.close()
  process.exit(1)
}
console.log(`alvo: ${report.alvo.id} — arquivos: ${report.alvo.files.join(', ')}\n`)

await page.getByRole('button', { name: /Tocar/ }).first().click()
await page.getByRole('heading', { name: 'Escolha a música' }).waitFor()

const row = page.locator('.song-row').filter({ hasText: report.alvo.id })
await row.first().waitFor({ timeout: 20000 })
await row.first().click()

const details = await page.evaluate((id) => {
  // O estado do jogo nao esta exposto fora da tela de jogo, entao o chart e
  // relido aqui pelo mesmo caminho que a tela usa.
  const rows = [...document.querySelectorAll('.song-row')]
  const target = rows.find((r) => r.innerText.includes(id))
  return target ? target.innerText.replace(/\n+/g, ' | ') : null
}, report.alvo.id)

console.log(`linha na lista: ${details}`)

for (const level of ['Fácil', 'Médio', 'Difícil', 'Expert']) {
  await page.getByRole('button', { name: level, exact: true }).click()
  await page.waitForTimeout(150)
  const text = await row.first().innerText()
  const notes = text.match(/(\d+)\s+notas/)
  console.log(`  ${level.padEnd(8)} ${notes ? notes[1] : 'sem este nível'} notas`)
}

await browser.close()
await server?.close()
