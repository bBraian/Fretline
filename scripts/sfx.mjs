/**
 * Confere que cada efeito sonoro dispara no ponto certo, num navegador de
 * verdade. Instrumenta `decodeAudioData` e `AudioBufferSourceNode.start`
 * para saber qual amostra tocou e quando.
 */

import { chromium } from 'playwright'
import { serve } from './serve.mjs'
import { passarAbertura } from './abertura.mjs'

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
  112172: 'crowdSwell',
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
        if (nome) {
          window.__sfx.push({ nome, quando: when ?? 0, offset: rest[0] ?? 0, t: performance.now() / 1000 })
        }
        return start.call(this, when, ...rest)
      }

      // A pausa é conferida pelo outro lado: quais amostras foram paradas.
      window.__sfxStops = []
      const stop = AudioBufferSourceNode.prototype.stop
      AudioBufferSourceNode.prototype.stop = function (...args) {
        const nome = this.buffer && tag.get(this.buffer)
        if (nome) window.__sfxStops.push({ nome, t: performance.now() / 1000 })
        return stop.apply(this, args)
      }

      window.__media = []
      window.__mediaEls = []
      const wire = AudioContext.prototype.createMediaElementSource
      AudioContext.prototype.createMediaElementSource = function (el) {
        window.__mediaEls.push(el)
        return wire.call(this, el)
      }

      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () {
        window.__media.push({ src: this.src, at: this.currentTime, dur: this.duration })
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
  await passarAbertura(page)
  await page.getByRole('heading', { name: 'FRETLINE' }).waitFor({ timeout: 15000 })

  confere(
    'menu → Tocar (confirmar + abrir menu)',
    await ouvindo(page, () => page.getByRole('button', { name: /Tocar/ }).first().click()),
    { contem: ['ui01'] },
  )

  const rows = page.locator('.song-row')
  await rows.nth(4).waitFor({ timeout: 30000 })
  confere(
    'navegar na lista de músicas',
    await ouvindo(page, () =>
      // Uma linha que não é a selecionada: clicar na que já está escolhida
      // não é navegar, e com razão não soa.
      page.locator('.song-row:not([data-selected="true"])').first().click(),
    ),
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
  const page = await novaPagina({
    money: 0,
    records: { 'fretline-demo:medium': { score: 1, stars: 99, accuracy: 1 } },
  })
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await passarAbertura(page)
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

    const comprar = page.getByRole('button', { name: /^Comprar por/ })
    if (!semGrana && (await comprar.count())) {
      const texto = await comprar.first().textContent()
      if (!/\$0/.test(texto ?? ''))
        semGrana = await ouvindo(page, () => comprar.first().click({ force: true }))
    }
  }

  confere('comprar sem dinheiro', semGrana ?? [], { contem: ['ui09'], ausentes: ['cash'] })
  await page.close()

  // Sem estrelas, os itens de progresso aparecem como bloqueados.
  const pobre = await novaPagina({ money: 0, records: {} })
  await pobre.goto(BASE, { waitUntil: 'domcontentloaded' })
  await passarAbertura(pobre)
  await pobre.getByRole('heading', { name: 'FRETLINE' }).waitFor({ timeout: 15000 })
  await pobre.getByRole('button', { name: /^Guitarra$/ }).first().click()
  await pobre.waitForTimeout(400)

  const linhas = pobre.locator('.picker-row')
  for (let i = 0; i < (await linhas.count()) && !porEstrelas; i++) {
    await linhas.nth(i).click()
    await pobre.waitForTimeout(120)
    const bloqueado = pobre.getByRole('button', { name: /^Bloqueado$/ })
    if (await bloqueado.count()) {
      porEstrelas = await ouvindo(pobre, () => bloqueado.first().click({ force: true }))
    }
  }
  confere('item bloqueado por estrelas', porEstrelas ?? [], { contem: ['ui09'] })
  await pobre.close()
}

