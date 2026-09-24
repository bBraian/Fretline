# Hospedagem, parte 1 — publicação com previews — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run upload-assets` passa a publicar no Worker da Cloudflare, com um `preview.opus` de 30 s para cada música e o índice `library.json` ao lado dos arquivos; o jogo passa a ler esse índice do host e a tocar a música de menu a partir dos previews.

**Architecture:** O script de publicação vira duas peças: `tools/upload-assets-lib.mjs` com o que é puro (escolha e corte do preview, índice) e testado em Node, e `tools/upload-assets.mjs` com o que é E/S (hard links, ffmpeg, wrangler). No cliente, `src/songs/libraryIndex.ts` decide de onde vem o índice e resolve o `base` relativo contra a URL dele; `src/songs/mapInOrder.ts` lê as pastas seis por vez mantendo a ordem. `npm run hosted` confere o layout hospedado inteiro sem publicar, servindo `.assets-dist/` com `wrangler dev`.

**Tech Stack:** Node 22 (ESM `.mjs`), ffmpeg/ffprobe com libopus, wrangler 4 (Worker só de assets), TypeScript + Vite 7 + vitest 3, React 19, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-hospedagem-e-loading-design.md` — ler antes a seção *Estado em 2026-09-23*: o host já está no ar, montado à mão, e o jogo publicado hoje lê `public/library/remote.json`.

**Fora desta parte** (partes 2 a 4 do spec): progresso e cancelamento do Afinando, tela de abertura, previews baixados em segundo plano, créditos dos modelos. Nada aqui checa `credits.json`.

## Pré-requisito do autor (antes da Task 1)

O wrangler 4.138 exige Node ≥ 22; a máquina tem o 20.19 (fora de suporte desde abril de 2026). O autor roda, uma vez:

```bash
nvm install 22
nvm alias default 22
node --version          # v22.x
cd ~/Projects/fretline && rm -rf node_modules && npm ci
npm test                # tudo verde antes de começar
```

## Global Constraints

- Node ≥ 22; `wrangler` fixo como devDependency (`^4.138.0`), chamado por `npx wrangler`.
- Host: `https://fretline-assets.bbraian.workers.dev`; Worker `fretline-assets`; config `tools/assets-worker/wrangler.jsonc` (já existe, não muda); pasta publicada `.assets-dist/` (já no `.gitignore`).
- Preview: `preview.opus`, 30 s, Opus 96 kbps, fade de 0,5 s na entrada e 1 s na saída.
- Início do preview: preview do pack → 0; senão `preview_start_time` do `song.ini`; senão 35% da duração.
- `library.json`: `{ "base": "songs/", "songs": [{ id, path, files }] }`, com `base` **relativo**; o cliente resolve com `new URL(base, urlDoIndice)`. Sem `base`, o prefixo é `/library/file`.
- Com `VITE_ASSETS_BASE`, o cliente pede **só** `${base}/library.json`; sem ela, **só** `/library/index.json`. O caminho `/library/remote.json` sai.
- `.assets-dist/` é montado com hard links (cópia se o link falhar), **exceto** o preview: `preview.*` do pack nunca entra por link, e o gerado é sempre arquivo novo. `songs/` nunca é modificada.
- `VITE_ASSETS_BASE` **não** fica no `.env` local — só na Vercel, e no `npm run hosted`, que a passa sozinho.
- Camadas: nada novo em `src/engine/`. Rótulos no JSX em caixa normal (os scripts acham botões por regex case-sensitive).
- Estilo: comentários e nomes de teste em português, na densidade dos arquivos vizinhos; `tools/` usa nomes em português (`varrerMusicas`), `src/` em inglês.
- Commits no estilo do repositório (`feat: …`), terminando com a linha `Co-Authored-By` da sessão.
- Trabalho num branch `hospedagem-parte-1`. **Nada é enviado ao GitHub antes da Task 7** — um push em `main` publica na Vercel.

## Review Focus

- `preview_start_time` depois do fim da faixa, ou faixa com menos de 30 s → o clipe recua para caber e nunca sai vazio nem com início negativo (Task 1, testes de `previewClip`).
- Pasta com chart e sem áudio, ou só com `crowd.ogg` → nenhuma faixa vira preview, a publicação segue, e o índice não lista `preview.opus` para ela (Task 1, testes de `pickPreviewSource` e `buildManifest`).
- Pack com `preview.ogg` → o índice lista só o `preview.opus` gerado, e o arquivo original em `songs/` continua byte a byte igual (Task 1, teste de `buildManifest`; Task 2, conferência por hash de `songs/`).
- `VITE_ASSETS_BASE` com barra no fim ou com subcaminho → índice e arquivos resolvidos no lugar certo, sem `//` (Task 3, testes de `libraryIndexUrl` e `filePrefix`).
- Uma pasta que falha no meio da biblioteca → as outras carregam, na ordem do índice (Task 3, testes de `mapInOrder`).

---

### Task 1: As partes puras da publicação

**Files:**
- Create: `tools/upload-assets-lib.mjs`
- Create: `tools/upload-assets-lib.test.mjs`
- Modify: `vite.config.ts` (bloco `test.include`)

**Interfaces:**
- Consumes: nada.
- Produces (todos exportados de `tools/upload-assets-lib.mjs`):
  - `PREVIEW_SECONDS = 30`, `PREVIEW_FILE = 'preview.opus'`, `HEADERS` (string do `_headers`)
  - `interessa(nome: string): boolean`
  - `varrerMusicas(raiz: string): Promise<Array<{ id: string, path: string, files: string[] }>>`
  - `listar(raiz: string): Promise<string[]>` (caminhos relativos com `/`)
  - `readIni(texto: string): Record<string, string>` (chaves em minúsculas)
  - `pickPreviewSource(arquivos: string[]): { name: string, fromPack: boolean } | null`
  - `previewClip({ fromPack, previewStartMs, sourceSeconds }): { start: number, length: number } | null`
  - `ffmpegPreviewArgs({ input, output, start, length }): string[]`
  - `publishedFiles(arquivos: string[]): string[]`
  - `buildManifest(musicas: Array<{ id, path, files, hasPreview: boolean }>): { base: 'songs/', songs: Array<{ id, path, files }> }`

- [ ] **Step 1: Criar o branch e registrar o spec**

```bash
git switch -c hospedagem-parte-1
git add docs/superpowers/specs/2026-09-22-hospedagem-e-loading-design.md docs/superpowers/plans/2026-09-24-hospedagem-parte-1-publicacao.md
git commit -m "docs: plano da parte 1 da hospedagem

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 2: Incluir os testes de `tools/` no vitest**

Em `vite.config.ts`, trocar:

```ts
    include: ['src/**/*.test.ts'],
```

por:

```ts
    // `tools/` entra pelas partes puras dos scripts de Node, que não têm
    // TypeScript e por isso ficam em `.mjs`.
    include: ['src/**/*.test.ts', 'tools/**/*.test.mjs'],
```

- [ ] **Step 3: Escrever os testes que falham**

`tools/upload-assets-lib.test.mjs`:

```js
import { describe, expect, it } from 'vitest'
import {
  PREVIEW_FILE,
  buildManifest,
  ffmpegPreviewArgs,
  pickPreviewSource,
  previewClip,
  publishedFiles,
  readIni,
} from './upload-assets-lib.mjs'

describe('readIni', () => {
  it('lê chave e valor, com a chave em minúsculas', () => {
    const ini = readIni('[song]\nName = Barracuda\npreview_start_time = 45000\n')
    expect(ini).toEqual({ name: 'Barracuda', preview_start_time: '45000' })
  })

  it('ignora comentários, seções e o BOM do início', () => {
    const ini = readIni('﻿[song]\r\n; x = 1\r\n# y = 2\r\nsong_length = 200000\r\n')
    expect(ini).toEqual({ song_length: '200000' })
  })
})

