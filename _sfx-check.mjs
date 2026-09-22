/**
 * Confere que cada efeito sonoro dispara no ponto certo, num navegador de
 * verdade. Instrumenta `decodeAudioData` e `AudioBufferSourceNode.start`
 * para saber qual amostra tocou e quando.
 */

import { chromium } from 'playwright'
import { serve } from './scripts/serve.mjs'

const server = await serve()
const BASE = server.url
const problems = []

// Cada arquivo tem um tamanho único, e é por ele que a amostra é
// reconhecida depois de decodificada.
const BY_SIZE = {
  15852: 'cash',
  394628: 'crowdFail',
  29536: 'highwayRise',
  16110: 'notesRipple',
  7110: 'scroll',
  851104: 'crowdCheer',
  30204: 'ui01',
  25900: 'ui05',
  31264: 'ui06',
  20832: 'ui09',
  193288: 'youRock',
}

const browser = await chromium.launch({
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader',
    '--use-gl=swiftshader',
  ],
})

async function novaPagina(profile, { viewport } = {}) {
  const page = await browser.newPage({ viewport: viewport ?? { width: 1280, height: 720 } })
  page.on('pageerror', (e) => problems.push(`exceção: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`)
  })

  await page.addInitScript(
    ({ bySize, profile }) => {
      window.__sfx = []
      const tag = new WeakMap()

      const decode = AudioContext.prototype.decodeAudioData
      AudioContext.prototype.decodeAudioData = function (bytes, ...rest) {
        const nome = bySize[bytes.byteLength]
        const p = decode.call(this, bytes, ...rest)
        return p && p.then ? p.then((b) => (nome && tag.set(b, nome), b)) : p
      }

      const start = AudioBufferSourceNode.prototype.start
      AudioBufferSourceNode.prototype.start = function (when, ...rest) {
        const nome = this.buffer && tag.get(this.buffer)
        if (nome) window.__sfx.push({ nome, quando: when ?? 0, t: performance.now() / 1000 })
        return start.call(this, when, ...rest)
      }

      window.__media = []
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () {
        window.__media.push({ src: this.src, at: this.currentTime })
        return play.call(this)
      }

      if (profile) localStorage.setItem('fretline:v1', JSON.stringify({ profile }))
    },
    { bySize: BY_SIZE, profile },
  )
  return page
}

/** Executa uma ação e devolve só as amostras que tocaram por causa dela. */
async function ouvindo(page, acao, espera = 350) {
  const antes = await page.evaluate(() => window.__sfx.length)
  await acao()
  await page.waitForTimeout(espera)
  return page.evaluate((n) => window.__sfx.slice(n).map((s) => s.nome), antes)
}

function confere(rotulo, tocados, { contem = [], ausentes = [] }) {
  const ok =
    contem.every((n) => tocados.includes(n)) && ausentes.every((n) => !tocados.includes(n))
  console.log(`${ok ? '✓' : '✗'} ${rotulo} → [${tocados.join(', ') || '—'}]`)
  if (!ok) {
    problems.push(
      `${rotulo}: esperava ${contem.join('+') || '—'}` +
        (ausentes.length ? ` e nada de ${ausentes.join('/')}` : '') +
        `, veio [${tocados.join(', ')}]`,
    )
  }
}

// ─── menus ────────────────────────────────────────────────────────────────
console.log('\nMENUS')
{
  const page = await novaPagina({
    money: 999999,
    records: { 'fretline-demo:medium': { score: 1, stars: 99, accuracy: 1 } },
  })
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'FRETLINE' }).waitFor({ timeout: 15000 })

  confere(
    'menu → Tocar (confirmar + abrir menu)',
    await ouvindo(page, () => page.getByRole('button', { name: /Tocar/ }).first().click()),
    { contem: ['ui01'] },
  )

  const rows = page.locator('.song-row, .picker-row, [class*="row"]')
  confere(
    'navegar na lista de músicas',
    await ouvindo(page, async () => {
      const n = await rows.count()
      if (n > 1) await rows.nth(1).click()
      else await rows.first().click()
    }),
    { contem: ['scroll'] },
  )

  confere(
    'voltar (sem o som de abrir menu por cima)',
    await ouvindo(
      page,
      () => page.getByRole('button', { name: /Voltar|Menu/ }).first().click(),
      900,
    ),
    { contem: ['ui09'], ausentes: ['ui01'] },
  )

  confere(
    'menu → Guitarra',
    await ouvindo(page, () => page.getByRole('button', { name: /^Guitarra$/ }).first().click()),
    { contem: ['ui01'] },
  )

  const guitarras = page.locator('.picker-row')
  confere(
    'navegar entre guitarras',
    await ouvindo(page, () => guitarras.nth(2).click()),
    { contem: ['scroll'] },
  )

  // Procura uma guitarra à venda e compra.
  let comprou = null
  const total = await guitarras.count()
  for (let i = 0; i < total && !comprou; i++) {
    await guitarras.nth(i).click()
    await page.waitForTimeout(120)
    const botao = page.getByRole('button', { name: /^Comprar por/ })
    if (await botao.count()) comprou = await ouvindo(page, () => botao.first().click())
  }
  confere('comprar uma guitarra', comprou ?? [], { contem: ['cash'] })

  const equipar = page.getByRole('button', { name: /^Equipar$/ })
  const somEquipar = (await equipar.count())
    ? await ouvindo(page, () => equipar.first().click())
    : []
  const confirmou = somEquipar.some((n) => n === 'ui05' || n === 'ui06')
  console.log(`${confirmou ? '✓' : '✗'} equipar (confirmação sorteada) → [${somEquipar.join(', ')}]`)
  if (!confirmou) problems.push(`equipar: esperava ui05 ou ui06, veio [${somEquipar.join(', ')}]`)

  await page.close()
}

