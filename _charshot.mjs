import { chromium } from 'playwright'
import { serve } from './scripts/serve.mjs'

const server = await serve()
const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required','--enable-unsafe-swiftshader','--use-gl=swiftshader'],
})

for (const [id, nome] of [
  ['glb-douxie_tales_of_arcadia', 'douglas'],
  ['glb-taylor_swift_band_hero', 'stella'],
  ['glb-kratos', 'kratos'],
]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('pageerror', (e) => console.log(`  ⚠ ${nome}: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' || /adaptar|retarget/i.test(m.text())) console.log(`  · ${nome}: ${m.text()}`) })
  await page.addInitScript((cid) => {
    localStorage.setItem('fretline:v1', JSON.stringify({
      settings: { noFail: true, difficulty: 'hard' },
      profile: { characterId: cid, ownedCharacters: [cid] },
    }))
  }, id)

  await page.goto(`${server.url}/?debug&shot=guitar-hero`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Tocar/ }).first().click()
  await page.getByRole('button', { name: /^Tocar em/ }).click()
  await page.waitForFunction(() => !document.body.innerText.includes('Afinando'), null, { timeout: 90000 })
  await page.waitForTimeout(9000)

  // O clipe casou? Pergunta ao objeto da cena.
  const info = await page.evaluate(() => {
    const g = window.__fretline?.scene
    return g ? 'cena ok' : 'sem gancho'
  })
  await page.screenshot({ path: `scripts/_char-${nome}.png` })
  console.log(`✓ ${nome} (${info})`)
  await page.close()
}
await browser.close()
await server.close?.()
process.exit(0)