describe('pickPreviewSource', () => {
  it('prefere o preview do pack', () => {
    expect(pickPreviewSource(['song.opus', 'preview.ogg', 'guitar.opus'])).toEqual({
      name: 'preview.ogg',
      fromPack: true,
    })
  })

  it('sem preview, pega a faixa de fundo e não um instrumento', () => {
    expect(pickPreviewSource(['guitar.opus', 'song.opus', 'drums_1.opus'])).toEqual({
      name: 'song.opus',
      fromPack: false,
    })
  })

  it('só com instrumentos separados, pega o primeiro em ordem alfabética', () => {
    expect(pickPreviewSource(['rhythm.ogg', 'guitar.ogg'])).toEqual({
      name: 'guitar.ogg',
      fromPack: false,
    })
  })

  it('nunca escolhe a plateia gravada', () => {
    expect(pickPreviewSource(['crowd.ogg', 'guitar.ogg'])?.name).toBe('guitar.ogg')
    expect(pickPreviewSource(['crowd.ogg', 'notes.mid'])).toBeNull()
  })

  it('sem áudio nenhum, não há preview', () => {
    expect(pickPreviewSource(['notes.mid', 'song.ini'])).toBeNull()
  })
})

describe('previewClip', () => {
  it('o preview do pack é reencodado desde o início', () => {
    expect(previewClip({ fromPack: true, previewStartMs: 45000, sourceSeconds: 25 })).toEqual({
      start: 0,
      length: 25,
    })
  })

  it('usa o preview_start_time do song.ini', () => {
    expect(previewClip({ fromPack: false, previewStartMs: 45000, sourceSeconds: 200 })).toEqual({
      start: 45,
      length: 30,
    })
  })

  it('sem preview_start_time, começa em 35% da faixa', () => {
    const clip = previewClip({ fromPack: false, previewStartMs: 0, sourceSeconds: 200 })
    expect(clip.start).toBeCloseTo(70, 5)
    expect(clip.length).toBe(30)
  })

  it('trata preview_start_time negativo como ausente', () => {
    const clip = previewClip({ fromPack: false, previewStartMs: -1, sourceSeconds: 200 })
    expect(clip.start).toBeCloseTo(70, 5)
  })

  it('um início perto do fim recua para o clipe caber inteiro', () => {
    expect(previewClip({ fromPack: false, previewStartMs: 190000, sourceSeconds: 200 })).toEqual({
      start: 170,
      length: 30,
    })
  })

  it('uma faixa curta vira um clipe curto, desde o começo', () => {
    expect(previewClip({ fromPack: false, previewStartMs: 0, sourceSeconds: 20 })).toEqual({
      start: 0,
      length: 20,
    })
  })

  it('sem duração conhecida, não há clipe', () => {
    expect(previewClip({ fromPack: false, previewStartMs: 0, sourceSeconds: NaN })).toBeNull()
    expect(previewClip({ fromPack: false, previewStartMs: 0, sourceSeconds: 0 })).toBeNull()
  })
})

describe('ffmpegPreviewArgs', () => {
  const args = ffmpegPreviewArgs({ input: 'in.opus', output: 'out.opus', start: 45, length: 20 })

  it('corta na entrada, antes do -i', () => {
    const i = args.indexOf('-i')
    expect(args.slice(0, i)).toEqual(expect.arrayContaining(['-ss', '45.000', '-t', '20.000']))
    expect(args[i + 1]).toBe('in.opus')
  })

  it('o fade de saída termina junto com o clipe', () => {
    expect(args).toContain('afade=t=in:d=0.5,afade=t=out:st=19.000:d=1')
  })

  it('encoda em Opus a 96 kbps e escreve por último a saída', () => {
    expect(args).toEqual(expect.arrayContaining(['-c:a', 'libopus', '-b:a', '96k']))
    expect(args.at(-1)).toBe('out.opus')
  })
})

describe('publishedFiles', () => {
  it('deixa de fora o preview do pack e o que o jogo não lê', () => {
    expect(publishedFiles(['song.opus', 'preview.opus', 'album.jpg', 'notes.mid', 'song.ini'])).toEqual(
      ['song.opus', 'notes.mid', 'song.ini'],
    )
  })
})

describe('buildManifest', () => {
  const manifest = buildManifest([
    { id: 'B', path: 'B', files: ['song.ogg', 'preview.ogg', 'notes.mid'], hasPreview: true },
    { id: 'A', path: 'A', files: ['notes.mid'], hasPreview: false },
  ])

  it('tem base relativa', () => {
    expect(manifest.base).toBe('songs/')
  })

  it('ordena as músicas pelo caminho', () => {
    expect(manifest.songs.map((s) => s.id)).toEqual(['A', 'B'])
  })

  it('troca o preview do pack pelo gerado, uma vez só', () => {
    expect(manifest.songs[1].files).toEqual(['notes.mid', PREVIEW_FILE, 'song.ogg'])
  })

  it('sem preview gerado, não lista preview', () => {
    expect(manifest.songs[0].files).toEqual(['notes.mid'])
  })
})
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run tools/upload-assets-lib.test.mjs`
Expected: FAIL — `Failed to load url ./upload-assets-lib.mjs` (o arquivo não existe).

- [ ] **Step 5: Implementar**

`tools/upload-assets-lib.mjs` — `interessa`, `temChart`, `varrerMusicas` e `listar` são os de `tools/upload-assets.mjs` sem mudança (só ganham `export`); o resto é novo:

```js
/**
 * As partes da publicação que não chamam ferramenta externa.
 *
 * Ficam fora de `upload-assets.mjs` para serem testadas em Node, sem
 * ffmpeg e sem rede: qual faixa vira preview, de onde a onde, e o que entra
 * no índice. O resto do script é hard link, ffmpeg e wrangler.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

const CHART_EXTENSIONS = ['.chart', '.mid', '.midi']
const AUDIO_EXTENSIONS = ['.ogg', '.mp3', '.opus', '.wav', '.m4a']

/** Duração do clipe de preview, em segundos. */
export const PREVIEW_SECONDS = 30

/** O nome do preview gerado — o mesmo para toda música. */
export const PREVIEW_FILE = 'preview.opus'

/**
 * O `_headers` do host. Só CORS: o cache fica no padrão da Cloudflare
 * (revalida com `ETag`), para uma música substituída nunca chegar velha.
 */
export const HEADERS = '/*\n  Access-Control-Allow-Origin: *\n'

/** Os mesmos arquivos que o plugin de desenvolvimento considera. */
export function interessa(nome) {
  const ext = path.extname(nome).toLowerCase()
  return (
    CHART_EXTENSIONS.includes(ext) ||
    AUDIO_EXTENSIONS.includes(ext) ||
    nome.toLowerCase() === 'song.ini'
  )
}

function temChart(arquivos) {
  return arquivos.some((f) => CHART_EXTENSIONS.includes(path.extname(f).toLowerCase()))
}

/** Percorre `songs/` procurando pastas com chart, como o plugin faz. */
export async function varrerMusicas(raiz, relativo = '', profundidade = 0, achados = []) {
  if (profundidade > 4) return achados

  let itens
  try {
    itens = await fs.readdir(path.join(raiz, relativo), { withFileTypes: true })
  } catch {
    return achados
  }

  const arquivos = itens.filter((i) => i.isFile()).map((i) => i.name)
  if (temChart(arquivos)) {
    const segmentos = relativo.split(path.sep).filter(Boolean)
    achados.push({
      id: segmentos.at(-1) ?? 'raiz',
      path: segmentos.join('/'),
      files: arquivos.filter(interessa),
    })
  }

  for (const item of itens) {
    if (!item.isDirectory()) continue
    await varrerMusicas(raiz, path.join(relativo, item.name), profundidade + 1, achados)
  }

  return achados
}

