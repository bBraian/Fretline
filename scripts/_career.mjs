import { chromium } from 'playwright'
import { serve } from '/home/braian/Projects/fretline/scripts/serve.mjs'
const server = await serve()
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader','--use-gl=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', e => console.log('[erro]', e.message))
await page.goto(`${server.url}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.getByRole('button', { name: /Carreira/ }).first().click()
await page.waitForTimeout(800)
console.log(await page.locator('.screen-body').innerText())
await browser.close(); await server.close()