// ─── recusa: sem dinheiro e bloqueado por estrelas ────────────────────────
console.log('\nAÇÕES BLOQUEADAS')
{
  const page = await novaPagina({ money: 0, records: {} })
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'FRETLINE' }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: /^Guitarra$/ }).first().click()
  await page.waitForTimeout(400)

  const guitarras = page.locator('.picker-row')
  const total = await guitarras.count()
  let semGrana = null
  let porEstrelas = null

  for (let i = 0; i < total && (!semGrana || !porEstrelas); i++) {
    await guitarras.nth(i).click()
    await page.waitForTimeout(120)

    const bloqueado = page.getByRole('button', { name: /^Bloqueado$/ })
    if (!porEstrelas && (await bloqueado.count())) {
      porEstrelas = await ouvindo(page, () => bloqueado.first().click({ force: true }))
      continue
    }
    const comprar = page.getByRole('button', { name: /^Comprar por/ })
    if (!semGrana && (await comprar.count())) {
      const texto = await comprar.first().textContent()
      if (!/\$0/.test(texto ?? ''))
        semGrana = await ouvindo(page, () => comprar.first().click({ force: true }))
    }
  }

  confere('comprar sem dinheiro', semGrana ?? [], { contem: ['ui09'], ausentes: ['cash'] })
  confere('item bloqueado por estrelas', porEstrelas ?? [], { contem: ['ui09'] })

  await page.close()
}

// ─── música de menu: trechos das músicas da biblioteca ────────────────────
console.log('\nMÚSICA DE MENU')
{
  const page = await novaPagina(null)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'FRETLINE' }).waitFor({ timeout: 15000 })
  // O primeiro gesto é o que acorda o áudio no navegador.
  await page.mouse.click(5, 5)

  const tocou = await page
    .waitForFunction(() => window.__media.length > 0, null, { timeout: 30000 })
    .then(() => page.evaluate(() => window.__media))
    .catch(() => [])

  if (!tocou.length) {
    problems.push('o menu não tocou nenhuma música da biblioteca')
    console.log('✗ nenhuma faixa da biblioteca tocou no menu')
  } else {
    const faixa = tocou[0]
    const arquivo = decodeURIComponent(faixa.src).split('/').slice(-2).join('/')
    console.log(`✓ menu tocou "${arquivo}" a partir de ${faixa.at.toFixed(1)}s`)
    if (faixa.at <= 1) {
      problems.push(`o trecho começou em ${faixa.at.toFixed(1)}s, e não no meio da música`)
    }
  }

  // Entrar no palco cala a música de menu; sair a traz de volta.
  await page.getByRole('button', { name: /Tocar/ }).first().click()
  await page.waitForTimeout(500)
  const antesDoPalco = await page.evaluate(() => window.__media.length)
  await page.getByRole('button', { name: /^Tocar em/ }).click()
  await page.waitForTimeout(4000)
  const pausada = await page.evaluate(
    () => [...document.querySelectorAll('audio')].every((a) => a.paused),
  )
  const naoRecomecou = (await page.evaluate(() => window.__media.length)) === antesDoPalco
  console.log(
    `${pausada && naoRecomecou ? '✓' : '✗'} música de menu parada durante a partida`,
  )
  if (!pausada || !naoRecomecou) problems.push('a música de menu continuou tocando no palco')

  await page.close()
}