/** Lista recursiva de arquivos, para os modelos. */
export async function listar(raiz, relativo = '', achados = []) {
  let itens
  try {
    itens = await fs.readdir(path.join(raiz, relativo), { withFileTypes: true })
  } catch {
    return achados
  }
  for (const item of itens) {
    const caminho = path.join(relativo, item.name)
    if (item.isDirectory()) await listar(raiz, caminho, achados)
    else achados.push(caminho.split(path.sep).join('/'))
  }
  return achados
}

function semExtensao(nome) {
  return nome.replace(/\.[^.]+$/, '').toLowerCase()
}

function ehAudio(nome) {
  return AUDIO_EXTENSIONS.includes(path.extname(nome).toLowerCase())
}

/** `preview.ogg`, `preview.opus`… — o clipe que veio no pack. */
function ehPreview(nome) {
  return ehAudio(nome) && semExtensao(nome) === 'preview'
}

// O critério de `roleOf` em `src/songs/library.ts`: o que não é instrumento
// separado é a banda já misturada.
const INSTRUMENTO = /^(guitar|rhythm|bass|drums?|vocals)/i

/**
 * Lê um `song.ini` só no que a publicação precisa.
 *
 * O leitor de verdade é `src/songs/songIni.ts`, em TypeScript; este script
 * roda em Node puro e quer um número, então chave e valor bastam. Chaves em
 * minúsculas, como o Clone Hero as trata.
 */
