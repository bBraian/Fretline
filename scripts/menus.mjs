/**
 * Fotografa as telas de menu, para conferência visual.
 */

import { chromium } from 'playwright'
import { serve } from './serve.mjs'

const external = process.env.BASE_URL
const server = external ? null : await serve()
const BASE = external ?? server.url

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

await page.addInitScript(() => {
  localStorage.setItem(
    'fretline:v1',
    JSON.stringify({ profile: { money: 42000, ownedGuitars: ['*'], ownedCharacters: ['*'] } }),
  )
})
await page.goto(BASE, { waitUntil: 'networkidle' })

const screens = [
  ['menu', null],
  ['carreira', /Carreira/],
  ['musicas', /Tocar/],
  ['ajustes', /Ajustes/],
]

for (const [name, button] of screens) {
  if (button) {
    await page.getByRole('button', { name: button }).first().click()
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: `scripts/menu-${name}.png` })
  console.log(`  ${name}`)
  if (button) {
    await page.getByRole('button', { name: /Voltar|Menu/ }).first().click()
    await page.waitForTimeout(300)
  }
}

await browser.close()
await server?.close()
console.log('Telas salvas em scripts/menu-*.png')
