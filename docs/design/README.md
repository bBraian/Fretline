# Decisões de design — Fretline

**Mande este arquivo no prompt sempre que pedir alguma coisa de interface.**
Ele é o contrato visual das telas de menu: o que já foi decidido, por quê, e
o que não se mexe sem conversa.

A referência é a tela principal do **Guitar Hero III: Legends of Rock** —
cartaz de tatuagem velha, letra de pôster, tinta sobre papel.

Vale para **as telas de menu**. O HUD e a pista de jogo (`.hud*`,
`.score-panel`, `.lcd`, `.rock-dial`) seguem outras regras e **não** foram
repintados: ali a cor carrega informação de jogo, não estilo.

---

## 1. A regra que decide empate

> Cartaz impresso, não interface de aplicativo.

Na dúvida entre duas opções, vence a que um pôster de show faria: borda
grossa em vez de fina, canto reto em vez de arredondado, letra de caixa alta
espremida em vez de fonte de texto, tinta chapada em vez de degradê suave.

## 2. Paleta

Tokens em `:root`, em `src/ui/theme.css`.

| Token | Valor | Onde vive |
|---|---|---|
| `--bg` | `#140c05` | fundo de tudo |
| `--bg-raised` | `#241608` | superfícies acima do fundo |
| `--bg-card` | `rgba(32, 20, 9, 0.94)` | linhas de lista e cartões |
| `--gh-bone` | `#f2e4c4` | osso: bordas, seleção, botão principal |
| `--gh-ochre` | `#cd9f5b` | ocre: item de menu em repouso, títulos |
| `--gh-ochre-dim` | `#9a7338` | ocre apagado: rodapé, texto secundário |
| `--gh-red` | `#a81f16` | tinta vermelha: **só** o que está selecionado |
| `--gh-ink` | `#17100a` | contorno de letra e texto sobre osso |
| `--accent` | `#c2601f` | laranja dos raios: sliders, realces |

**As cinco cores de traste (`--green`, `--red`, `--yellow`, `--blue`,
`--orange`) não são do tema.** São a linguagem da pista e do HUD, e mudá-las
muda o que o jogador lê enquanto toca. Não encoste nelas.

O vermelho `--gh-red` é reservado. Se aparecer em algo que não está
selecionado, a linguagem de seleção deixa de funcionar.

## 3. Tipografia

```css
--gh-display: 'Impact', 'Haettenschweiler', 'Franklin Gothic Heavy',
  'Arial Narrow Bold', 'Liberation Sans Narrow', 'DejaVu Sans Condensed',
  'Oswald', system-ui, sans-serif;
```

A lista desce por Windows, macOS e Linux até um peso 900 qualquer. **Para a
letra de cartaz continua não havendo arquivo de fonte**, e isso segue sendo
escolha.

A exceção é a letra de mão da folha de setlist, que ganhou arquivo próprio
(ver abaixo) porque sem ela a folha não se parecia com nada.

Usam a display: títulos de tela, itens de menu, nomes de música, nomes de
personagem e guitarra, rótulos de ajuste, botões, cabeçalhos de lista.
**Não** usam: parágrafos, subtítulos, dicas, números — texto para ler fica na
fonte de sistema, porque Impact em corpo pequeno é ilegível.

Receita de letra de cartaz:

```css
font-family: var(--gh-display);
font-weight: 900;
text-transform: uppercase;
letter-spacing: 0.04em;   /* 0.1em+ em rótulos pequenos */
transform: skewX(-3deg);  /* só em título de tela e item de menu */
```

**Caixa alta vai no CSS, nunca no JSX.** `scripts/menus.mjs` acha os botões
por regex case-sensitive (`/Carreira/`); escrever `CARREIRA` no JSX quebra a
captura de telas.

### Contorno

`-webkit-text-stroke` com `paint-order: stroke fill` **não funciona em HTML**
— o traço fica centrado e come o miolo da letra. O contorno é um anel de oito
sombras:

```css
text-shadow:
  -2px -2px 0 var(--gh-ink), 0 -2px 0 var(--gh-ink), 2px -2px 0 var(--gh-ink),
  2px 0 0 var(--gh-ink), 2px 2px 0 var(--gh-ink), 0 2px 0 var(--gh-ink),
  -2px 2px 0 var(--gh-ink), -2px 0 0 var(--gh-ink),
  0 5px 0 rgba(0, 0, 0, 0.55), 0 8px 14px rgba(0, 0, 0, 0.9);
```