export function readIni(texto) {
  const campos = {}
  for (const linha of texto.replace(/^﻿/, '').split(/\r?\n/)) {
    const par = linha.match(/^\s*([^=;#[\s][^=]*?)\s*=\s*(.*?)\s*$/)
    if (par) campos[par[1].toLowerCase()] = par[2]
  }
  return campos
}

/**
 * De qual arquivo sai o preview.
 *
 * O clipe do pack ganha sempre: é o trecho que o charter escolheu. Sem ele,
 * a faixa de fundo — a banda misturada soa como a música, um instrumento
 * isolado não. Só sem ela vale o primeiro áudio, e a plateia gravada nunca.
 */
export function pickPreviewSource(arquivos) {
  const audios = arquivos.filter(ehAudio).sort()
  const pack = audios.find(ehPreview)
  if (pack) return { name: pack, fromPack: true }

  const mixagem = audios.filter((nome) => semExtensao(nome) !== 'crowd')
  const nome = mixagem.find((n) => !INSTRUMENTO.test(semExtensao(n))) ?? mixagem[0]
  return nome ? { name: nome, fromPack: false } : null
}

/**
 * Onde o clipe começa e quanto dura, em segundos.
 *
 * O do pack é reencodado desde o início. Nos outros vale o
 * `preview_start_time`; sem ele, 35% da faixa, que costuma cair depois da
 * introdução. Em qualquer caso o clipe cabe na faixa: um início perto do fim
 * recua, e uma faixa curta vira um clipe curto — nunca um arquivo vazio.
 */
export function previewClip({ fromPack, previewStartMs, sourceSeconds }) {
  if (!(sourceSeconds > 0)) return null
  const pedido = fromPack ? 0 : previewStartMs > 0 ? previewStartMs / 1000 : sourceSeconds * 0.35
  const start = Math.max(0, Math.min(pedido, sourceSeconds - PREVIEW_SECONDS))
  return { start, length: Math.min(PREVIEW_SECONDS, sourceSeconds - start) }
}

/**
 * Os argumentos do ffmpeg para um clipe.
 *
 * `-ss` e `-t` antes do `-i` cortam na entrada, sem decodificar o começo da
 * faixa. O fade de saída conta do fim do clipe, não dos 30 s: um clipe curto
 * também termina em fade. `bitexact` tira do arquivo o que muda a cada
 * execução (o número de série do Ogg), para que publicar de novo não reenvie
 * previews idênticos.
 */
export function ffmpegPreviewArgs({ input, output, start, length }) {
  const fadeOut = Math.max(0, length - 1)
  return [
    '-hide_banner', '-v', 'error', '-y',
    '-ss', start.toFixed(3), '-t', length.toFixed(3), '-i', input,
    '-map', '0:a:0', '-vn', '-map_metadata', '-1',
    '-af', `afade=t=in:d=0.5,afade=t=out:st=${fadeOut.toFixed(3)}:d=1`,
    '-c:a', 'libopus', '-b:a', '96k',
    '-fflags', '+bitexact', '-flags:a', '+bitexact',
    output,
  ]
}

/**
 * Os arquivos de uma música que vão para o host como estão.
 *
 * O preview do pack fica de fora: o gerado toma o lugar dele, e ele nunca
 * pode entrar por hard link — ver `gerarPreview` em `upload-assets.mjs`.
 */
export function publishedFiles(arquivos) {
  return arquivos.filter((nome) => interessa(nome) && !ehPreview(nome))
}

/**
 * O índice que o jogo lê do host: a forma do `/library/index.json` do
 * plugin, mais um `base` relativo. O cliente resolve o `base` contra a URL
 * do próprio índice, então o índice não sabe em que domínio está.
 *
 * Um preview só por música: o cliente pega o primeiro `preview.*` que acha.
 */
export function buildManifest(musicas) {
  return {
    base: 'songs/',
    songs: musicas
      .map(({ id, path: caminho, files, hasPreview }) => ({
        id,
        path: caminho,
        files: [...publishedFiles(files), ...(hasPreview ? [PREVIEW_FILE] : [])].sort(),
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  }
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run tools/upload-assets-lib.test.mjs`
Expected: PASS, 22 testes.

Run: `npm test`
Expected: PASS, todos (os antigos mais os 22).

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts tools/upload-assets-lib.mjs tools/upload-assets-lib.test.mjs
git commit -m "feat: partes puras da publicação — preview e índice

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `upload-assets` publica na Cloudflare

**Files:**
- Modify (reescrita inteira): `tools/upload-assets.mjs`
- Modify: `package.json`, `package-lock.json` (sai `@vercel/blob`, entra `wrangler`; `engines`)
- Create: `.nvmrc`

**Interfaces:**
- Consumes: tudo o que a Task 1 exporta.
- Produces: `node tools/upload-assets.mjs [--dry-run]` — monta `.assets-dist/` (`_headers`, `library.json`, `songs/<path>/…` com `preview.opus`, `models/…`) e, sem `--dry-run`, publica. A Task 5 depende do `--dry-run`.

- [ ] **Step 1: Trocar as dependências e fixar o Node**

```bash
npm uninstall @vercel/blob
npm install -D wrangler@^4.138.0
echo 22 > .nvmrc
```

Em `package.json`, logo depois de `"type": "module",`:

```json
  "engines": {
    "node": ">=22"
  },
```

Run: `npx wrangler --version`
Expected: `4.138.x` ou mais novo, sem aviso de engine.

- [ ] **Step 2: Reescrever `tools/upload-assets.mjs`**

Conteúdo inteiro:

```js
/**
 * Publica músicas e modelos no host de assets da versão hospedada.
 *
 * ## Por que isto existe
 *
 * Na própria máquina, `songs/` é servida pelo plugin de desenvolvimento
 * (`tools/songs-plugin.mjs`) e `public/models/` sai do próprio servidor.
 * Nenhuma das duas coisas sobrevive a um deploy estático: o plugin é
 * middleware do Vite e não roda na Vercel, e as duas pastas somam mais de
 * trezentos megabytes que não fazem sentido no repositório.
 *
 * Então elas vão para um Worker só de assets na Cloudflare
 * (`fretline-assets`), com o índice da biblioteca ao lado. O jogo aprende a
 * ler de lá por `VITE_ASSETS_BASE` — ver `src/songs/libraryIndex.ts` e
 * `src/render/assetBase.ts`.
 *
 * ## Como usar
 *
 *     npm run upload-assets              monta, gera os previews e publica
 *     npm run upload-assets -- --dry-run só monta `.assets-dist/`
 *
 * Precisa de `ffmpeg` e `ffprobe` no PATH e de `npx wrangler login` feito
 * uma vez. O wrangler só envia o que mudou, e cada publicação substitui a
 * anterior inteira: o que saiu de `songs/` sai do host também.
 *
 * ## O que vai para o host
 *
 *     _headers                 CORS aberto
 *     library.json             o índice — ver `buildManifest`
 *     songs/<pasta>/…          chart, song.ini, áudio e o preview.opus gerado
 *     models/…                 public/models/ inteiro
 *
 * Os arquivos entram por hard link, não por cópia: são centenas de
 * megabytes que não precisam existir duas vezes em disco. A exceção é o
 * preview — ver `gerarPreview`.
 */

import { execFile, spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  HEADERS,
  PREVIEW_FILE,
  buildManifest,
  ffmpegPreviewArgs,
  listar,
  pickPreviewSource,
  previewClip,
  publishedFiles,
  readIni,
  varrerMusicas,
} from './upload-assets-lib.mjs'

const executar = promisify(execFile)

const DIST = path.resolve('.assets-dist')
const CONFIG = 'tools/assets-worker/wrangler.jsonc'

/** Para com a instrução exata, em vez de falhar no meio da montagem. */
async function conferirFerramentas() {
  for (const ferramenta of ['ffmpeg', 'ffprobe']) {
    try {
      await executar(ferramenta, ['-version'])
    } catch {
      console.error(`Falta o ${ferramenta} no PATH. Instale com: sudo apt install ffmpeg`)
      process.exit(1)
    }
  }
  const { stdout } = await executar('ffmpeg', ['-hide_banner', '-encoders'])
  if (!/\blibopus\b/.test(stdout)) {
    console.error('Este ffmpeg não tem o encoder libopus. Use o do sistema: sudo apt install ffmpeg')
    process.exit(1)
  }
}

/**
 * Hard link, e cópia quando o link não é possível — `.assets-dist/` noutro
 * volume, ou um sistema de arquivos que não os aceita.
 */
async function linkarOuCopiar(origem, destino) {
  await fs.mkdir(path.dirname(destino), { recursive: true })
  try {
    await fs.link(origem, destino)
  } catch (erro) {
    if (erro.code !== 'EXDEV' && erro.code !== 'EPERM') throw erro
    await fs.copyFile(origem, destino)
  }
}

async function duracao(arquivo) {
  const { stdout } = await executar('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arquivo,
  ])
  return Number.parseFloat(stdout)
}

/**
 * Gera o `preview.opus` de uma música dentro de `.assets-dist/`.
 *
 * Lê de `songs/` e escreve num arquivo que ainda não existe: o destino nunca
 * é um hard link. Se fosse, o ffmpeg escrevendo por cima truncaria o
 * original em `songs/` — é por isso que `publishedFiles` deixa o preview do
 * pack fora dos links.
 *
 * A duração vem sempre do `ffprobe`, e não do `song_length` do `.ini`: o
 * fade de saída precisa do tamanho real da faixa de qualquer jeito, e o
 * `.ini` às vezes mente.
 */
async function gerarPreview(pastaOrigem, pastaDestino, arquivos) {
  const fonte = pickPreviewSource(arquivos)
  if (!fonte) return false

  let previewStartMs = 0
  const ini = arquivos.find((nome) => nome.toLowerCase() === 'song.ini')
  if (ini) {
    const campos = readIni(await fs.readFile(path.join(pastaOrigem, ini), 'utf8'))
    previewStartMs = Number(campos.preview_start_time) || 0
  }

  const entrada = path.join(pastaOrigem, fonte.name)
  const clip = previewClip({
    fromPack: fonte.fromPack,
    previewStartMs,
    sourceSeconds: await duracao(entrada),
  })
  if (!clip) return false

  await fs.mkdir(pastaDestino, { recursive: true })
  const saida = path.join(pastaDestino, PREVIEW_FILE)
  await executar('ffmpeg', ffmpegPreviewArgs({ input: entrada, output: saida, ...clip }))
  return true
}

async function montar() {
  // Apagar a pasta desfaz só os links; os originais ficam onde estão.
  await fs.rm(DIST, { recursive: true, force: true })
  await fs.mkdir(DIST, { recursive: true })

  const raizMusicas = path.resolve('songs')
  const musicas = await varrerMusicas(raizMusicas)
  console.log(`${musicas.length} música(s) em songs/`)

  const publicadas = []
  for (const musica of musicas) {
    const segmentos = musica.path.split('/').filter(Boolean)
    const origem = path.join(raizMusicas, ...segmentos)
    const destino = path.join(DIST, 'songs', ...segmentos)

    for (const arquivo of publishedFiles(musica.files)) {
      await linkarOuCopiar(path.join(origem, arquivo), path.join(destino, arquivo))
    }

    let hasPreview = false
    try {
      hasPreview = await gerarPreview(origem, destino, musica.files)
    } catch (erro) {
      // Um áudio que o ffmpeg não lê não derruba a publicação: a música vai
      // sem preview, e o menu cai na faixa inteira.
      console.warn(`  ! ${musica.id}: preview não gerado — ${String(erro.message).split('\n')[0]}`)
    }
    publicadas.push({ ...musica, hasPreview })
    console.log(`  ✓ ${musica.id}${hasPreview ? '' : ' (sem preview)'}`)
  }

  const raizModelos = path.resolve('public/models')
  const modelos = await listar(raizModelos)
  for (const modelo of modelos) {
    const segmentos = modelo.split('/')
    await linkarOuCopiar(path.join(raizModelos, ...segmentos), path.join(DIST, 'models', ...segmentos))
  }
  console.log(`${modelos.length} arquivo(s) de public/models/`)

  const indice = buildManifest(publicadas)
  await fs.writeFile(path.join(DIST, 'library.json'), JSON.stringify(indice, null, 2) + '\n')
  await fs.writeFile(path.join(DIST, '_headers'), HEADERS)
}

/**
 * Publica `.assets-dist/` e devolve a URL que o wrangler imprimiu.
 *
 * A saída vai para o terminal enquanto chega — o primeiro envio leva
 * minutos — e fica guardada para achar a URL no fim.
 */
function publicar() {
  return new Promise((resolve, reject) => {
    const filho = spawn('npx', ['wrangler', 'deploy', '--config', CONFIG], {
      stdio: ['inherit', 'pipe', 'inherit'],
    })
    let saida = ''
    filho.stdout.on('data', (pedaco) => {
      process.stdout.write(pedaco)
      saida += pedaco
    })
    filho.on('error', reject)
    filho.on('close', (codigo) => {
      if (codigo !== 0) reject(new Error(`o wrangler deploy saiu com código ${codigo}`))
      else resolve(saida.match(/https:\/\/\S+\.workers\.dev/)?.[0] ?? null)
    })
  })
}

async function main() {
  const ensaio = process.argv.includes('--dry-run')

  await conferirFerramentas()
  await montar()

  if (ensaio) {
    console.log('\n--dry-run: .assets-dist/ montado, nada publicado.')
    return
  }

  const url = await publicar()
  console.log('\nPublicado. A variável do projeto na Vercel é:')
  console.log(`  VITE_ASSETS_BASE=${url ?? 'https://fretline-assets.<subdominio>.workers.dev'}`)
  console.log('Ela só muda se a URL mudar; música nova não pede deploy na Vercel.')
}

await main()
```

- [ ] **Step 3: Tirar a impressão digital de `songs/` antes**

```bash
S=/tmp/fretline-parte1 && mkdir -p $S
find songs -type f -exec md5sum {} + | sort -k2 > $S/songs-antes.md5
```

- [ ] **Step 4: Montar sem publicar**

Run: `npm run upload-assets -- --dry-run`
Expected: `25 música(s) em songs/`, 25 linhas `✓` (nenhuma com `(sem preview)`), `35 arquivo(s) de public/models/` (o número de `find public/models -type f | wc -l`), e `--dry-run: .assets-dist/ montado, nada publicado.`

- [ ] **Step 5: Conferir o que foi montado**

```bash
ls .assets-dist/songs/*/preview.opus | wc -l                       # 25
for f in .assets-dist/songs/*/preview.opus; do ffprobe -v error -show_entries format=duration -of csv=p=0 "$f"; done | sort -n | sed -n '1p;$p'
                                                                   # menor > 0, maior ≤ 30.05
du -ch .assets-dist/songs/*/preview.opus | tail -1                 # ~8–10 MB (≈ 360 KB cada)
node -e 'const i=require("./.assets-dist/library.json"); const semPrev=i.songs.filter(s=>!s.files.includes("preview.opus")); const dup=i.songs.filter(s=>s.files.filter(f=>/^preview\./i.test(f)).length!==1); console.log(i.base, i.songs.length, semPrev.length, dup.length)'
                                                                   # songs/ 25 0 0
cat .assets-dist/_headers                                          # /*  Access-Control-Allow-Origin: *
```

Ouvir um preview gerado de um pack **sem** preview próprio (qualquer pasta que não tinha `preview.opus` em `songs/`): `ffplay -autoexit -nodisp ".assets-dist/songs/<pasta>/preview.opus"`. Tem que soar como a música, com fade no começo e no fim.

- [ ] **Step 6: `songs/` intocada e previews determinísticos**

```bash
find songs -type f -exec md5sum {} + | sort -k2 > $S/songs-depois.md5
diff $S/songs-antes.md5 $S/songs-depois.md5 && echo "songs/ intacta"
md5sum .assets-dist/songs/*/preview.opus | sort -k2 > $S/prev-1.md5
npm run upload-assets -- --dry-run > /dev/null
md5sum .assets-dist/songs/*/preview.opus | sort -k2 > $S/prev-2.md5
diff $S/prev-1.md5 $S/prev-2.md5 && echo "previews determinísticos"
find songs -type f -exec md5sum {} + | sort -k2 | diff $S/songs-antes.md5 - && echo "songs/ intacta de novo"
```

Expected: as três mensagens. Se os previews diferirem entre execuções, o `bitexact` não está pegando — investigue com `cmp -l` antes de seguir (não é bloqueante para o jogo, mas faz cada publicação reenviar ~9 MB).

- [ ] **Step 7: Commit**

```bash
git add tools/upload-assets.mjs package.json package-lock.json .nvmrc
git commit -m "feat: upload-assets publica na Cloudflare com previews gerados

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: O cliente lê o índice do host

**Files:**
- Create: `src/songs/libraryIndex.ts`, `src/songs/libraryIndex.test.ts`
- Create: `src/songs/mapInOrder.ts`, `src/songs/mapInOrder.test.ts`
- Modify: `src/songs/library.ts:374-445` (bloco do índice e `loadLocalLibrary`)
- Delete: `public/library/remote.json`

**Interfaces:**
- Consumes: o formato de `library.json` da Task 1 (`buildManifest`).
- Produces:
  - `libraryIndexUrl(assetsBase: string | undefined): string`
  - `filePrefix(index: LibraryIndex, indexUrl: string, page: string): string`
  - `type LibraryIndex = { base?: string; songs: Array<{ id: string; path: string; files: string[] }> }`
  - `mapInOrder<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>, onProgress?: (done: number, total: number) => void): Promise<R[]>`
  - `loadLocalLibrary(onProgress?: (done: number, total: number) => void): Promise<SongEntry[]>` — a tela de abertura (parte 3) usa o `onProgress`.

- [ ] **Step 1: Testes que falham — `libraryIndex`**

`src/songs/libraryIndex.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { filePrefix, libraryIndexUrl } from './libraryIndex'

describe('libraryIndexUrl', () => {
  it('sem host de assets, é o índice do plugin', () => {
    expect(libraryIndexUrl(undefined)).toBe('/library/index.json')
    expect(libraryIndexUrl('')).toBe('/library/index.json')
  })

  it('com host, é o library.json dele', () => {
    expect(libraryIndexUrl('https://a.workers.dev')).toBe('https://a.workers.dev/library.json')
  })

  it('tolera barra no fim e subcaminho', () => {
    expect(libraryIndexUrl('https://a.workers.dev/')).toBe('https://a.workers.dev/library.json')
    expect(libraryIndexUrl('https://h.dev/sub/')).toBe('https://h.dev/sub/library.json')
  })
})

describe('filePrefix', () => {
  const page = 'https://fretline.vercel.app/'

  it('sem base, os arquivos saem do plugin', () => {
    expect(filePrefix({ songs: [] }, '/library/index.json', page)).toBe('/library/file')
  })

  it('resolve o base relativo contra a URL do índice, não da página', () => {
    expect(filePrefix({ base: 'songs/', songs: [] }, 'https://a.workers.dev/library.json', page)).toBe(
      'https://a.workers.dev/songs',
    )
  })

  it('mantém o subcaminho do host', () => {
    expect(filePrefix({ base: 'songs/', songs: [] }, 'https://h.dev/sub/library.json', page)).toBe(
      'https://h.dev/sub/songs',
    )
  })

  it('aceita base absoluta, como o manifesto antigo', () => {
    expect(filePrefix({ base: 'https://b.dev/songs/', songs: [] }, 'https://a.dev/library.json', page)).toBe(
      'https://b.dev/songs',
    )
  })
})
```

- [ ] **Step 2: Testes que falham — `mapInOrder`**

`src/songs/mapInOrder.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mapInOrder } from './mapInOrder'

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('mapInOrder', () => {
  it('devolve na ordem da entrada, mesmo terminando fora de ordem', async () => {
    const atrasos = [30, 5, 20, 1]
    const out = await mapInOrder(atrasos, 4, async (ms, i) => {
      await esperar(ms)
      return i
    })
    expect(out).toEqual([0, 1, 2, 3])
  })

  it('nunca passa do limite de tarefas no ar', async () => {
    let noAr = 0
    let pico = 0
    await mapInOrder(Array.from({ length: 20 }, (_, i) => i), 6, async () => {
      pico = Math.max(pico, ++noAr)
      await esperar(2)
      noAr--
    })
    expect(pico).toBe(6)
  })

  it('conta o progresso até o total', async () => {
    const chamadas: Array<[number, number]> = []
    await mapInOrder([1, 2, 3], 2, async (x) => x, (feitos, total) => chamadas.push([feitos, total]))
    expect(chamadas).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ])
  })

  it('um item que falhou e virou null não atrapalha os outros', async () => {
    const out = await mapInOrder(['a', 'ruim', 'c'], 2, async (x) => (x === 'ruim' ? null : x))
    expect(out).toEqual(['a', null, 'c'])
  })

  it('lista vazia devolve vazio sem chamar o progresso', async () => {
    let chamou = false
    expect(await mapInOrder([], 6, async (x) => x, () => (chamou = true))).toEqual([])
    expect(chamou).toBe(false)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/songs/libraryIndex.test.ts src/songs/mapInOrder.test.ts`
Expected: FAIL — os dois módulos não existem.

- [ ] **Step 4: Implementar `libraryIndex.ts`**

```ts
/**
 * Onde está o índice da biblioteca, e de onde saem os arquivos dele.
 *
 * Duas origens, um formato. Na própria máquina, o plugin de
 * desenvolvimento serve `/library/index.json` e os arquivos em
 * `/library/file/`. Na versão hospedada, o índice é o `library.json` que
 * `npm run upload-assets` publica ao lado das músicas.
 */

export interface LibraryIndex {
  /**
   * Onde estão os arquivos, relativo à URL do próprio índice.
   *
   * O plugin não manda: os arquivos saem dele, em `/library/file/`. O índice
   * publicado manda `songs/`. Resolver contra a URL do índice é o que deixa
   * o índice sem saber em que domínio está — mudar de host é mudar só
   * `VITE_ASSETS_BASE`.
   */
  base?: string
  songs: Array<{ id: string; path: string; files: string[] }>
}

/** A URL do índice: a do host de assets, quando há um, ou a do plugin. */
export function libraryIndexUrl(assetsBase: string | undefined): string {
  const base = assetsBase?.trim().replace(/\/+$/, '')
  return base ? `${base}/library.json` : '/library/index.json'
}

/**
 * O prefixo dos arquivos de um índice, sem barra no fim.
 *
 * `page` só entra para resolver um índice de endereço relativo — o do
 * plugin, que mora no mesmo servidor da página.
 */
export function filePrefix(index: LibraryIndex, indexUrl: string, page: string): string {
  if (!index.base) return '/library/file'
  return new URL(index.base, new URL(indexUrl, page)).href.replace(/\/+$/, '')
}
```

- [ ] **Step 5: Implementar `mapInOrder.ts`**

```ts
/**
 * `map` assíncrono com no máximo `limit` tarefas no ar, e o resultado na
 * ordem da entrada — não na ordem em que as tarefas terminam.
 *
 * Existe para a biblioteca: com o índice num host remoto, ler as pastas uma
 * atrás da outra eram dezenas de pedidos em série. Todas de uma vez
 * disputariam banda com os modelos.
 *
 * `fn` não deve rejeitar: quem chama decide o que fazer com a falha de um
 * item (a biblioteca pula a pasta). Uma rejeição rejeita tudo.
 */
export async function mapInOrder<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let done = 0

  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
      onProgress?.(++done, items.length)
    }
  }

  const workers = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workers }, worker))
  return results
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/songs/libraryIndex.test.ts src/songs/mapInOrder.test.ts`
Expected: PASS, 12 testes.

- [ ] **Step 7: Ligar em `library.ts`**

No topo, junto dos outros imports:

```ts
import { filePrefix, libraryIndexUrl, type LibraryIndex } from './libraryIndex'
import { mapInOrder } from './mapInOrder'
```

Substituir **tudo** de `/**\n * Carrega a pasta \`songs/\` do projeto, servida pelo servidor local.` (linha ~374) até o fim do arquivo por:

```ts
/**
 * O índice da biblioteca e a URL de onde ele veio.
 *
 * Um endereço só por build: o do host de assets na versão hospedada, o do
 * plugin na própria máquina. Sem índice, a biblioteca fica vazia e o
 * catálogo cai na faixa de demonstração.
 */
async function fetchLibraryIndex(): Promise<{ index: LibraryIndex; url: string } | null> {
  const url = libraryIndexUrl(import.meta.env.VITE_ASSETS_BASE)
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return { index: (await response.json()) as LibraryIndex, url }
  } catch {
    return null
  }
}

