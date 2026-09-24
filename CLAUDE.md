# Fretline

Clone de Guitar Hero III que roda no navegador. TypeScript + Vite + React +
Three.js, sem servidor e sem backend.

O `README.md` é a documentação do projeto e está completo — este arquivo
guarda só o que um agente precisa saber antes de editar, e as decisões que
o código sozinho não explica.

**Antes de mexer em qualquer interface, leia `docs/design/README.md`.** É o
contrato visual das telas de menu: paleta, tipografia, linguagem de seleção
e as armadilhas que já custaram uma ida e volta. Não improvise estilo novo
sem passar por ele.

## Comandos

```bash
npm run dev       # http://localhost:5173
npm test          # 213 testes do engine, do áudio, do conteúdo e da publicação, em Node
npm run build     # tsc -b && vite build
npm run smoke     # sobe o jogo num navegador de verdade e toca a demo
npm run menus     # captura as telas de menu em scripts/menu-*.png
npm run sfx       # confere que cada efeito sonoro toca no ponto certo
npm run shots     # um retrato de cada plano de câmera
npm run gallery   # cada guitarra e cada personagem
npm run gamepad   # navega o jogo inteiro com um controle simulado
npm run library   # confere que songs/ é lida e tocada
npm run test-song # escreve uma música de teste em songs/
npm run upload-assets # publica músicas, modelos e previews no host de assets
npm run hosted        # confere o layout hospedado sem publicar
npm run attachment    # mede onde a guitarra fica no corpo de cada personagem
```

Não há linter nem formatador configurado. O estilo se aprende lendo os
arquivos vizinhos.

## Arquitetura

Três camadas, com as dependências apontando sempre para dentro:

```
ui/  ──▶  engine/  ◀──  render/
```

- **`src/engine/`** — TypeScript puro. Sem React, sem Three.js, sem DOM.
  Relógio, parsers de chart, julgamento, pontuação, star power, medidor.
  Roda inteiro em Node, e é a única camada com testes.
- **`src/render/`** — Three.js vanilla. Lê o estado do engine a cada quadro
  e desenha. **Nunca escreve no engine.**
- **`src/ui/`** — React + zustand. Telas, seleção, ajustes, painel.

Essa direção é o que permite testar o timing inteiro sem abrir navegador.
Uma importação de `three` dentro de `engine/`, ou uma escrita do `render/`
no estado do engine, quebra a premissa — não faça.

## Invariantes que não se negociam

**O relógio é o áudio.** `AudioContext.currentTime` é a única fonte de
verdade da posição da música. O laço de desenho pergunta a hora ao áudio,
nunca o contrário, e nunca acumulando o delta do próprio laço. O caminho
oposto produz deriva ao longo da música, e é o defeito clássico dos clones
do gênero.

**Dois deslocamentos de calibração, separados.** O de *áudio* desloca o
julgamento; o de *vídeo* desloca só o desenho. Têm causas físicas
diferentes (latência de saída de som contra latência de display) e não
podem virar um só.

**Não há palhetada.** A nota é resolvida na transição solto→pressionado do
traste. Decorre daí: duas notas seguidas no mesmo traste exigem soltar e
apertar; nota aberta é tocada soltando todos os trastes; e existe castigo
por tocar no vazio, agrupado numa folga de 30ms para não punir acordes. A
distinção entre strum, HOPO e tap não existe em jogo — o parser continua
derivando porque é parte do formato, mas nada depois dele olha.

**Duas cenas, duas câmeras.** O palco é desenhado primeiro com a câmera de
um diretor que corta entre planos, o buffer de profundidade é limpo, e a
pista entra por cima com câmera fixa. Uma câmera só para as duas coisas
moveria as notas junto com o ângulo do show, e um jogo de ritmo em que a
pista se mexe é injogável. Os cortes caem na batida.

**A tela de jogo é desmontada de verdade ao sair**, não escondida: ela
segura um `AudioContext` e um renderizador WebGL.

