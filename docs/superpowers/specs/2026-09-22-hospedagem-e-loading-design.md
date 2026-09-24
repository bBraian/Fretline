# Hospedagem e telas de carregamento — Design

Data: 2026-09-22
Status: aprovado; **no ar pelo atalho desde 2026-09-23**, código do plano
ainda não implementado (ver *Estado em 2026-09-23*)

## Estado em 2026-09-23

O jogo foi publicado antes da implementação, aproveitando o que o código
atual já fazia: ele lê `/library/remote.json` com um `base` absoluto, e
reescreve `/models/...` pela `VITE_ASSETS_BASE`.

**Feito:**

- Conta na Cloudflare, `wrangler login` e subdomínio `bbraian`. O Worker
  `fretline-assets` está em `https://fretline-assets.bbraian.workers.dev`.
- `tools/assets-worker/wrangler.jsonc` como descrito abaixo, e `.gitignore`
  com `.assets-dist/` e `.wrangler/`.
- `.assets-dist/` montado **à mão**: as 25 músicas (chart, `song.ini` e
  áudio; sem as capas) e os 34 modelos por hard link, mais o `_headers`. Os
  14 `preview.*` que vieram nos packs entraram por **cópia**. Publicado, e
  os 214 arquivos da primeira leva foram conferidos contra os locais, um
  por um.
- `public/library/remote.json` gerado à mão a partir de `.assets-dist/songs`,
  com `base` absoluto, e versionado.
- `ffmpeg` e `ffprobe` instalados.
- Vercel: repositório importado (Vite), `VITE_ASSETS_BASE` definida como
  *Config*, não segredo. O nome precisa do prefixo `VITE_` — o aviso de
  segredo que a Vercel mostra não se aplica a uma URL pública.

**O que o atalho não tem** é o que falta implementar: a abertura, o
progresso e o cancelamento do Afinando, os previews gerados para todas as
músicas, o `library.json` publicado junto com os assets e os créditos. E
música nova, por enquanto, exige refazer o `remote.json` e fazer commit.

**Ordem sugerida**, uma parte por sessão: publicação com previews (script +
`library.json` + cliente lendo o índice do host) → Afinando → abertura →
créditos.

**Pendente de decisão — créditos.** Proposto e não confirmado: o script
avisa sobre GLB sem entrada em vez de recusar, e os campos ficam só autor,
link e licença. `src/content/credits.json` existe como esqueleto vazio, com
as 34 entradas.

## Objetivo

Publicar o Fretline como portfólio: o app na Vercel, músicas e modelos num
host gratuito à parte, e telas de carregamento que tornem a espera honesta —
uma abertura antes do menu que baixa o que o jogo mostra, e a tela
"Afinando" com progresso de verdade quando uma música é escolhida.

Só ferramentas gratuitas.

## Decisões fechadas

| Questão | Decisão |
|---|---|
| Público | Portfólio: link público, tráfego moderado |
| Catálogo | As 25 músicas de `songs/`, inteiras |
| App | Vercel (Hobby), build estático do Vite |
| Músicas e modelos | Cloudflare, Worker só de assets (`fretline-assets`) — sem cartão, banda sem medição |
| Descartados | Vercel Blob (10 GB/mês, e bloqueio de 30 dias ao estourar); R2 (exige cartão) |
| Abertura | Tela de carregamento antes do menu, terminando em "Pressione qualquer tecla" |
| Baixado na abertura | índice da biblioteca, efeitos, palco ativo, banda, props, animações e **todos** os personagens e guitarras |
| Baixado em segundo plano | os previews das 25 músicas, depois de o menu abrir |
| Baixado sob demanda | o áudio da música, ao tocar (tela "Afinando") |
| Nunca baixado | cenários que o jogo não usa (só entram com `?stage=`) |

## Números que sustentam as decisões

- **O que hospedar:** 372 MB em 257 arquivos. `songs/` tem 284 MB (25
  músicas, 8–31 MB cada, ~6 faixas `.opus` por música); `public/models/` tem
  88 MB. O maior arquivo tem 21,4 MB.
- **Cloudflare, assets estáticos, plano gratuito:** pedidos a assets são
  gratuitos e ilimitados; limite de 20.000 arquivos e 25 MiB por arquivo.
  Tudo cabe.