/** Quantas pastas da biblioteca são lidas ao mesmo tempo. */
const PARALLEL_FOLDERS = 6

/**
 * Carrega a biblioteca publicada: a pasta `songs/` servida pelo plugin, ou
 * o índice do host de assets na versão hospedada.
 *
 * Os endereços são URLs normais, então a biblioteca continua lá depois de
 * recarregar a página — ao contrário do seletor de pastas, cujos blobs
 * morrem com a aba. `onProgress` conta pastas lidas contra o total.
 */
export async function loadLocalLibrary(
  onProgress?: (done: number, total: number) => void,
): Promise<SongEntry[]> {
  const found = await fetchLibraryIndex()
  if (!found) return []

  const prefix = filePrefix(found.index, found.url, location.href)

  const entries = await mapInOrder(
    found.index.songs,
    PARALLEL_FOLDERS,
    async (folder) => {
      const files: SongFile[] = folder.files.map((name) => {
        // Cada segmento é codificado em separado: codificar o caminho inteiro
        // escaparia as barras e o servidor não acharia a subpasta. É também
        // a forma que o host de assets considera canônica — outra
        // codificação recebe um 307 até ela.
        const segments = [...folder.path.split('/').filter(Boolean), name]
        const url = `${prefix}/${segments.map(encodeURIComponent).join('/')}`
        return {
          name,
          url,
          text: async () => (await fetch(url)).text(),
          arrayBuffer: async () => (await fetch(url)).arrayBuffer(),
        }
      })

      try {
        return await entryFromFiles(folder.id, files)
      } catch (error) {
        console.warn(`Não consegui ler a música em songs/${folder.path}:`, error)
        return null
      }
    },
    onProgress,
  )

  return entries.filter((entry): entry is SongEntry => entry !== null)
}
```

- [ ] **Step 8: Tirar o manifesto antigo e a variável do `.env`**

```bash
git rm public/library/remote.json
```

O `.env` local (fora do versionamento) define `VITE_ASSETS_BASE`. Com o cliente novo, isso faz `npm run dev` e todos os scripts de navegador lerem a biblioteca do host em vez de `songs/`. **Pergunte ao autor** e, com o sim dele, apague só essa linha:

```bash
sed -i '/^VITE_ASSETS_BASE=/d' .env
```

- [ ] **Step 9: Conferir**

Run: `npm test`
Expected: PASS, todos.

Run: `npm run build`
Expected: sem erro de tipo.

Run: `npm run library`
Expected: `✓ pasta servida: …/songs`, a música aparece na lista e toca — o caminho local continua igual.

- [ ] **Step 10: Commit**

```bash
git add src/songs/libraryIndex.ts src/songs/libraryIndex.test.ts src/songs/mapInOrder.ts src/songs/mapInOrder.test.ts src/songs/library.ts
git commit -m "feat: biblioteca lê o library.json do host, seis pastas por vez

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(O `git rm` do Step 8 já está no índice e entra neste commit.)