**Três contextos de áudio, com ciclos de vida diferentes.** O da mesa
(`audio/mixer.ts`) vive enquanto a aba estiver aberta e toca menu e
efeitos; o da partida (`audio/songPlayer.ts`) nasce e morre com a tela de
jogo. É por isso que o "you rock" do fim sobrevive à troca para os
resultados, e que um efeito de interface nunca interrompe a música.

A consequência para a **pausa**: ela precisa alcançar os dois. A música
para no tocador; os efeitos de palco da mesa (abertura, plateia do boost)
tocam num `VoiceGroup` (`audio/sfx.ts`) que `mixer.pauseStage()` congela e
`resumeStage()` retoma do ponto. Suspender o contexto da mesa não serve:
qualquer som de interface o acordaria. Efeito novo de palco que deva parar
na pausa entra por esse grupo.

**Nada toca antes do primeiro quadro.** O relógio do `SongPlayer` fica
parado no começo da aproximação até `start()`, e a tela de jogo só dá a
partida depois de `scene.warmUp()` — compilar shaders e subir texturas no
primeiro desenho travava a página por segundos com a música já correndo, e
a contagem acontecia atrás da tela de carregamento.

## Arte procedural

Não existe nenhum arquivo de modelo no projeto. Personagem é um conjunto de
parâmetros em `src/content/characters.ts`, montado em
`src/render/character/characterModel.ts`; guitarra é uma família de
silhueta em `src/render/guitar/shapes.ts` mais cores em
`src/content/guitars.ts`.

**Personagem importado é outra história, e tem receita própria.** Os
integrantes de arquivo `.glb` recebem uma animação de guitarra adaptada ao
esqueleto deles, e acrescentar um tem uma ordem que economiza uma tarde —
está em `docs/specs/personagem-novo.md`. O curto: confira o rig **antes** de
cadastrar, e meça o encaixe da guitarra com `npm run attachment` em vez de
procurá-lo no painel de `?rig`.

A razão de a marionete existir é concreta: os integrantes da banda **não são `SkinnedMesh`** — são
marionetes de `Object3D` rígidos aninhados, animadas por cinemática inversa
de dois ossos (`src/render/character/ik.ts`) que posiciona as mãos sobre o
instrumento. Um modelo importado inteiro viria sem esse rig e seria uma
estátua. E como a guitarra fica presa na mão de alguém, as duas coisas
precisam sair da mesma fábrica.

Consequência prática para quem for importar geometria: **peças rígidas
isoladas entram sem atrito** (cabeça, botas, chapéu, e a guitarra inteira,
que é um adereço rígido), desde que parenteadas ao mesmo nó `Object3D`.
Um corpo de personagem inteiro, não.

**Guitarras importadas já funcionam.** Uma entrada com o campo `model` em
`content/guitars.ts` é carregada de um `.glb` por
`render/guitar/guitarGlb.ts`, que normaliza escala e orientação sozinho —
arquivo de banco público não segue convenção nenhuma. Os detalhes e as
armadilhas estão em `docs/specs/gltf-glb.md`.

Os arquivos ficam em `public/models/`, **fora do versionamento**: são
megabytes de binário e têm licença própria, que às vezes proíbe
redistribuir. `npm run optimize-models <pasta>` prepara os baixados.

**O palco é sorteado por apresentação** (`stageForShow`, em
`render/stage/stageModel.ts`, contado pelo `show` do store): música nova
começada de um menu, cenário novo; recomeçar e tocar de novo mantêm o
mesmo. Captura que compara imagens passa `?stage=club`.

**Modelo novo nas lojas entra por `ModelPreview.present`**, atrás do véu
da tela — ele compila shaders e sobe texturas antes do primeiro desenho.
Um `setModel` direto põe na tela um modelo que ainda vai travar a página.

## Telas e estilo

Todas as telas ficam em `src/ui/screens/`, e todo o estilo em um arquivo
só: `src/ui/theme.css`.

**Cuidado com classes compartilhadas.** Várias telas reaproveitam as mesmas
classes (`.menu-stats` serve carreira, personagens e guitarras). Antes de
redefinir uma regra, `grep` pelo nome da classe em `src/**/*.tsx` — mudar
uma regra para uma tela já quebrou outras três.