// ─── música de menu: trechos das músicas da biblioteca ────────────────────
console.log('\nMÚSICA DE MENU')
{
  const page = await novaPagina(null)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await passarAbertura(page)
  await page.getByRole('heading', { name: 'FRETLINE' }).waitFor({ timeout: 15000 })
  // O gesto da abertura já acordou o áudio; o clique fica como garantia.
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
    console.log(
      `✓ menu tocou "${arquivo}" (${faixa.dur.toFixed(0)}s) a partir de ${faixa.at.toFixed(1)}s`,
    )
    // Com preview, o menu toca o clipe de 30 s desde o início: o host de
    // assets não atende byte range, e pular para o meio de um arquivo
    // transmitido não funciona. Sem preview, vale a regra antiga — o meio.
    if (/\/preview\.[a-z0-9]+$/i.test(decodeURIComponent(faixa.src))) {
      if (faixa.at > 1) problems.push(`o preview começou em ${faixa.at.toFixed(1)}s, e não do início`)
    } else if (Number.isFinite(faixa.dur)) {
      const esperado = faixa.dur > 30 ? (faixa.dur - 30) / 2 : 0
      if (Math.abs(faixa.at - esperado) > 1) {
        problems.push(
          `o trecho começou em ${faixa.at.toFixed(1)}s; para ${faixa.dur.toFixed(0)}s, o meio é ${esperado.toFixed(1)}s`,
        )
      }
    } else if (faixa.at <= 1) {
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
    () => window.__mediaEls.length > 0 && window.__mediaEls.every((a) => a.paused),
  )
  const naoRecomecou = (await page.evaluate(() => window.__media.length)) === antesDoPalco
  console.log(
    `${pausada && naoRecomecou ? '✓' : '✗'} música de menu parada durante a partida`,
  )
  if (!pausada || !naoRecomecou) problems.push('a música de menu continuou tocando no palco')

  await page.close()
}

// ─── seletor e preview de 2 segundos ──────────────────────────────────────
console.log('\nSELETOR E PREVIEW')
{
  // Música de fundo desligada de propósito: o preview não é trilha, e tem
  // de tocar mesmo para quem desligou a trilha.
  const page = await novaPagina({ money: 0 })
  await page.addInitScript(() => {
    const salvo = JSON.parse(localStorage.getItem('fretline:v1') ?? '{}')
    salvo.settings = { ...(salvo.settings ?? {}), menuMusic: false }
    localStorage.setItem('fretline:v1', JSON.stringify(salvo))
  })
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await passarAbertura(page)
  await page.getByRole('heading', { name: 'FRETLINE' }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: /Tocar/ }).first().click()
  await page.locator('.song-row').nth(4).waitFor({ timeout: 30000 })
  await page.waitForTimeout(600)

  const destaque = async () =>
    (await page.locator('.song-row[data-selected="true"]').first().innerText()).split('\n')[0]
  const tocadas = async () => page.evaluate(() => window.__media.length)
  const ultima = async () => page.evaluate(() => window.__media.at(-1) ?? null)

  // 1. as setas movem o seletor
  const antesDoMove = await destaque()
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(150)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(250)
  const depoisDoMove = await destaque()
  const moveu = antesDoMove !== depoisDoMove
  console.log(`${moveu ? '✓' : '✗'} setas movem o seletor: ${antesDoMove} → ${depoisDoMove}`)
  if (!moveu) problems.push('as setas não moveram o seletor na lista de músicas')

  // 2. navegar depressa não toca nada
  const marco = await tocadas()
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(450)
  }
  const rapidos = (await tocadas()) - marco
  console.log(`${rapidos === 0 ? '✓' : '✗'} navegação rápida não tocou nada (${rapidos})`)
  if (rapidos !== 0) problems.push(`navegar rápido disparou ${rapidos} preview(s)`)

  // 3. parar dois segundos toca — mesmo com a trilha desligada
  await page.waitForTimeout(2600)
  const parado = await destaque()
  const faixa = await ultima()
  const arquivo = decodeURIComponent(faixa?.src ?? '')
  const daParada = (await tocadas()) > marco && arquivo.includes(parado)
  console.log(`${daParada ? '✓' : '✗'} parar 2s tocou "${parado}" (trilha desligada)`)
  if (!daParada) problems.push(`parado em "${parado}", tocou ${arquivo || 'nada'}`)

  // 4. o clipe aparece na linha que está tocando
  const clipe = await page.locator('.song-row[data-previewing="true"] .song-row-eq').count()
  const naLinhaCerta = await page
    .locator('.song-row[data-previewing="true"][data-selected="true"]')
    .count()
  console.log(`${clipe === 1 && naLinhaCerta === 1 ? '✓' : '✗'} clipe ao lado do seletor (${clipe})`)
  if (clipe !== 1 || naLinhaCerta !== 1) problems.push('o clipe do preview não apareceu na linha certa')

  // 5. uma fonte de som só
  const fontes = await page.evaluate(() => window.__mediaEls.length)
  console.log(`${fontes === 1 ? '✓' : '✗'} uma única fonte de mídia no grafo (${fontes})`)
  if (fontes !== 1) problems.push(`há ${fontes} elementos de mídia; deveria haver 1`)

  // 6. mover de novo cala na hora
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(700)
  const calouAoMover = await page.evaluate(() => window.__mediaEls.every((a) => a.paused))
  const clipeSumiu = (await page.locator('.song-row[data-previewing="true"]').count()) === 0
  console.log(`${calouAoMover && clipeSumiu ? '✓' : '✗'} mover calou o preview e tirou o clipe`)
  if (!calouAoMover || !clipeSumiu) problems.push('mover o seletor não calou o preview')

  await page.close()
}

