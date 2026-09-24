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
import { passarAbertura } from './abertura.mjs'

const args = process.argv.slice(2)
const wanted = (args.find((a) => !a.startsWith('--')) ?? 'Barracuda').toLowerCase()

const external = process.env.BASE_URL
const server = external ? null : await serve()
const BASE = external ?? server.url

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 900, height: 600 } })
page.on('pageerror', (e) => console.log('[erro]', e.message))

await page.goto(`${BASE}/?lang=pt&debug`, { waitUntil: 'networkidle' })
await passarAbertura(page)

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
// A varredura da pasta roda ao abrir; esperar a lista ter alguma coisa.
// O número de músicas do menu não serve: é a dica de "Tocar", e só aparece
// com ele em destaque.
await page.locator('.song-row').first().waitFor({ timeout: 60000 })

// O nome na lista vem do `song.ini`, nao do nome da pasta — os dois
// raramente coincidem num pack baixado.
const displayName = report.alvo.files.includes('song.ini') ? null : report.alvo.id
const filter = displayName ?? wanted.split(/[^a-z0-9]+/i).filter(Boolean).pop()

const matches = await page.evaluate((needle) => {
  return [...document.querySelectorAll('.song-row')]
    .map((r) => r.innerText.replace(/\n+/g, ' | '))
    .filter((text) => text.toLowerCase().includes(needle.toLowerCase()))
}, filter)

console.log(`linhas contendo "${filter}": ${matches.length}`)
for (const text of matches) console.log(`  ${text}`)

// `--linha=N` escolhe entre linhas homonimas; `--tocar` vai ate o jogo.
const rowArg = args.find((a) => a.startsWith('--linha='))
const rowIndex = rowArg ? Number(rowArg.slice('--linha='.length)) : 0

const row = page.locator('.song-row').filter({ hasText: new RegExp(filter, 'i') }).nth(rowIndex)
await row.waitFor({ timeout: 20000 })
// Foco, e não clique: o clique na linha já toca, e aqui ainda se leem os
// níveis antes. O foco move o seletor, e o "Tocar em" toca a escolhida.
await row.focus()

for (const level of ['Fácil', 'Médio', 'Difícil', 'Expert']) {
  await page.getByRole('button', { name: level, exact: true }).click()
  await page.waitForTimeout(150)
  const text = await row.innerText()
  const notes = text.match(/(\d+)\s+notas/)
  console.log(`  ${level.padEnd(8)} ${notes ? notes[1] : 'sem este nível'} notas`)
}

if (args.includes('--tocar')) {
  console.log('\n--- tocando ---')
  await page.getByRole('button', { name: /^Tocar em/ }).click()
  await page.waitForFunction(() => !document.body.innerText.includes('Afinando'), null, {
    timeout: 120000,
  })

  const info = await page.evaluate(async () => {
    const { chart, player, session } = window.__fretline
    // Deixa a musica andar um pouco para conferir que o relogio corre.
    const before = player.now()
    await new Promise((r) => setTimeout(r, 3000))
    return {
      notas: chart.notes.length,
      primeira: chart.notes[0]?.time,
      ultima: chart.notes.at(-1)?.time,
      audio: Math.round(player.duration),
      faixaDeGuitarra: player.hasGuitarStem,
      relogioAndou: +(player.now() - before).toFixed(2),
      notasVistas: session.getState().notesSeen,
    }
  })

  console.log(`  chart: ${info.notas} notas, de ${info.primeira?.toFixed(1)}s a ${info.ultima?.toFixed(1)}s`)
  console.log(`  audio: ${info.audio}s, faixa de guitarra separada: ${info.faixaDeGuitarra ? 'sim' : 'nao'}`)
  console.log(`  relogio andou ${info.relogioAndou}s em 3s de espera`)
  console.log(`  notas ja passadas: ${info.notasVistas}`)
}

await browser.close()
await server?.close()
