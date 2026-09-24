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

// Na conferência hospedada (`npm run hosted`) o índice vem do host de
// assets, pelo mesmo caminho que o jogo faz.
const assets = process.env.VITE_ASSETS_BASE?.replace(/\/+$/, '')
const indexUrl = assets ? `${assets}/library.json` : '/library/index.json'
const index = await page.evaluate((url) => fetch(url).then((r) => r.json()), indexUrl)
console.log(assets ? `✓ índice do host: ${indexUrl}` : `✓ pasta servida: ${index.root}`)
console.log(`✓ ${index.songs.length} pasta(s) com chart: ${index.songs.map((s) => s.id).join(', ')}`)
if (index.songs.length === 0) problems.push('nenhuma pasta de música encontrada em songs/')

await page.getByRole('button', { name: /Tocar/ }).first().click()
await page.getByRole('heading', { name: 'Escolha a música' }).waitFor()

if (assets && (await page.getByRole('button', { name: /Reler a pasta/ }).count()) > 0) {
  problems.push('o botão "Reler a pasta songs/" apareceu na versão hospedada')
}

// A primeira da lista, e não uma música pelo nome: o catálogo é a pasta,
// e a pasta muda. O que se confere é a corrente — varredura, servidor,
// `song.ini` por cima do chart — não qual música está lá dentro.
const row = page.locator('.song-row').first()
await row.waitFor({ timeout: 10000 })
const nome = (await row.innerText()).split('\n')[0]
console.log(`✓ a música aparece na lista: ${nome}`)

// O `song.ini` precisa ter tido precedência sobre o chart: é dele que saem
// o artista e o ano, que nenhum dos dois formatos de chart carrega bem.
const text = await row.innerText()
if (!/\.(chart|mid)\b/i.test(text)) problems.push('o formato detectado não apareceu')
if (!/·/.test(text)) problems.push('a linha da música saiu sem metadados')

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