Todas as telas de menu seguem o desenho de cartaz do Guitar Hero III, com a
paleta em `:root` e o fundo em `src/ui/Backdrop.tsx`. **O HUD e a pista
(`.hud*`, `.score-panel`, `.lcd`, `.rock-dial`) ficam de fora**: ali a cor
carrega informação de jogo, não estilo, e as cinco cores de traste não se
mexem.

As decisões todas — e o porquê de cada uma — estão em
`docs/design/README.md`.

**O controle fala teclado.** `ui/gamepadNav.ts` traduz direcional, A e B
em setas, Enter e Esc, e anda o foco pelo vizinho quando nenhuma tela trata
a tecla. Tela nova se navega de controle sem código próprio — desde que
responda ao teclado. Não sonde `getGamepads()` numa tela de menu; onde A e B
viram outra coisa (os trastes da música, a captura de botão dos ajustes),
segure a navegação com `holdGamepadNav()`.

## Capturas de tela como verificação

`scripts/menus.mjs` acha os botões por regex **case-sensitive**
(`/Carreira/`, `/Tocar/`). Rótulo em caixa alta vai no CSS com
`text-transform`, nunca no JSX — escrever `CARREIRA` no JSX quebra o script.

Mudança visual se confere olhando: rode `npm run menus` (ou `shots`,
`gallery`) e leia o PNG. Alegar que ficou bom sem ver a imagem não vale.

**Todo script de navegador passa pela abertura.** Depois do `page.goto`,
`passarAbertura(page)` (`scripts/abertura.mjs`) espera o "Pressione" e
aperta Enter. Script novo que abra o jogo precisa da mesma linha, senão
para na primeira tela.

## Documentos

| | |
|---|---|
| `docs/design/README.md` | contrato visual das telas de menu |
| `docs/specs/gltf-glb.md` | importar arte em glTF/GLB: o que já funciona e o que falta |
| `docs/specs/personagem-novo.md` | receita para pôr um personagem novo tocando guitarra |

## Som

Tudo o que soa passa por `audio/mixer.ts`, que é onde mora o volume geral.
Os efeitos são amostras em `public/sfx/` — essas **são** versionadas, ao
contrário dos modelos: são poucos kilobytes e sem elas o jogo fica mudo.
`audio/sfx.ts` é o banco que as carrega; o catálogo de nomes lógicos está
lá.

Duas coisas continuam sintetizadas, e por motivo: o `tweak` dos controles
deslizantes, que dispara dezenas de vezes num arrasto e viraria serra
elétrica como amostra, e o ruído de corda abafada do erro de nota, que fica
em `songPlayer.ts` porque acompanha o abafamento da guitarra.

A música de fundo dos menus são trechos de 30 segundos das próprias músicas
da biblioteca (`audio/menuPlaylist.ts`), transmitidos por um `<audio>` em
vez de decodificados — decodificar quatro minutos para ouvir trinta custa
dezenas de megabytes. Sem biblioteca, cai num laço de osciladores.

**Controles bloqueados não usam `disabled`.** Um botão desabilitado não
emite clique, e sem clique não há como dizer "não dá" — ver `ui/blocked.ts`.
Eles usam `aria-disabled`, e as regras de estilo têm o seletor equivalente
ao lado do `:disabled`.

**O áudio nasce na saída da abertura, e nunca antes.** A música de menu não
tenta tocar na abertura — sem gesto, o `play()` de cada faixa seria
recusado. Sair por tecla ou clique já libera o som; **sair pelo controle,
não**: botão de gamepad não conta como gesto para o navegador. Por isso um
`play()` recusado (`NotAllowedError`) não é tratado como faixa ruim: a
trilha para, e a mesa religa a música na primeira tecla ou clique de
verdade (`religarNoGesto`, em `audio/mixer.ts`).

## Músicas

