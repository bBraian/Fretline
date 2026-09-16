import { chromium } from 'playwright'
import { serve } from './serve.mjs'
const server = await serve()
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader','--use-gl=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
await page.goto(`${server.url}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
await page.getByRole('button', { name: /^Tocar/ }).first().click()
await page.getByRole('heading', { name: 'Escolha a música' }).waitFor()

console.log('musica                                   facil  medio  dificil  expert')
const rows = await page.locator('.song-row').count()
for (let i = 0; i < rows; i++) {
  const counts = []
  for (const level of ['Fácil', 'Médio', 'Difícil', 'Expert']) {
    await page.getByRole('button', { name: level, exact: true }).click()
    await page.waitForTimeout(60)
    const text = await page.locator('.song-row').nth(i).innerText()
    const m = text.match(/(\d+)\s+notas/)
    counts.push(m ? Number(m[1]) : 0)
  }
  const name = (await page.locator('.song-row').nth(i).locator('.song-name').innerText()).trim()
  const dur = (await page.locator('.song-row').nth(i).innerText()).match(/(\d+):(\d\d)/)
  const secs = dur ? Number(dur[1]) * 60 + Number(dur[2]) : 1
  const perSec = counts.map((c) => (c / secs).toFixed(1))
  console.log(`${name.slice(0, 40).padEnd(40)} ${counts.map((c,j) => `${String(c).padStart(4)}(${perSec[j]})`).join(' ')}`)
}
await browser.close(); await server.close()