---

### Task 4: Música de menu pelos previews, e sem "Reler" no hospedado

**Files:**
- Modify: `src/songs/library.ts` (`backgroundAudio`, comentário; nova `menuTracks`)
- Create: `src/songs/library.test.ts`
- Modify: `src/App.tsx:12-13, 45-60`
- Modify: `src/ui/screens/SongsScreen.tsx:240-254`

**Interfaces:**
- Consumes: `SongEntry`, `backgroundAudio`, `demoEntry` de `library.ts`.
- Produces: `menuTracks(entries: SongEntry[]): Array<BackgroundAudio & { id: string }>`.

- [ ] **Step 1: Teste que falha**

`src/songs/library.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { demoEntry, menuTracks, type SongEntry } from './library'

function musica(
  campos: Partial<SongEntry>,
  meta: Partial<SongEntry['song']['meta']> = {},
): SongEntry {
  const base = demoEntry()
  return {
    ...base,
    synthesized: false,
    format: 'midi',
    ...campos,
    song: { ...base.song, meta: { ...base.song.meta, ...meta } },
  }
}

describe('menuTracks', () => {
  it('toca o preview desde o início quando ele existe', () => {
    const entry = musica(
      { preview: 'https://h/songs/a/preview.opus', tracks: [{ url: 'https://h/songs/a/song.opus', role: 'backing' }] },
      { id: 'a', previewStart: 45 },
    )
    expect(menuTracks([entry])).toEqual([{ id: 'a', url: 'https://h/songs/a/preview.opus', startAt: 0 }])
  })

  it('sem preview, toca a faixa de fundo a partir do preview_start_time', () => {
    const entry = musica(
      { tracks: [{ url: 'g.opus', role: 'guitar' }, { url: 's.opus', role: 'backing' }] },
      { id: 'b', previewStart: 45, length: 200 },
    )
    expect(menuTracks([entry])).toEqual([{ id: 'b', url: 's.opus', duration: 200, startAt: 45 }])
  })

  it('deixa de fora a faixa sintetizada e as músicas sem áudio', () => {
    expect(menuTracks([demoEntry(), musica({ tracks: [] })])).toEqual([])
  })
})
```