// ─── gameplay: abertura, erro, derrota ────────────────────────────────────
console.log('\nGAMEPLAY — abertura e derrota (sem tocar nada)')
{
  const page = await novaPagina(null, { viewport: { width: 480, height: 270 } })
  await page.goto(`${BASE}/?debug&lowfx`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Tocar/ }).first().click()
  await page.getByRole('button', { name: /^Tocar em/ }).click()
  await page.waitForFunction(() => !document.body.innerText.includes('Afinando'), null, {
    timeout: 60000,
  })

  // A abertura toca na montagem; espera a sequência inteira sair.
  await page.waitForTimeout(3000)
  const abertura = await page.evaluate(() =>
    window.__sfx.filter((s) => ['highwayRise', 'notesRipple', 'crowdCheer'].includes(s.nome)),
  )
  const ordem = abertura.map((s) => s.nome)
  const okOrdem = ordem.join('>') === 'highwayRise>notesRipple>crowdCheer'
  console.log(`${okOrdem ? '✓' : '✗'} sequência de abertura → [${ordem.join(' → ')}]`)
  if (!okOrdem) problems.push(`abertura fora de ordem ou incompleta: [${ordem.join(', ')}]`)

  // Agendadas de uma vez, encostadas: as durações são 0.92s e 0.73s.
  if (abertura.length === 3) {
    const d1 = abertura[1].quando - abertura[0].quando
    const d2 = abertura[2].quando - abertura[1].quando
    console.log(`  emendas: pista→notas ${d1.toFixed(2)}s, notas→plateia ${d2.toFixed(2)}s`)
    if (Math.abs(d1 - 0.92) > 0.05 || Math.abs(d2 - 0.73) > 0.05) {
      problems.push(`a abertura não está emendada: ${d1.toFixed(2)}s e ${d2.toFixed(2)}s`)
    }
  }

  // Ninguém toca nada: as notas passam, o medidor zera, a música é perdida.
  await page.waitForFunction(() => document.body.innerText.includes('Você foi vaiado'), null, {
    timeout: 60000,
  })
  await page.waitForTimeout(400)

  const jogo = await page.evaluate(() => window.__sfx.map((s) => s.nome))
  // O erro de nota voltou a ser o ruído sintetizado do tocador: nenhuma
  // amostra de interface pode tocar durante a música.
  const amostrasNoJogo = jogo.filter((n) => ['ui01', 'ui05', 'ui06', 'ui09', 'scroll'].includes(n))
  const okSemAmostras = amostrasNoJogo.length === 0
  console.log(`${okSemAmostras ? '✓' : '✗'} erro de nota sem amostra de interface (${amostrasNoJogo.length} encontradas)`)
  if (!okSemAmostras) problems.push(`amostras de interface durante a música: [${amostrasNoJogo.join(', ')}]`)

  confere('derrota', jogo.includes('crowdFail') ? ['crowdFail'] : [], { contem: ['crowdFail'] })
  if (jogo.includes('youRock')) problems.push('tocou "you rock" numa derrota')
  else console.log('✓ não tocou "you rock" na derrota')

  // O botão "ver o resultado" depois de falhar também não pode soar vitória.
  const depois = await ouvindo(
    page,
    () => page.getByRole('button', { name: /Ver o resultado/ }).click(),
    1200,
  )
  confere('ver o resultado depois de falhar', depois, { ausentes: ['youRock'] })

  await page.close()
}

// ─── gameplay: vitória ────────────────────────────────────────────────────
console.log('\nGAMEPLAY — vitória (piloto automático toca a música)')
{
  const page = await novaPagina(null, { viewport: { width: 480, height: 270 } })
  await page.goto(`${BASE}/?debug&lowfx`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Tocar/ }).first().click()
  await page.getByRole('button', { name: /^Tocar em/ }).click()
  await page.waitForFunction(() => !document.body.innerText.includes('Afinando'), null, {
    timeout: 60000,
  })

  const resultado = await page.evaluate(async () => {
    const { session, player, chart, scene } = window.__fretline
    scene.setVisible('stage', false)
    const KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG']
    const send = (type, code) =>
      window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }))
    let held = new Set()
    const setFrets = (wanted) => {
      for (const code of held) send('keyup', code)
      for (const code of wanted) send('keydown', code)
      held = wanted
    }
    let index = 0
    const deadline = performance.now() + 60000
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        const now = player.now()
        while (index < chart.notes.length && chart.notes[index].time <= now + 0.008) {
          const note = chart.notes[index]
          const wanted = new Set()
          if (!note.isOpen) {
            for (let i = 0; i < 5; i++) if (note.frets & (1 << i)) wanted.add(KEYS[i])
          }
          setFrets(wanted)
          index++
        }
        const s = session.getState()
        if (s.finished || s.failed || performance.now() > deadline) {
          clearInterval(timer)
          resolve()
        }
      }, 4)
    })
    await new Promise((r) => setTimeout(r, 600))
    const s = session.getState()
    return { finished: s.finished, failed: s.failed, sfx: window.__sfx.map((x) => x.nome) }
  })

  console.log(`  a sessão terminou: finished=${resultado.finished} failed=${resultado.failed}`)
  if (!resultado.finished) problems.push('o piloto automático não terminou a música')
  confere('vitória', resultado.sfx.includes('youRock') ? ['youRock'] : [], {
    contem: ['youRock'],
  })
  if (resultado.sfx.includes('crowdFail')) problems.push('tocou o som de derrota numa vitória')
  else console.log('✓ não tocou o som de derrota na vitória')

  await page.close()
}

await browser.close()
await server.close()

console.log('')
if (problems.length) {
  console.log(`✗ ${problems.length} problema(s):`)
  for (const p of problems) console.log(`  - ${p}`)
  process.exit(1)
}
console.log('✓ todos os efeitos tocam no ponto certo')