// ─── o mesmo seletor na carreira ──────────────────────────────────────────
console.log('\nSELETOR NA CARREIRA')
{
  const page = await novaPagina({
    money: 0,
    records: { 'x:medium': { score: 1, stars: 999, accuracy: 1 } },
  })
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await passarAbertura(page)
  await page.getByRole('heading', { name: 'FRETLINE' }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: /^Carreira$/ }).first().click()
  await page.locator('.song-row').nth(4).waitFor({ timeout: 30000 })
  await page.waitForTimeout(600)

  const destaque = async () => {
    const n = await page.locator('.song-row[data-selected="true"]').count()
    if (n === 0) return null
    return (await page.locator('.song-row[data-selected="true"]').first().innerText()).split('\n')[0]
  }

  const inicial = await destaque()
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(150)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(250)
  const movido = await destaque()
  const ok = inicial !== null && movido !== null && inicial !== movido
  console.log(`${ok ? '✓' : '✗'} seletor na carreira: ${inicial} → ${movido}`)
  if (!ok) problems.push(`a carreira não tem seletor navegável (${inicial} → ${movido})`)

  // O seletor atravessa a fronteira entre tiers.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(120)
  }
  await page.waitForTimeout(2600)
  const tocou = await page.evaluate(() => window.__media.length > 0)
  const clipe = await page.locator('.song-row[data-previewing="true"]').count()
  console.log(`${tocou && clipe === 1 ? '✓' : '✗'} preview na carreira (clipe: ${clipe})`)
  if (!tocou || clipe !== 1) problems.push('o preview não funcionou na carreira')

  // Confirmar inicia a música destacada, e o palco entra em silêncio.
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => !document.body.innerText.includes('Afinando'), null, {
    timeout: 90000,
  })
  await page.waitForTimeout(5000)
  const silencio = await page.evaluate(() => window.__mediaEls.every((a) => a.paused))
  console.log(`${silencio ? '✓' : '✗'} nada de menu nem preview durante a partida`)
  if (!silencio) problems.push('havia áudio de menu tocando durante a partida')

  await page.close()
}