Run: `npx vitest run src/songs/library.test.ts`
Expected: FAIL — `menuTracks` não é exportado.

- [ ] **Step 2: Implementar `menuTracks` e atualizar o comentário de `backgroundAudio`**

Em `library.ts`, no comentário de `backgroundAudio`, trocar o parágrafo que começa em `Duas situações usam isto e pedem coisas diferentes.` até `e só então o meio.` por:

```ts
 * Duas situações usam isto: o fundo do menu e o preview da seleção. As
 * duas querem *a* parte que identifica a faixa, e aí vale a opinião de quem
 * charteou: primeiro o `preview.opus` — o do pack, ou o que
 * `upload-assets` gera para toda música publicada —, depois o
 * `preview_start_time` do `song.ini`, e só então o meio.
```

Logo depois da função `backgroundAudio`, acrescentar:

```ts
/**
 * A trilha do menu: um clipe de cada música da biblioteca.
 *
 * O preview desde o início, quando existe. Além de ser o trecho que
 * representa a faixa, tocá-lo do começo não depende de o servidor aceitar
 * pular para o meio de um arquivo — coisa que o host de assets não faz.
 */
export function menuTracks(entries: SongEntry[]): Array<BackgroundAudio & { id: string }> {
  const tracks: Array<BackgroundAudio & { id: string }> = []
  for (const entry of entries) {
    if (entry.synthesized) continue
    const audio = backgroundAudio(entry, { usePreview: true })
    if (audio) tracks.push({ id: entry.song.meta.id, ...audio })
  }
  return tracks
}
```

Run: `npx vitest run src/songs/library.test.ts`
Expected: PASS, 3 testes.

- [ ] **Step 3: `App.tsx` usa `menuTracks`**

Trocar os imports:

```ts
import type { MenuTrack } from './audio/menuPlaylist'
import { backgroundAudio } from './songs/library'
```

por:

```ts
import { menuTracks } from './songs/library'
```

E o efeito da trilha (o comentário acima dele continua, trocando a última frase por `Qual trecho de cada pacote é decisão de \`menuTracks\`.`):

```ts
  useEffect(() => {
    mixer.setMenuTracks(menuTracks(library))
  }, [library])
```

- [ ] **Step 4: Sem "Reler a pasta songs/" na versão hospedada**

Em `SongsScreen.tsx`, o botão de `Reler a pasta songs/` passa a ser:

```tsx
        {/* Na versão hospedada não existe pasta para reler: a biblioteca é
            o índice publicado, e muda por `upload-assets`, não daqui. */}
        {!import.meta.env.VITE_ASSETS_BASE && (
          <button
            className="btn"
            disabled={loadingLibrary}
            onClick={async () => {
              const added = await refreshLocalLibrary()
              setStatus(
                added > 0
                  ? `${added} música${added === 1 ? '' : 's'} nova${added === 1 ? '' : 's'} na pasta songs/.`
                  : 'Nada novo na pasta songs/.',
              )
            }}
          >
            {loadingLibrary ? 'Lendo songs/…' : 'Reler a pasta songs/'}
          </button>
        )}
```

- [ ] **Step 5: Conferir**

Run: `npm test` → PASS, todos.
Run: `npm run build` → sem erro (confirma que `MenuTrack` e `backgroundAudio` não ficaram importados à toa).
Run: `npm run menus` e abrir `scripts/menu-musicas.png` → o botão "Reler a pasta songs/" continua lá (build local, sem a variável).

- [ ] **Step 6: Commit**

```bash
git add src/songs/library.ts src/songs/library.test.ts src/App.tsx src/ui/screens/SongsScreen.tsx
git commit -m "feat: música de menu toca os previews; sem reler pasta no hospedado

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `npm run hosted` — o layout hospedado conferido sem publicar

**Files:**
- Create: `scripts/hosted.mjs`
- Modify: `scripts/library.mjs:33-35` (de onde vem o índice) e depois da espera por `Escolha a música`
- Modify: `package.json` (script `hosted`)

**Interfaces:**
- Consumes: `node tools/upload-assets.mjs --dry-run` (Task 2); o cliente lendo `${VITE_ASSETS_BASE}/library.json` (Task 3); o botão escondido (Task 4).
- Produces: `npm run hosted`, que sai com 0 quando smoke e library passam contra o host local.

- [ ] **Step 1: `scripts/hosted.mjs`**

```js
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
```

- [ ] **Step 2: `scripts/library.mjs` sabe ler o índice do host**

Trocar:

```js
const index = await page.evaluate(() => fetch('/library/index.json').then((r) => r.json()))
console.log(`✓ pasta servida: ${index.root}`)
```

por:

```js
// Na conferência hospedada (`npm run hosted`) o índice vem do host de
// assets, pelo mesmo caminho que o jogo faz.
const assets = process.env.VITE_ASSETS_BASE?.replace(/\/+$/, '')
const indexUrl = assets ? `${assets}/library.json` : '/library/index.json'
const index = await page.evaluate((url) => fetch(url).then((r) => r.json()), indexUrl)
console.log(assets ? `✓ índice do host: ${indexUrl}` : `✓ pasta servida: ${index.root}`)
```

E, logo depois de `await page.getByRole('heading', { name: 'Escolha a música' }).waitFor()`:

```js
if (assets && (await page.getByRole('button', { name: /Reler a pasta/ }).count()) > 0) {
  problems.push('o botão "Reler a pasta songs/" apareceu na versão hospedada')
}
```

- [ ] **Step 3: O script no `package.json`**

Depois de `"library": "node scripts/library.mjs",`:

```json
    "hosted": "node scripts/hosted.mjs",
```

- [ ] **Step 4: Rodar**

Run: `npm run hosted`
Expected, em ordem: a montagem do `--dry-run` (25 `✓`), `✓ host local em http://127.0.0.1:8787, com CORS`, as linhas `✓` do smoke (menu, lista, `✓ áudio pronto`, precisão), `✓ índice do host: http://127.0.0.1:8787/library.json`, as linhas `✓` do library, e saída 0. Nenhum `console:` de erro — um modelo ou arquivo sem CORS apareceria aqui.

Depois: `ps -eo comm | grep -c workerd` → `0` (o host local foi encerrado).

- [ ] **Step 5: Commit**

```bash
git add scripts/hosted.mjs scripts/library.mjs package.json
git commit -m "feat: npm run hosted confere o layout hospedado sem publicar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Documentação

**Files:**
- Modify: `CLAUDE.md` (lista de comandos; seção `## Hospedagem`)
- Modify: `README.md` (nova seção `## Publicar`, no fim)
- Modify: `src/env.d.ts` (comentário de `VITE_ASSETS_BASE`)

