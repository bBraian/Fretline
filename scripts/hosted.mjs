/**
 * Confere o layout hospedado sem publicar nada.
 *
 * Monta `.assets-dist/` como a publicação montaria, serve a pasta com o
 * `wrangler dev` — o mesmo runtime do host, que aplica o `_headers` de
 * verdade — e roda `smoke` e `library` contra um build apontado para ele.
 * Página e assets ficam em origens diferentes (`localhost` e `127.0.0.1`),
 * então um CORS faltando aparece aqui, e não em produção.
 */

import { execFileSync, spawn } from 'node:child_process'

const PORTA = 8787
const ASSETS = `http://127.0.0.1:${PORTA}`

execFileSync('node', ['tools/upload-assets.mjs', '--dry-run'], { stdio: 'inherit' })

// Grupo de processos próprio: o npx abre o wrangler, que abre o workerd, e
// matar só o primeiro deixaria a porta presa.
const host = spawn(
  'npx',
  ['wrangler', 'dev', '--config', 'tools/assets-worker/wrangler.jsonc', '--ip', '127.0.0.1', '--port', String(PORTA)],
  {
    detached: true,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  },
)

async function esperarNoAr(url, segundos = 60) {
  for (let i = 0; i < segundos; i++) {
    try {
      const resposta = await fetch(url)
      if (resposta.ok) return resposta
    } catch {
      // ainda subindo
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`${url} não respondeu em ${segundos}s`)
}

let falhou = false
try {
  const indice = await esperarNoAr(`${ASSETS}/library.json`)
  if (indice.headers.get('access-control-allow-origin') !== '*') {
    throw new Error('o host local respondeu sem CORS: o _headers não foi aplicado')
  }
  console.log(`✓ host local em ${ASSETS}, com CORS`)

  for (const script of ['scripts/smoke.mjs', 'scripts/library.mjs']) {
    execFileSync('node', [script], {
      stdio: 'inherit',
      env: { ...process.env, VITE_ASSETS_BASE: ASSETS },
    })
  }
} catch (erro) {
  falhou = true
  console.error(`✗ ${erro.message}`)
} finally {
  try {
    process.kill(-host.pid, 'SIGTERM')
  } catch {
    // já tinha saído
  }
}

process.exit(falhou ? 1 : 0)
