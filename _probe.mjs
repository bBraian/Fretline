import { chromium } from 'playwright'
import { serve } from './scripts/serve.mjs'
const server = await serve()
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required','--enable-unsafe-swiftshader','--use-gl=swiftshader'] })

for (const [id, nome] of [
  ['glb-goku','Gokê'],
  ['glb-homer_fmv_model_-_the_simpsons_hit__run','Homero'],
  ['glb-spiderman_brand_new_day_from_fortnite','Teixeira'],
  ['glb-fortnite_darth_vader_advanced_rig','Dartes'],
]) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
  const logs = []
  page.on('console', (m) => logs.push(m.text()))
  page.on('pageerror', (e) => logs.push('ERRO ' + e.message))
  await page.addInitScript((cid) => {
    localStorage.setItem('fretline:v1', JSON.stringify({
      settings: { noFail: true, difficulty: 'hard' },
      profile: { characterId: cid, ownedCharacters: [cid] },
    }))
  }, id)
  await page.goto(`${server.url}/?debug&lowfx`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Tocar/ }).first().click()
  await page.getByRole('button', { name: /^Tocar em/ }).click()
  await page.waitForFunction(() => !document.body.innerText.includes('Afinando'), null, { timeout: 90000 })
  await page.waitForTimeout(6000)

  const r = await page.evaluate(() => {
    const g = window.__fretline.scene.stage.guitarist
    let skinned = 0, bones = 0
    g.root?.traverse?.((n) => { if (n.isSkinnedMesh) { skinned++; bones = Math.max(bones, n.skeleton?.bones?.length ?? 0) } })
    return {
      classe: g.constructor.name,
      temMixer: !!g.mixer,
      faixas: g.mixer?._actions?.[0]?._clip?.tracks?.length ?? 0,
      ikAtiva: !!g.animated,
      skinned, bones,
    }
  })
  console.log(`\n── ${nome}`)
  console.log('  ', JSON.stringify(r))
  const rel = logs.filter((l) => /DBG|adaptar|retarget|Error|bind/i.test(l))
  if (rel.length) console.log('   logs:', rel.slice(0, 6))
  await page.close()
}
await browser.close(); await server.close?.(); process.exit(0)