**O catálogo é a pasta, não uma lista em código.** O jogo lê `songs/` no
formato do Clone Hero (`notes.mid` ou `notes.chart`, `song.ini`, faixas de
áudio) e monta tudo a partir dali — inclusive a carreira, cujos tiers são
preenchidos por `buildCareer` em ordem de dificuldade. Não existe nenhum
lugar onde as músicas estejam cadastradas; trocar o conteúdo da pasta troca
o jogo inteiro.

A pasta **não é versionada**: são centenas de megabytes de áudio com licença
de terceiros. Em desenvolvimento ela é servida por `tools/songs-plugin.mjs`,
um plugin de Vite.

A dificuldade que ordena a carreira sai de `diff_guitar` no `song.ini`, e só
cai numa estimativa por densidade de notas quando o pack não declara. Se uma
música aparecer no tier errado, **o conserto é preencher `diff_guitar`**, não
mexer em `setlists.ts`.

Vem também uma faixa sintetizada em código — o mesmo arquivo gera o chart e
o som, então não saem de sincronia. Ela é rede de segurança, não catálogo:
some das listas quando há biblioteca de verdade, e `?debug` a traz de volta
porque é ela que o teste de fumaça toca.

**O seletor das listas** está em `ui/useListSelection.ts`, e serve a lista de
músicas e a carreira. Teclado, controle e mouse escrevem no **mesmo** índice —
não são três navegações concorrentes — e o foco do navegador anda com ele, o
que é por que `.song-row` não tem anel de foco próprio: o realce da linha *é*
o indicador de foco.

Nas duas telas o destaque é a escolha, e o clique numa linha inicia a
música; escolher sem iniciar é passar o mouse, as setas ou o direcional. O
clique passa o índice da linha em vez de ler a música escolhida: num toque
de tela não há hover antes dele, e a loja ainda aponta para a anterior. A
lista de músicas mantém o botão "Tocar em" para quem chegou pelo teclado.

**Preview na seleção.** `resting`, do seletor, é o índice onde ele ficou
parado dois segundos; `ui/useSongPreview.ts` reage a isso. O trecho é um
`preview.opus` **gerado**, a soma de todas as faixas, do `preview_start_time`
do `song.ini` ou de 35% da música: no site quem gera é `upload-assets`, e na
própria máquina é o plugin de `songs/`, sob demanda e com cache em
`node_modules/.cache` — os dois por `tools/preview-mix.mjs`. Quem toca é a
mesa, **no mesmo elemento** da música de fundo — é isso que torna dois
previews ao mesmo tempo impossíveis, em vez de depender de disciplina.

**O clipe `preview.*` do pack não é usado**, a não ser na importação pelo
seletor de pastas, onde não há ffmpeg. Nos packs da Neversoft a guitarra
entra nele uns 10 dB abaixo do resto, e o preview soava sem guitarra. Pelo
mesmo motivo o `song.opus` sozinho não serve: num pack com faixas separadas,
ele é a banda sem a guitarra.

O preview **não obedece** ao interruptor de música de menu: ele é resposta a
um gesto, não trilha. `PlayScreen` chama `mixer.silenceMenu()` ao montar, que
é a garantia de que nada de menu nem de preview atravessa a partida.

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

**O preview gerado soma todas as faixas**, menos a plateia e o clipe do
pack. Nos packs com instrumentos separados, o `song.opus` guarda só as
sobras — nos da Harmonix, às vezes silêncio —, então ele sozinho não serve
de preview.

**`VITE_ASSETS_BASE` não vai no `.env`.** Com ela, `npm run dev` e todos os
scripts de navegador leem a biblioteca do host em vez de `songs/`. Ela mora
só nas variáveis do projeto na Vercel (como *Config*: o aviso de segredo não
se aplica a uma URL pública, e sem o prefixo `VITE_` ela não chega ao
navegador). `npm run hosted` a passa por conta própria.

**Acrescentar uma música** é largá-la em `songs/` e rodar
`npm run upload-assets`. Sem commit, sem deploy na Vercel.

**O preview do pack nunca entra por hard link.** O ffmpeg escrevendo por
cima de um link truncaria o original em `songs/`.
