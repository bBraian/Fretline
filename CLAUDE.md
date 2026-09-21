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
npm test          # 98 testes do engine, em Node, sem navegador
npm run build     # tsc -b && vite build
npm run smoke     # sobe o jogo num navegador de verdade e toca a demo
npm run menus     # captura as telas de menu em scripts/menu-*.png
npm run shots     # um retrato de cada plano de câmera
npm run gallery   # cada guitarra e cada personagem
npm run library   # confere que songs/ é lida e tocada
npm run test-song # escreve uma música de teste em songs/
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

## Arte procedural

Não existe nenhum arquivo de modelo no projeto. Personagem é um conjunto de
parâmetros em `src/content/characters.ts`, montado em
`src/render/character/characterModel.ts`; guitarra é uma família de
silhueta em `src/render/guitar/shapes.ts` mais cores em
`src/content/guitars.ts`.

A razão é concreta: os integrantes da banda **não são `SkinnedMesh`** — são
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

## Capturas de tela como verificação

`scripts/menus.mjs` acha os botões por regex **case-sensitive**
(`/Carreira/`, `/Tocar/`). Rótulo em caixa alta vai no CSS com
`text-transform`, nunca no JSX — escrever `CARREIRA` no JSX quebra o script.

Mudança visual se confere olhando: rode `npm run menus` (ou `shots`,
`gallery`) e leia o PNG. Alegar que ficou bom sem ver a imagem não vale.

## Documentos

| | |
|---|---|
| `docs/design/README.md` | contrato visual das telas de menu |
| `docs/specs/gltf-glb.md` | importar arte em glTF/GLB: o que já funciona e o que falta |

## Músicas

O jogo não distribui áudio. Vem com uma faixa sintetizada em código — o
mesmo arquivo gera o chart e o som, então não saem de sincronia — e lê a
pasta `songs/` da raiz no formato do Clone Hero (`notes.mid` ou
`notes.chart`, `song.ini`, faixas `.ogg`). A pasta é servida por
`tools/songs-plugin.mjs`, um plugin de Vite.