// ─── padrões do começo e volta para a tela de origem ──────────────────────
console.log('\nPADRÕES E NAVEGAÇÃO')
{
  const page = await novaPagina(null)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await passarAbertura(page)
  await page.getByRole('heading', { name: 'FRETLINE' }).waitFor({ timeout: 15000 })

  // Perfil novo: quem está equipado por padrão.
  for (const [rotulo, botao, esperado] of [
    ['personagem', /^Personagem$/, 'Douglas'],
    ['guitarra', /^Guitarra$/, 'Stratos'],
  ]) {
    await page.getByRole('button', { name: botao }).first().click()
    await page.waitForTimeout(600)
    const emUso = await page
      .locator('.picker-row[data-selected="true"] strong')
      .first()
      .textContent()
    const tag = await page.locator('.shop-actions').first().textContent()
    const ok = emUso?.trim() === esperado && /Em uso/.test(tag ?? '')
    console.log(`${ok ? '✓' : '✗'} ${rotulo} padrão: ${emUso?.trim()} (${tag?.trim()})`)
    if (!ok) problems.push(`${rotulo} padrão deveria ser ${esperado}, veio ${emUso?.trim()}`)
    await page.getByRole('button', { name: /Voltar|Menu/ }).first().click()
    await page.waitForTimeout(400)
  }

  // Carreira: o seletor de dificuldade e a volta para a carreira ao sair.
  await page.getByRole('button', { name: /^Carreira$/ }).first().click()
  await page.waitForTimeout(600)

  const temSeletor = await page.locator('.segmented button').count()
  console.log(`${temSeletor >= 4 ? '✓' : '✗'} seletor de dificuldade na carreira (${temSeletor} botões)`)
  if (temSeletor < 4) problems.push('a carreira ficou sem seletor de dificuldade')

  const musica = page.locator('.song-row:not([aria-disabled="true"])').first()
  if (!(await musica.count())) {
    problems.push('nenhuma música tocável na carreira para conferir a volta')
  } else {
    await musica.click()
    await page.waitForFunction(() => !document.body.innerText.includes('Afinando'), null, {
      timeout: 90000,
    })
    await page.waitForTimeout(1500)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    let sair = page.getByRole('button', { name: /Sair da música/ })
    const viaTeclado = (await sair.count()) > 0

    if (!viaTeclado) {
      // Segunda tentativa pelo mesmo caminho que o teste de fumaça usa.
      await page.evaluate(() =>
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })),
      )
      await page.waitForTimeout(600)
      sair = page.getByRole('button', { name: /Sair da música/ })
      console.log(
        `  Esc do Playwright não abriu; via dispatchEvent abriu: ${(await sair.count()) > 0}`,
      )
    }

    if (!(await sair.count())) {
      const texto = (await page.locator('body').innerText()).slice(0, 300).replace(/\n+/g, ' | ')
      problems.push(`o Esc não abriu a pausa; a tela dizia: ${texto}`)
      console.log(`✗ Esc não abriu a pausa — tela: ${texto}`)
    } else {
      await sair.click()
      await page.waitForTimeout(800)

      const titulo = await page.locator('.screen-title').first().textContent()
      const ok = titulo?.trim() === 'Carreira'
      console.log(`${ok ? '✓' : '✗'} sair da música na carreira volta para "${titulo?.trim()}"`)
      if (!ok) problems.push(`sair da carreira caiu em "${titulo?.trim()}", não na carreira`)
    }
  }

  await page.close()
}

// ─── gameplay: a pausa alcança os efeitos ─────────────────────────────────
console.log('\nGAMEPLAY — pausa na contagem')
{
  const ABERTURA = ['highwayRise', 'notesRipple', 'crowdCheer']
  const page = await novaPagina(null, { viewport: { width: 480, height: 270 } })
  await page.goto(`${BASE}/?debug&lowfx`, { waitUntil: 'domcontentloaded' })
  await passarAbertura(page)
  await page.getByRole('button', { name: /Tocar/ }).first().click()
  await page.getByRole('button', { name: /^Tocar em/ }).click()
  await page.waitForFunction(() => !document.body.innerText.includes('Afinando'), null, {
    timeout: 60000,
  })

  // Pausa ainda na contagem, com o grito da plateia pela frente.
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })),
  )
  await page.getByRole('heading', { name: 'Pausado' }).waitFor({ timeout: 5000 })

  const paradas = await page.evaluate(
    (nomes) => window.__sfxStops.filter((s) => nomes.includes(s.nome)).map((s) => s.nome),
    ABERTURA,
  )
  const okParou = paradas.length > 0
  console.log(`${okParou ? '✓' : '✗'} pausar parou a abertura → [${paradas.join(', ')}]`)
  if (!okParou) problems.push('pausar não parou nenhuma amostra da abertura')

  const marco = await page.evaluate(() => window.__sfx.length)
  await page.waitForTimeout(1500)
  const naPausa = await page.evaluate((n) => window.__sfx.slice(n).map((s) => s.nome), marco)
  confere('nada toca durante a pausa', naPausa, { ausentes: [...ABERTURA, 'crowdSwell'] })

  await page.getByRole('button', { name: /^Continuar$/ }).click()
  await page.waitForTimeout(600)
  const retomadas = await page.evaluate((n) => window.__sfx.slice(n), marco)
  const plateia = retomadas.find((s) => s.nome === 'crowdCheer')
  const okRetomou = Boolean(plateia)
  console.log(
    `${okRetomou ? '✓' : '✗'} continuar retomou a plateia` +
      (plateia ? ` (${plateia.offset.toFixed(2)}s adentro)` : ''),
  )
  if (!okRetomou) problems.push('continuar não retomou o grito da plateia')

  // Pausou na contagem: a contagem volta junto.
  const contagem = await page.evaluate(
    () => window.__fretline.player.now() >= 0 || document.querySelector('.countdown') !== null,
  )
  console.log(`${contagem ? '✓' : '✗'} a contagem volta depois da pausa`)
  if (!contagem) problems.push('continuar durante a contagem escondeu a contagem')

  await page.close()
}