- [ ] **Step 1: `CLAUDE.md`, lista de comandos**

Rodar `npm test` e anotar o total. Na lista de comandos, trocar o número em `npm test          # 127 testes…` pelo total atual, trocar a linha do `upload-assets` e acrescentar a do `hosted`:

```bash
npm run upload-assets # publica músicas, modelos e previews no host de assets
npm run hosted        # confere o layout hospedado sem publicar
```

- [ ] **Step 2: `CLAUDE.md`, seção `## Hospedagem`**

Substituir a seção inteira (do título até antes da próxima seção, ou até o fim do arquivo) por:

```markdown
## Hospedagem

Rodando na própria máquina, músicas e modelos saem de pastas locais. Num
deploy estático, nenhuma das duas existe: o plugin que serve `songs/` é
middleware do Vite e não roda, e `public/models/` está fora do
versionamento.

Então são dois sites. O app vai para a Vercel; músicas e modelos vão para
um Worker só de assets na Cloudflare (`fretline-assets`), publicado por
`npm run upload-assets` — que monta `.assets-dist/` com hard links, gera um
`preview.opus` de 30 s para cada música e escreve o `library.json`. O
wrangler só envia o que mudou.

O cliente muda em dois pontos, os dois pequenos: com `VITE_ASSETS_BASE`,
`songs/libraryIndex.ts` pede `${base}/library.json` em vez do índice do
plugin, e `render/assetBase.ts` reescreve os caminhos `/models/...` pelo
gancho de URL do `LoadingManager` do three. Sem a variável, tudo continua
local.

**O host não atende byte range**: um pedido de trecho recebe o arquivo
inteiro. É por isso que a música de menu e o preview tocam o clipe de 30 s
desde o início, em vez de pular para o meio da faixa.

**`VITE_ASSETS_BASE` não vai no `.env`.** Com ela, `npm run dev` e todos os
scripts de navegador leem a biblioteca do host em vez de `songs/`. Ela mora
só nas variáveis do projeto na Vercel (como *Config*: o aviso de segredo não
se aplica a uma URL pública, e sem o prefixo `VITE_` ela não chega ao
navegador). `npm run hosted` a passa por conta própria.

**Acrescentar uma música** é largá-la em `songs/` e rodar
`npm run upload-assets`. Sem commit, sem deploy na Vercel.

**O preview do pack nunca entra por hard link.** O ffmpeg escrevendo por
cima de um link truncaria o original em `songs/`.
```

- [ ] **Step 3: `README.md`, seção `## Publicar` no fim do arquivo**

```markdown
## Publicar

O app vai para a Vercel; músicas e modelos, para um Worker só de assets na
Cloudflare. Os dois planos gratuitos bastam.

Uma vez só:

1. Node 22 ou mais novo, e `sudo apt install ffmpeg`.
2. Conta na Cloudflare e `npx wrangler login`.
3. `npm run upload-assets` — no fim, imprime a URL do host.
4. Na Vercel: importar o repositório (framework Vite) e criar a variável
   `VITE_ASSETS_BASE` com a URL do passo 3, marcada como *Config*.

Depois disso, música nova é largar a pasta em `songs/` e rodar
`npm run upload-assets` de novo. `npm run hosted` confere tudo localmente
antes, sem publicar.
```

- [ ] **Step 4: `src/env.d.ts`**

Trocar o comentário de `VITE_ASSETS_BASE` por:

```ts
  /**
   * Endereço do host de assets da versão hospedada, sem barra no fim —
   * `https://fretline-assets.<subdominio>.workers.dev`.
   *
   * Com ela, a biblioteca vem do `library.json` publicado lá e os modelos
   * saem de `<base>/models/`. Vazia rodando na própria máquina, onde a pasta
   * `songs/` é servida pelo plugin e `public/models/` sai do próprio
   * servidor. Não vai no `.env` — ver a seção *Hospedagem* do `CLAUDE.md`.
   */
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md src/env.d.ts
git commit -m "docs: hospedagem na Cloudflare, publicar e npm run hosted

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Publicar e trocar a versão no ar

A ordem importa: o jogo no ar hoje lê `public/library/remote.json` (que aponta para `songs/` no host). O `library.json` tem de estar publicado **antes** de o cliente novo chegar à Vercel.

- [ ] **Step 1: Publicar os assets**

Run: `npm run upload-assets`
Expected: a montagem (25 `✓`), o wrangler enviando só os arquivos novos ou mudados (os 25 `preview.opus`, `library.json`, `_headers`; o resto já estava lá), e no fim `VITE_ASSETS_BASE=https://fretline-assets.bbraian.workers.dev`.

- [ ] **Step 2: Conferir o host**

```bash
B=https://fretline-assets.bbraian.workers.dev
curl -s $B/library.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const i=JSON.parse(s);console.log(i.base,i.songs.length,i.songs.every(x=>x.files.includes("preview.opus")))})'
                                                  # songs/ 25 true
curl -sI $B/library.json | grep -i access-control # Access-Control-Allow-Origin: *
```

- [ ] **Step 3: A versão no ar continua funcionando**

Todo arquivo que o `remote.json` do `main` lista tem de existir no host novo:

```bash
mkdir -p /tmp/fretline-parte1
git show main:public/library/remote.json > /tmp/fretline-parte1/remote.json
node -e '
const i = require("/tmp/fretline-parte1/remote.json");
(async () => {
  let ruins = 0
  for (const s of i.songs) for (const f of s.files) {
    const u = `${i.base.replace(/\/$/, "")}/${[...s.path.split("/"), f].map(encodeURIComponent).join("/")}`
    const r = await fetch(u); await r.body?.cancel()
    if (r.status !== 200) { ruins++; console.log(r.status, u) }
  }
  console.log(ruins ? `${ruins} faltando` : "remote.json antigo: tudo 200")
})()'
```

Expected: `remote.json antigo: tudo 200`. Se algo faltar, **pare**: publicar o cliente novo antes de entender isso deixaria a versão no ar quebrada enquanto o deploy da Vercel não termina.

- [ ] **Step 4: Registrar no spec**

Em `docs/superpowers/specs/2026-09-22-hospedagem-e-loading-design.md`, seção *Estado em 2026-09-23*: renomear para *Estado*, acrescentar no topo da lista **Feito** um item `Parte 1 (2026-09-24): upload-assets reescrito, previews gerados para as 25 músicas, library.json no host, cliente lendo o índice do host, música de menu pelos previews, npm run hosted.`, tirar do parágrafo **O que o atalho não tem** o que foi feito (previews, `library.json`, música nova exigindo commit), e na **Ordem sugerida** marcar a primeira parte como feita. No passo 4 de *Configuração única, do autor*, trocar "Feito à mão por enquanto; o script ainda não existe." por "Feito."

```bash
git add docs/superpowers/specs/2026-09-22-hospedagem-e-loading-design.md
git commit -m "docs: parte 1 da hospedagem no ar

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Levar para o `main` e publicar — com o sim do autor**

Pergunte antes: este passo publica na Vercel.

```bash
git switch main
git merge --ff-only hospedagem-parte-1
git push origin main
```

- [ ] **Step 6: Conferir em produção (com o autor, no navegador)**

Com o deploy da Vercel pronto, abrir o site com as ferramentas de desenvolvedor na aba Rede:

- `library.json` é pedido a `fretline-assets.bbraian.workers.dev`, e **não** há pedido a `/library/remote.json`;
- a lista de músicas tem as 25, sem o botão "Reler a pasta songs/";
- a música de menu começa em cerca de um segundo, e o pedido é a um `preview.opus`;
- parar numa música da lista toca o preview dela em cerca de um segundo;
- uma partida inteira toca, e Personagens mostra os modelos.