### Letra de mão

```css
--gh-hand: 'Patrick Hand', 'Segoe Print', 'Bradley Hand', 'Chalkboard SE',
  'Comic Sans MS', cursive;
```

**Patrick Hand**, SIL Open Font License, em `public/fonts/` — subconjuntos
latin e latin-ext, 44 kB no total. É o único arquivo de fonte do projeto, e
entrou depois que a decisão de não ter nenhum foi revista: a folha de setlist
depende da letra de mão para ler como caderno, e as pilhas de sistema caem
em fallback sem graça no Linux.

Servida de `public/`, **não** do Google Fonts: uma folha de estilo de
terceiros faria a lista de músicas depender de rede para desenhar, e o jogo
roda offline. A licença está em `public/fonts/LEIA-ME.txt` e acompanha os
arquivos por exigência da OFL.

Usa a letra de mão: **só o nome da música na folha de setlist.** Nada mais.

## 4. Seleção: uma linguagem só

O que está selecionado é **osso com letra escura**. Vale no menu principal,
na lista de músicas, na lista de personagens e guitarras, no controle
segmentado e no botão principal. Não invente um quinto jeito.

```css
background: linear-gradient(90deg, #fdf4dd, var(--gh-bone) 70%, #d9c396);
color: var(--gh-ink);   /* ou var(--gh-red) em texto de cartaz */
```

- **Repouso:** ocre sobre fundo escuro, borda esquerda transparente.
- **Sob o ponteiro:** fundo marrom mais claro, borda esquerda ocre.
- **Selecionado:** fundo de osso, letra escura, borda de osso.

No menu principal, o selecionado ganha um **respingo de tinta** — o mesmo
gradiente com `clip-path` de polígono irregular, para não ler como retângulo
de interface — e losangos `◆` nos dois lados.

## 5. Formas

- `--radius: 3px`, `--radius-sm: 2px`. Cartaz não tem canto arredondado.
- Bordas de **2px**, não 1px. Linhas finas são de aplicativo.
- Linha de lista tem **borda esquerda de 5px** como marcador.
- Sombra é dura e deslocada (`0 3px 0`), não difusa.

## 6. O fundo

`src/ui/Backdrop.tsx`: colagem de 30 painéis em SVG com seis padrões
procedurais — raios, chamas, estrelas, hachura, relâmpagos, alvos —, moldura
ornamentada, vinheta e grão por `feTurbulence`.

**Nenhum bitmap, e a lista de painéis é fixa, não sorteada.** Um fundo que
muda a cada montagem faria `npm run menus` acusar diferença em toda execução,
e a conferência visual deixaria de servir.

Duas variantes:

| | `poster` | `content` |
|---|---|---|
| onde | menu principal | todas as outras telas |
| véu | `0.42` | `0.88` |
| moldura | sim | **não** — numa tela que rola, ela corta a lista no meio |
| grão | `0.14` | `0.06` |

A colagem é **geométrica, não figurativa**. Tem a paleta, o ritmo e a moldura
do GH3, mas não a arte de tatuagem desenhada do original. Fechar essa
distância é trocar os seis `<pattern>` por painéis desenhados — o resto da
tela não muda.

Todo filho de `.screen` que não seja o backdrop sobe com `z-index: 1`.

## 6b. A folha de setlist

Carreira e biblioteca não são cartaz: são uma **folha de caderno pautado
sobre uma mesa de madeira**, como no original. Ganham a classe
`screen-paper` no `.screen`, e **não levam `Backdrop`** — a madeira é um
gradiente em CSS.

O que define a folha:

- **Unidade `--pauta: 30px`.** Tudo mede múltiplos dela — altura de linha de
  música (2 pautas), cabeçalho de tier (2 pautas), `padding-top` do corpo (1
  pauta). Sem isso o texto flutua no meio das linhas em vez de assentar
  sobre elas, e o efeito de caderno morre.
- **Pauta e margem em gradiente**, com `background-attachment: local` para
  rolarem junto com o texto.