// ─── gameplay: abertura, erro, derrota ────────────────────────────────────
console.log('\nGAMEPLAY — abertura e derrota (sem tocar nada)')
{
  const page = await novaPagina(null, { viewport: { width: 480, height: 270 } })
  await page.goto(`${BASE}/?debug&lowfx`, { waitUntil: 'domcontentloaded' })
  await passarAbertura(page)
  await page.getByRole('button', { name: /Tocar/ }).first().click()
  await page.getByRole('button', { name: /^Tocar em/ }).click()
  await page.waitForFunction(() => !document.body.innerText.includes('Afinando'), null, {
    timeout: 60000,
  })

  // Daqui em diante é partida: os sons de menu que levaram até aqui não
  // contam para a conferência do que toca durante a música.
  const inicioDaPartida = await page.evaluate(() => window.__sfx.length)

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

  const jogo = await page.evaluate(
    (n) => window.__sfx.slice(n).map((s) => s.nome),
    inicioDaPartida,
  )
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
  await passarAbertura(page)
  await page.getByRole('button', { name: /Tocar/ }).first().click()
  await page.getByRole('button', { name: /^Tocar em/ }).click()
  await page.waitForFunction(() => !document.body.innerText.includes('Afinando'), null, {
    timeout: 60000,
  })

  const resultado = await page.evaluate(async () => {
    const { session, player, chart, scene } = window.__fretline
    scene.setVisible('stage', false)
    const KEYS = ['KeyA', 'KeyS', 'KeyJ', 'KeyK', 'KeyL']
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

// ─── boost: a plateia levanta ─────────────────────────────────────────────
console.log('\nBOOST')
{
  const page = await novaPagina(null, { viewport: { width: 480, height: 270 } })
  await page.goto(`${BASE}/?debug&lowfx`, { waitUntil: 'domcontentloaded' })
  await passarAbertura(page)
  await page.getByRole('button', { name: /Tocar/ }).first().click()
  await page.getByRole('button', { name: /^Tocar em/ }).click()
  await page.waitForFunction(() => !document.body.innerText.includes('Afinando'), null, {
    timeout: 60000,
  })
  // Passa a contagem regressiva: antes dela o input ainda não vale.
  await page.waitForTimeout(4000)

  // O medidor é enchido na mão pelo gancho de depuração. O que se confere
  // aqui é o som da ativação, não quanto tempo leva para juntar star power
  // tocando — isso o teste de fumaça já percorre.
  const tocados = await ouvindo(
    page,
    () =>
      page.evaluate(() => {
        window.__fretline.session.getState().starPowerAmount = 1
        for (const type of ['keydown', 'keyup']) {
          window.dispatchEvent(new KeyboardEvent(type, { code: 'Space', bubbles: true }))
        }
      }),
    900,
  )
  confere('espaço ativa o boost', tocados, { contem: ['crowdSwell'] })

  const ativo = await page.evaluate(() => window.__fretline.session.getState().starPowerActive)
  console.log(`${ativo ? '✓' : '✗'} star power ligado depois do espaço`)
  if (!ativo) problems.push('o espaço não ligou o star power')

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