- **Abertura, ~35 MB:** palco `club` 7,8 · banda 6,5 · props 2,2 ·
  animações 0,6 · personagens 9,9 · guitarras 5,3 · efeitos 1,7 · índice
  < 1. São ~3 s a 100 Mbps, ~10 s a 30 Mbps e ~28 s a 10 Mbps. Na volta, ~1 s
  (tudo responde `304`).
- **Previews:** 25 × ~250 KB ≈ 6 MB, fora da abertura.
- **Cenários que ficam de fora:** 55 MB (runway 21,4, liveaid 18,2, palco_3
  13,4, starry 2,3).

## Arquitetura

Dois sites, cada um com um papel:

    Vercel                          Cloudflare — Worker só de assets "fretline-assets"
    └─ o app (vite build)           ├─ _headers         CORS
       VITE_ASSETS_BASE=https://    ├─ library.json     índice da biblioteca
         fretline-assets.bbraian    ├─ songs/<pasta>/…  notes.mid, song.ini, *.opus, preview.opus
         .workers.dev               └─ models/…         os GLBs

`VITE_ASSETS_BASE` aponta o build para o host de assets. Sem ela, tudo
continua como hoje: `songs/` servida pelo plugin de desenvolvimento e os
modelos saindo de `public/models/`. O reescritor de URL de
`render/assetBase.ts` continua como está.

### Cabeçalhos e cache