- **Tokens invertidos dentro de `.screen-paper .screen-body`**: `--text`,
  `--text-dim`, `--line` viram tons escuros de tinta. Os componentes leem
  `var()`, então a folha inteira clareia sem reescrever cada regra.
- **Seleção é o papel clareando**, com barra vermelha à esquerda e um
  marcador `►` na margem. Aqui **não** vale o fundo de osso do resto do
  jogo: pintar de osso apagaria a pauta.
- Cabeçalho e rodapé continuam escuros sobre a madeira — é onde ficam os
  controles, e controle não é conteúdo da folha.

Uma linha de música é o componente `src/ui/screens/SongRow.tsx`, usado pelas
duas telas. Antes cada uma montava a sua, com colunas em ordens diferentes.

## 6c. Prévia 3D

`src/render/preview.ts`.

**O prato não gira sozinho.** Girar sem parar é vitrine de loja e impede
olhar uma peça do ângulo que se quer. Arrastar com o ponteiro continua
girando.

Ao trocar de item, o modelo entra com uma animação curta (`ENTRY_SECONDS`,
0,55s, `easeOutCubic`):

| `entry` | onde | o que faz |
|---|---|---|
| `dolly` | guitarras | vem de longe e para perto, como um instrumento que se aproxima |
| `step` | personagens | adianta um passo curto |
| `none` | `?still` | aparece no lugar, para a galeria comparar silhuetas |

Duas coisas que custaram medição:

1. **O recuo mede contra a distância da câmera, não contra a caixa do
   objeto.** A profundidade de uma guitarra é a espessura do corpo, e um
   recuo proporcional a isso não aparece na tela.
2. **A animação anda por tempo de relógio, não por passo fixo de 1/60.**
   Contando quadros, ela durava o triplo numa máquina desenhando a 20 fps.

Com `?debug`, a prévia fica em `window.__preview` — é como a duração foi
medida, porque uma captura de tela leva mais tempo que a animação inteira.

## 7. Navegação

O menu principal é **dirigido por seleção**, não por ponteiro:

- `↑`/`↓` e `W`/`S` andam, com volta no fim da lista;
- o item selecionado recebe **o foco de verdade** do navegador, e por isso
  `Enter` e espaço **não** são tratados no componente — o botão focado já os
  trata, e duplicar dispararia a tela duas vezes;
- o ponteiro seleciona ao passar por cima, **sem** roubar o foco;
- o rodapé mostra as cápsulas de aviso, como no original.

Os itens têm **tamanhos irregulares** de propósito (`lg`/`md`/`sm`). O
original não alinha a lista num corpo só, e o ritmo desigual é metade do que
faz a tela ler como cartaz em vez de formulário.

## 8. Armadilhas já pagas

Estão aqui porque cada uma custou uma ida e volta.

1. **Classes compartilhadas.** `.menu-stats` serve carreira, personagens e
   guitarras. Redefini-la para o menu grudou os números nos rótulos das três.
   Antes de mexer numa regra, `grep` pelo nome da classe em `src/**/*.tsx`.
2. **`clamp()` responde à largura, não à altura.** Numa janela baixa e larga
   — a do teste de fumaça, 480×270 — a lista crescia e empurrava o logo para
   fora da tela. Os breakpoints pequenos medem em `vh`.
3. **Nome acessível.** Quebrar o wordmark em dois `<span>` desestabilizou o
   nome do heading e o teste de fumaça parou de achá-lo. Título partido em
   pedaços leva `aria-label` explícito.
4. **Moldura em tela que rola.** O SVG é fixo e o conteúdo não: em
   `content` a moldura sai.
5. **Captura de tela não serve para medir animação.** Um `screenshot()` do
   Playwright leva ~500ms; amostrar 550ms de animação com ele dá dois
   quadros. Animação se mede lendo o estado pelo gancho de depuração.

## 9. Como conferir

Mudança visual se confere **olhando**, nunca por dedução:

```bash
npm run menus     # menu, carreira, músicas, ajustes
npm run gallery   # cada guitarra e cada personagem
npm run smoke     # o jogo inteiro num navegador de verdade
```

O smoke test roda a **480×270** de propósito e falha se qualquer erro
aparecer no console.

## Ver também

- `CLAUDE.md` — arquitetura e invariantes do projeto
- `docs/specs/gltf-glb.md` — plano para importar modelos 3D
