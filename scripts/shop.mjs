/** Fotografa a loja: um item já comprado e um ainda bloqueado. */
import { chromium } from 'playwright'
import { serve } from './serve.mjs'

const server = await serve()
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

// Perfil recém-criado: só os itens gratuitos, e pouco dinheiro.
await page.addInitScript(() => {
  localStorage.setItem('fretline:v1', JSON.stringify({ profile: { money: 4000 } }))
})
await page.goto(`${server.url}/?still`, { waitUntil: 'networkidle' })

await page.getByRole('button', { name: /Guitarra/ }).first().click()
await page.locator('.picker-row').first().waitFor()

for (const [label, index] of [
  ['equipada', 0],
  ['a-venda', 2],
  ['bloqueada', 8],
]) {
  await page.locator('.picker-row').nth(index).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `scripts/shop-${label}.png` })
  console.log(`  ${label}: ${(await page.locator('.picker-caption h2').innerText()).trim()}`)
}

await browser.close()
await server.close()