`_headers` na raiz do que é publicado:

    /*
      Access-Control-Allow-Origin: *

O cache fica no padrão da Cloudflare (`public, max-age=0, must-revalidate`
mais `ETag`), sem sobrescrever. Voltar a tocar custa um `304` sem corpo por
arquivo, e uma música substituída nunca chega velha ao jogador. Com banda
sem medição, não há motivo para cachear mais agressivo.

### Sem byte ranges

Testado: os assets estáticos da Cloudflare respondem `200` com o arquivo
inteiro a um pedido com `Range`. O design não depende disso: a partida baixa
cada faixa inteira de qualquer jeito, e a música de menu e os previews
passam a tocar clipes de 30 s desde o início, sem pular para o meio.

### Testado no host publicado

`https://fretline-assets.bbraian.workers.dev`, com as músicas e os modelos
já no ar (sem `library.json` nem previews):

- CORS `*` em tudo, inclusive no `404`.
- `Content-Length` presente nos `.glb`, `.opus` e `.mid`, sem compressão —
  a barra por bytes funciona.
- A forma canônica da URL é exatamente a de `encodeURIComponent` por
  segmento (`'` e `()` crus, `,` como `%2C`), que é o que `library.ts` já
  faz. Qualquer outra codificação recebe `307` para a canônica — funciona,
  mas custa uma ida e volta.

### `library.json`

Mesma forma do `/library/index.json` do plugin, mais um `base` **relativo**:

```json
{
  "base": "songs/",
  "songs": [{ "id": "…", "path": "…", "files": ["notes.mid", "song.ini", "song.opus", "preview.opus"] }]
}
```

O cliente resolve `base` contra a URL do próprio índice
(`new URL(index.base, urlDoIndice)`). Sem `base`, o prefixo continua sendo
`/library/file`. Assim o cliente não conhece o layout do storage, e mudar
de host é mudar só `VITE_ASSETS_BASE`.

## Publicação: `npm run upload-assets`

`tools/upload-assets.mjs` é reescrito; o nome do comando fica, e as funções
de varredura (`varrerMusicas`, `listar`, `interessa`) são reaproveitadas.

1. **Confere** os pré-requisitos: `ffmpeg` e `ffprobe` no PATH, e
   `src/content/credits.json` cobrindo todo GLB de `public/models/` (ver
   *Licenças*). Faltando algo, para com a instrução exata.
2. **Varre** `songs/` e `public/models/`.
3. **Monta** `.assets-dist/` com *hard links*, não cópias — 372 MB não se
   duplicam em disco. Cai para cópia se o link falhar (outro volume).
   Modelos marcados `redistribui: false` ficam de fora, com aviso.
4. **Gera `preview.opus`** para toda música, em 30 s a 96 kbps, com fade de
   0,5 s na entrada e 1 s na saída:
   - com preview no pack: reencoda o do pack, cortado nos primeiros 30 s;
   - sem preview: corta a faixa de fundo (a que `roleOf` chama `backing`,
     senão a primeira) a partir de `preview_start_time`; sem ele, a partir de
     35% da duração (`song_length` do `.ini`, senão `ffprobe`).
   Reencodar os que vieram no pack é o que torna o custo previsível
   (~250 KB cada).
   **O `preview.*` do pack nunca entra por hard link**: o ffmpeg escrevendo
   por cima dele truncaria o original em `songs/`. Lê-se de `songs/`,
   escreve-se num arquivo novo em `.assets-dist/`.
5. **Escreve** `.assets-dist/library.json` e `.assets-dist/_headers`.
6. **Publica** com `npx wrangler deploy --config tools/assets-worker/wrangler.jsonc`.
   O wrangler só envia arquivos cujo hash mudou, e cada versão substitui a
   anterior de uma vez. Ao fim, imprime a URL para `VITE_ASSETS_BASE`.

`--dry-run` faz de 1 a 5 e não publica — é o que o teste local usa.

`tools/assets-worker/wrangler.jsonc`, versionado:

```jsonc
{
  "name": "fretline-assets",
  "compatibility_date": "2026-09-22",
  "assets": { "directory": "../../.assets-dist" }
}
```

**Sai:** `@vercel/blob`, o `put()` por arquivo, `public/library/remote.json`
e as flags `--songs`/`--models` (publicar a pasta inteira já pula o que não
mudou).

**Cuidado na troca:** o `remote.json` é o que a versão no ar lê hoje. Ele
só pode sair no mesmo commit em que o cliente passa a ler
`${VITE_ASSETS_BASE}/library.json`, e depois de o `library.json` estar
publicado — na ordem inversa, a versão no ar fica sem músicas.

## Cliente

### Índice da biblioteca — `songs/library.ts`

- `fetchLibraryIndex`: com `VITE_ASSETS_BASE`, pede só
  `${base}/library.json`; sem ela, só `/library/index.json` (plugin). O
  caminho `/library/remote.json` sai.
- `base` resolvido contra a URL do índice, como descrito acima.
- `loadLocalLibrary` lê as pastas em paralelo, seis por vez, **mantendo a
  ordem** do índice, e aceita um callback de progresso (pastas lidas / total).
  Em série, com o storage remoto, eram 50 pedidos um atrás do outro.

### A abertura — `ui/screens/BootScreen.tsx` (nova)

- `Screen` ganha `'boot'`, e ela vira a tela inicial do store. O
  `refreshLocalLibrary()` e o `mixer.warm()` que `App.tsx` dispara ao montar
  passam a ser disparados pela abertura — uma vez só.
- **Visual:** `Backdrop` na variante `poster`, o mesmo wordmark do menu
  (título partido leva `aria-label` — armadilha 3 do contrato de design), e
  a barra `.loading-bar`. **`.loading-bar` é compartilhada** com
  `PlayScreen` e `CharactersScreen`: nada de redefini-la; variação, se
  precisar, vai em classe modificadora. Rótulos no JSX em caixa normal,
  caixa alta por `text-transform`.
- **Fases:**
  1. `conectando` — todos os pedidos saem juntos (o host fala HTTP/2); a
     barra fica indeterminada até cada resposta informar o
     `Content-Length`. Dura uma fração de segundo.
  2. `baixando` — barra por bytes e contador `21,6 / 35,2 MB`, cobrindo
     modelos e efeitos. Como o total só é fixado quando todos os tamanhos
     chegaram, a barra nunca anda para trás. O índice da biblioteca, que
     são dezenas de arquivos pequenos, tem linha própria abaixo da barra
     (`Biblioteca 12/25`), contada por pasta; os dois precisam terminar
     para chegar ao `pronto`.
  3. `pronto` — "Pressione qualquer tecla". Tecla, clique ou botão de
     controle levam ao menu. **Esse gesto é o que cria o `AudioContext`**
     (hoje criado no primeiro gesto, de todo jogo): os efeitos decodificam
     em milissegundos e o menu abre já com música e som, em vez de mudo até
     o primeiro clique.
- **Nunca é beco sem saída.** Cada arquivo tenta de novo duas vezes (0,5 s
  e 2 s de espera). Falhando de vez, a abertura segue sem ele, e o `pronto`
  mostra "N arquivos não vieram — carregam quando precisar". Esse arquivo é
  pedido de novo sob demanda, como hoje. Se o índice da biblioteca falhar,
  entra-se com a faixa de demonstração — a rede de segurança que
  `catalogue()` já é.
- **Baixar não é decodificar.** A abertura enche o cache HTTP do navegador
  e descarta os bytes; nada fica decodificado em memória nem na placa de
  vídeo. Abrir um personagem na loja interpreta 1–3 MB já locais, em menos
  de 0,2 s.

### O que a abertura baixa — `render/essentials.ts` (novo)

`essentialModelUrls(): string[]` junta, sem duplicatas, as URLs que os
módulos já declaram — nenhuma lista paralela para dessincronizar:

- `activeStageModel()?.url` (`stage/stageModel.ts`);
- as três de `BAND` (`character/bandMember.ts`);
- as de props (`props.ts`);
- as de animação (`character/animationClips.ts`);
- `model` de todo personagem (`content/characters.ts`) e de toda guitarra
  (`content/guitars.ts`) que tiver um.

Os mapas que hoje não são exportados passam a ser. Os modelos são baixados
por um `FileLoader` do three com o `DefaultLoadingManager`, em modo
`arraybuffer`: herda a reescrita de URL de `assetBase.ts` e a deduplicação
de pedidos em voo, e o `onProgress` dá os bytes.

Os efeitos vêm do `bank.prefetch()` de `audio/sfx.ts`, que passa a devolver
uma promessa e a reportar progresso.

A soma do progresso é uma função pura em `ui/downloadProgress.ts`: recebe
`{ loaded, total | null }` por item e devolve a fase e a fração.

### Em segundo plano, depois do menu

Um efeito em `App.tsx` (ou `ui/useBackgroundPreviews.ts`) pede o
`entry.preview` de cada música, **um por vez**, com `priority: 'low'`,
depois que a tela sai de `'boot'`.

- Pausa enquanto `screen === 'play'`, para não disputar banda com o
  download da música.
- Não roda com `navigator.connection?.saveData`.
- Um preview pedido antes de baixado continua funcionando: o `<audio>`
  transmite, e um clipe de 250 KB começa em fração de segundo.

### Música de fundo do menu

`App.tsx` passa a montar a playlist com
`backgroundAudio(entry, { usePreview: true })`: toca o clipe desde o
início, sem precisar de byte range. Sem preview (packs locais sem o
arquivo), cai no comportamento atual — faixa inteira a partir de
`preview_start_time`.

### Afinando — `ui/PlayScreen.tsx` e `audio/songPlayer.ts`

- `SongPlayer.load(tracks, { onProgress, signal })` lê cada faixa por
  `response.body.getReader()`, somando bytes contra o `Content-Length`. Sem
  o cabeçalho, conta por arquivo.
- O painel mostra nome e artista, a barra em MB (áudio mais os itens do
  palco) e a linha de fase: `Baixando a música 12,4 / 31,0 MB` →
  `Decodificando o áudio…` → `Montando o palco…`. A lista de itens do palco
  que já existe continua; com a abertura, eles chegam do cache.
- **Esc/Voltar durante o carregamento cancela:** aborta os downloads
  (`AbortController`) e volta. Com 31 MB numa conexão lenta, isso importa.
- A fase `error` ganha **"Tentar de novo"** ao lado de "Voltar" (remonta a
  tela de jogo), e distingue falha de rede de falha de decodificação na
  mensagem.

### Lista de músicas

O botão "Reler a pasta songs/" some quando há `VITE_ASSETS_BASE`: na versão
hospedada não existe pasta para reler.

## Licenças dos modelos

Os GLBs vieram do Sketchfab, cada um com a própria licença. Publicar é
redistribuir, e CC-BY sem crédito descumpre a licença.

- `src/content/credits.json`: por caminho de GLB, `título`, `autor`,
  `fonte` (URL), `licença` e `redistribui` (booleano). JSON para o script
  Node ler sem TypeScript; `content/credits.ts` o importa tipado.
- O script de publicação **recusa** publicar enquanto houver GLB sem
  entrada, e deixa de fora os `redistribui: false`, avisando quais
  personagens ou guitarras apontam para eles.
- A tela de ajustes ganha um bloco "Créditos" com a lista.
- Preencher as 34 entradas é trabalho manual do autor, na página de origem
  de cada modelo.

As músicas não entram nesse controle: são rips de jogos, sem licença que
autorize redistribuir, e a publicação foi decidida sabendo disso (ver
*Riscos*).

## Scripts de navegador

- `passarAbertura(page)`, num módulo compartilhado de `scripts/`: espera o
  texto `/Pressione/` e aperta Enter. Entra nos scripts que fazem
  `page.goto`: `smoke`, `menus`, `sfx`, `shots`, `gallery`, `library`,
  `shop`, `capture` e `check-song`.
- `menus.mjs` ganha a captura da abertura pronta (`menu-abertura.png`) e,
  com a rede estrangulada pelo CDP (`Network.emulateNetworkConditions`),
  uma da abertura no meio da barra e uma do Afinando no meio do download.
- **Conferência do layout hospedado sem publicar:** um script novo
  (`npm run hosted`) roda `upload-assets --dry-run`, serve `.assets-dist/`
  com `npx wrangler dev` (que aplica o `_headers` de verdade), faz o build
  com `VITE_ASSETS_BASE` apontando para ele e roda `smoke` e `library`
  contra o resultado.

## Testes (vitest, em Node)

- `library`: `base` relativo resolvido contra a URL do índice; sem `base`,
  `/library/file`; leitura em paralelo mantém a ordem e o progresso conta
  certo.
- `downloadProgress`: fase `conectando` enquanto falta algum total; depois
  disso, fração que nunca diminui.
- `essentials`: contém o palco ativo, a banda, as props, as animações e
  todo personagem e guitarra com modelo; não contém cenário não usado; não
  repete URL.
- `upload-assets`: as partes puras — escolha do início do preview
  (`preview_start_time`, 35%, preview do pack) e montagem do manifesto —
  exportadas e testadas.

## Documentação

- `CLAUDE.md`: reescrever a seção *Hospedagem* e a linha do
  `upload-assets` na lista de comandos; acrescentar `hosted`.
- `README.md`: o passo a passo de publicação.
- `docs/design/README.md`: seção da abertura.
- `src/env.d.ts`: o comentário de `VITE_ASSETS_BASE`.
- `.gitignore`: `.assets-dist/` e `.wrangler/`.

## Configuração única, do autor

1. ~~Conta gratuita na Cloudflare e `npx wrangler login`.~~ Feito.
2. ~~`sudo apt install ffmpeg`.~~ Feito.
3. Preencher `src/content/credits.json`. Pendente (ver *Estado*).
4. `npm run upload-assets` — imprime a URL do host de assets. Feito à mão
   por enquanto; o script ainda não existe.
5. ~~Na Vercel: importar o repositório (framework Vite), definir
   `VITE_ASSETS_BASE` com a URL do passo 4, publicar.~~ Feito.

Depois disso, **acrescentar uma música** é largá-la em `songs/` e rodar
`npm run upload-assets`. Sem commit, sem novo deploy na Vercel.

## Fora de escopo

- Cache persistente explícito (Cache Storage), modo offline, selo de
  "baixada" na lista.
- Trancar músicas no modo Músicas (hoje só a carreira tranca tiers).
- Domínio próprio.
- Recomprimir GLBs ou mexer nos cenários não usados.
- Retomar downloads interrompidos.

## Riscos

- **Aviso de remoção por direitos autorais.** As músicas são rips da
  Harmonix e da Neversoft. Um aviso atingiria a conta da Cloudflare; o app
  na Vercel continuaria no ar com a faixa de demonstração. Aceito pelo
  autor.
- **Termos da Cloudflare para mídia.** Desde 2023, arquivos grandes são
  permitidos quando hospedados na própria plataforma de desenvolvedor, que
  é o caso. Os arquivos têm no máximo 21,4 MB.
- **Despejo do cache HTTP.** No pior caso, o navegador baixa de novo — a
  banda é gratuita, só a abertura da volta fica mais lenta.
- **Abertura em conexão lenta.** ~28 s a 10 Mbps. O contador em MB deixa a
  espera legível; o público-alvo é desktop com teclado ou controle.
- **Vercel Hobby é para uso não comercial.** Portfólio se enquadra.
