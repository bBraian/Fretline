/**
 * Fotografa as telas de menu, para conferência visual.
 */

import { chromium } from 'playwright'
import { serve } from './serve.mjs'
import { passarAbertura } from './abertura.mjs'

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

// A abertura pronta, antes de passar por ela.
await page.getByText(/Pressione/).waitFor({ timeout: 120000 })
await page.screenshot({ path: 'scripts/menu-abertura.png' })
console.log('  abertura')
await passarAbertura(page)

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

// A espera antes do palco, com a rede estrangulada para ela durar o
// bastante para ser vista — e o que ela promete: Esc desiste.
await page.getByRole('button', { name: /Tocar/ }).first().click()
await page.getByRole('heading', { name: 'Escolha a música' }).waitFor()
const cdp = await page.context().newCDPSession(page)
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 40,
  downloadThroughput: (4 * 1024 * 1024) / 8,
  uploadThroughput: (1024 * 1024) / 8,
})
await page.getByRole('button', { name: /^Tocar em/ }).click()
await page.getByText(/Baixando a música \d/).waitFor({ timeout: 20000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'scripts/menu-afinando.png' })
console.log('  afinando')

await page.keyboard.press('Escape')
await page.getByRole('heading', { name: 'Escolha a música' }).waitFor({ timeout: 5000 })
if (await page.getByText('Não deu').count()) throw new Error('cancelar mostrou o painel de erro')
console.log('  Esc cancela o carregamento')
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
})

// Uma faixa que não chega: o erro de rede, e "Tentar de novo" carregando.
const audio = /\.(opus|ogg|mp3)(\?|$)/
await page.route(audio, (route) => route.abort())
await page.getByRole('button', { name: /^Tocar em/ }).click()
await page.getByRole('button', { name: 'Tentar de novo' }).waitFor({ timeout: 20000 })
await page.screenshot({ path: 'scripts/menu-afinando-erro.png' })
console.log('  afinando-erro')
await page.unroute(audio)
await page.getByRole('button', { name: 'Tentar de novo' }).click()
await page.waitForFunction(
  () => !document.body.innerText.includes('Afinando') && !document.body.innerText.includes('Não deu'),
  null,
  { timeout: 60000 },
)
console.log('  tentar de novo carrega')

// A abertura no meio da barra: sem cache e com a rede estrangulada, para
// os modelos descerem devagar o bastante para serem vistos.
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 40,
  downloadThroughput: (8 * 1024 * 1024) / 8,
  uploadThroughput: (1024 * 1024) / 8,
})
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.getByText(/\d+,\d \/ \d+,\d MB/).waitFor({ timeout: 30000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'scripts/menu-abertura-baixando.png' })
console.log('  abertura-baixando')
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
})
await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
await passarAbertura(page)

await browser.close()
await server?.close()
console.log('Telas salvas em scripts/menu-*.png')
