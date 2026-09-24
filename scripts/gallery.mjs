/**
 * Galeria: fotografa cada guitarra e cada personagem na tela de seleção.
 *
 * Serve para conferir a modelagem de um item por vez sem ter que navegar o
 * jogo à mão a cada ajuste de silhueta. Não verifica nada.
 */

import { chromium } from 'playwright'
import { serve } from './serve.mjs'
import { passarAbertura } from './abertura.mjs'

const external = process.env.BASE_URL
const server = external ? null : await serve()
const BASE = external ?? server.url

const only = process.argv[2] ?? 'all'

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

// Tudo liberado e dinheiro de sobra, para a galeria alcançar todos os itens.
await page.addInitScript(() => {
  localStorage.setItem(
    'fretline:v1',
    JSON.stringify({
      profile: {
        money: 999999,
        ownedGuitars: ['*'],
        ownedCharacters: ['*'],
      },
    }),
  )
})

page.on('pageerror', (error) => console.log('[pageerror]', error.message))
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text().slice(0, 300)))

await page.goto(`${BASE}/?still`, { waitUntil: 'networkidle' })
await passarAbertura(page)

/**
 * Espera o modelo estar na tela: o visor fica coberto por um véu até ele
 * estar pronto, e o véu sai em 200 ms.
 */
async function modeloPronto() {
  await page.waitForTimeout(50)
  await page.waitForFunction(() => document.querySelector('.picker-loading')?.dataset.hidden === 'true', null, {
    timeout: 60000,
  })
  await page.waitForTimeout(300)
}

async function shootList(screenButton, prefix) {
  await page.getByRole('button', { name: screenButton }).first().click()
  await page.locator('.picker-row').first().waitFor()

  const rows = await page.locator('.picker-row').count()
  for (let i = 0; i < rows; i++) {
    const row = page.locator('.picker-row').nth(i)
    const name = (await row.locator('strong').innerText()).trim()
    await row.click()
    await modeloPronto()
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    await page.locator('.picker-stage').screenshot({ path: `scripts/gallery-${prefix}-${slug}.png` })
    console.log(`  ${prefix}: ${name}`)
  }

  await page.getByRole('button', { name: /Voltar/ }).click()
}

if (only === 'all' || only === 'guitars') await shootList(/Guitarra/, 'guitar')
if (only === 'all' || only === 'characters') await shootList(/Personagem/, 'char')

await browser.close()
await server?.close()
console.log('Galeria salva em scripts/gallery-*.png')
