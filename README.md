# Fretline

Jogo de ritmo de guitarra no espírito do Guitar Hero III: braço em
perspectiva, cinco trastes, banda 3D tocando ao fundo, quatro dificuldades,
troca de personagem e de guitarra, e uma carreira com desbloqueios.

Roda no navegador. TypeScript + Vite + React + Three.js, sem servidor.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # testes do engine, em Node, sem navegador
npm run build
```

## Como está organizado

Três camadas, com as dependências apontando sempre para dentro:

```
ui/  ──▶  engine/  ◀──  render/
```

- **`src/engine/`** — TypeScript puro: sem React, sem Three.js, sem DOM.
  Relógio, parser de chart, julgamento de acerto, pontuação, star power,
  medidor. É onde mora a regra do jogo, e roda inteiro em Node.
- **`src/render/`** — Three.js vanilla. Lê o estado do engine a cada quadro e
  desenha. Nunca escreve no engine.
- **`src/ui/`** — React e zustand. Menus, seleção, ajustes e o painel.

`engine/` não sabe que `render/` existe. É isso que permite testar o timing
inteiro — a parte que decide se o jogo é bom ou não — sem abrir navegador.

## O relógio

`AudioContext.currentTime` é a única fonte de verdade da posição da música.
O laço de desenho pergunta a hora ao áudio; nunca o contrário, e nunca
acumulando o delta do próprio laço. Se um quadro atrasar, as notas dão um
salto visual mas o julgamento continua correto. O caminho oposto — áudio
seguindo o render — produz deriva que se acumula ao longo da música, e é o
defeito clássico dos clones do gênero.

Há dois deslocamentos de calibração, separados porque têm causas diferentes:
o de **áudio** desloca o julgamento (latência da saída de som), o de **vídeo**
desloca só o desenho (latência do display). A tela de calibração mede os dois.

## Músicas

O jogo não distribui áudio nenhum. Ele vem com uma faixa de demonstração
sintetizada em código — o mesmo arquivo gera o chart e o som, então não há
como saírem de sincronia — e importa a sua própria biblioteca no formato do
Clone Hero. Os arquivos ficam no seu computador; nada é enviado a lugar
nenhum.

### Onde colocar

Largue as pastas em **`songs/`**, na raiz do projeto. O jogo lê essa pasta
sozinho ao abrir, e como os arquivos são servidos por endereços normais, a
biblioteca continua lá depois de recarregar a página. Pastas dentro de
pastas funcionam até quatro níveis, então um pack inteiro pode ser jogado
ali de uma vez.

    songs/
      Barracuda/
        notes.mid          (ou notes.chart)
        song.ini
        guitar.ogg
        song.ogg
      Bulls on Parade/
        ...

Cada pasta precisa de:

- **`notes.mid`** (o formato da maioria dos packs) ou **`notes.chart`**;
- **`song.ini`** com nome, artista, ano e o `delay` do áudio;
- as faixas de áudio: `song.ogg` com a banda misturada, ou faixas separadas
  (`guitar.ogg`, `rhythm.ogg`, `bass.ogg`, `drums.ogg`, `vocals.ogg`).

Para conferir que o caminho está de pé antes de largar um pack de verdade,
`npm run test-song` escreve uma música de teste em `songs/`.

O botão **Importar pasta de músicas**, na tela de seleção, continua existindo
para pastas fora do projeto. A diferença é que o que entra por ali vale só
para aquela aba: o navegador não deixa um endereço de arquivo escolhido pelo
usuário sobreviver a um recarregamento.

Quando existe uma faixa de guitarra separada, **errar corta a guitarra** e o
resto da banda continua tocando, como no original. Com uma faixa só, o
volume geral abaixa, que é o possível.

Estão implementados: acordes, sustains, notas abertas (por SysEx do Phase
Shift no `.mid`), trechos de star power, mudanças de andamento e de fórmula
de compasso, e as quatro dificuldades separadas por oitava.

### Carreira

A tela de carreira traz os tiers do Guitar Hero III na ordem original. Cada
faixa é um *lugar*: assim que a música correspondente entra na sua
biblioteca, o lugar fica jogável. O casamento é pelo título normalizado — o
nome da pasta não importa, e variações de acentuação, `&` contra `and` e
sufixos entre parênteses são tratadas.

A lista de faixas vive em `src/content/setlists.ts`, uma linha por música.
Ela não precisa estar completa para a carreira funcionar: um tier com menos
faixas simplesmente é mais curto.

## Loja

Todos os itens aparecem, comprados ou não. Clicar num item apenas o coloca no
visor — **olhar não troca o que está equipado**. Comprar e equipar são dois
botões distintos, e comprar não equipa sozinho: são duas decisões, e juntá-las
tira do jogador a possibilidade de comprar algo para usar depois.

Itens ainda bloqueados por estrelas continuam visíveis e giráveis no visor,
com o número de estrelas que falta. Poder ver o que ainda não é seu é metade
da graça de uma loja.

## Arte

Personagens, guitarras, bateria e palco são construídos em código a partir
de parâmetros — não há nenhum arquivo de modelo no projeto. Acrescentar um
personagem ao elenco é acrescentar uma entrada em
`src/content/characters.ts`; acrescentar uma guitarra, uma entrada em
`src/content/guitars.ts` mais uma silhueta em `render/guitar/shapes.ts`.

A razão de não usar modelos importados é concreta: os integrantes da banda
são animados por um esqueleto escrito à mão, com cinemática inversa
posicionando as mãos sobre o instrumento. Um modelo baixado ou gerado viria
sem esqueleto — seria uma estátua. E como a guitarra fica presa na mão de
alguém, as duas coisas precisam sair da mesma fábrica.

As silhuetas de corpo de guitarra são splines fechadas passando por
pontos-guia, e não curvas de Bézier com pontos de controle: o que se edita é
a borda em si, então mover um ponto muda a linha ali e só ali. Dez famílias,
de corte simples a asa varrida, com acabamento chapado, sunburst ou tampo
flamejado — os dois últimos desenhados em canvas, porque um sunburst não é
uma cor, é um degradê.

Os personagens seguem marcos anatômicos (virilha, umbigo, peito, ombro,
queixo, joelho) e têm as mãos posicionadas por cinemática inversa sobre o
instrumento. Cabelo, roupa e acessórios são peças combináveis: cartola,
cachos, cabelo caindo sobre o rosto, gargantilha, tachas no cinto, meia-luva
comprida.

## O braço e o painel

O braço segue o desenho do original: papel de parede ornamentado rolando com
a música, divisórias claras entre os cinco trastes, trilhos fortes nas bordas,
linhas de compasso atravessando a pista — mais largas no início de cada
compasso — e os cinco botões com anel metálico e aro colorido. As notas têm o
mesmo aro, porque no original a nota *é* o botão.

O painel também: pontuação num visor de sete segmentos verde à esquerda, com
multiplicador e contador de notas seguidas, e o medidor de rock à direita como
um mostrador de meia-lua com ponteiro, do vermelho ao verde. O mostrador é
SVG, não WebGL — traço fino e texto pequeno são de graça em vetor, e em 3D
exigiriam atlas de fonte.

## Câmeras

O braço da guitarra fica parado; o que se mexe é o fundo. São **duas cenas
com duas câmeras**: o palco é desenhado primeiro, com a câmera de um diretor
que corta entre planos — geral, contra-plongée no guitarrista, bateria,
plateia vista de trás da banda, travelling lateral —, o buffer de
profundidade é limpo, e a pista é desenhada por cima com uma câmera fixa.

Uma câmera só para as duas coisas seria impossível: mover o ângulo do show
moveria as notas junto, e um jogo de ritmo em que a pista se mexe é
injogável.

Os cortes caem **na batida**, nunca no meio dela — fora do tempo lê como
falha técnica; no tempo, lê como direção. E os planos miram *ao lado* do
integrante, porque o braço da guitarra ocupa o meio da tela: centralizar o
sujeito o colocaria justamente atrás das notas.

`?shot=<id>` na URL trava um plano, para conferir um ângulo sem esperar o
sorteio; `npm run shots` fotografa todos.

## Qualidade gráfica

Nos ajustes, **alta** usa um compositor com brilho difuso, sombras
projetadas, feixes de luz visíveis, fumaça e iluminação por mapa de
ambiente. **Baixa** tira tudo isso e desenha as duas cenas direto na tela.
A jogabilidade e o julgamento das notas não mudam em nada.

A medição que levou a essa divisão: apagando partes da cena e comparando
quadros por segundo, o custo dominante era a iluminação por imagem dos
materiais, não o número de luzes nem o de chamadas de desenho — que era o
palpite óbvio, e estava errado. Cronometrar `renderer.render()` não teria
mostrado isso, porque a chamada só enfileira comandos e volta.

## Controles

**Não há palhetada.** A nota é tocada apertando o traste, e só isso. Foi uma
decisão de projeto: o jogo é jogado no teclado e no controle, e nenhum dos
dois tem um gesto decente para palhetar — palhetar no teclado é uma tecla
extra que atrapalha, e no controle é um direcional que briga com os trastes.

Três consequências que o jogo trata explicitamente:

- **duas notas seguidas no mesmo traste** exigem soltar e apertar de novo,
  porque só a transição de solto para pressionado resolve nota;
- **nota aberta** é tocada soltando todos os trastes — é o único gesto que
  sobrou para expressar "nenhum traste pressionado";
- **castigo por tocar no vazio** substitui o castigo por palhetar no vazio.
  Sem ele, martelar os cinco trastes acertaria a música inteira. Toques são
  agrupados numa folga de 30ms antes de virar castigo, senão montar um
  acorde — que nunca sai com os dedos exatamente juntos — seria punido.

Como todas as notas são tocadas do mesmo jeito, a distinção entre strum,
HOPO e tap não existe em jogo. O parser continua derivando porque é parte do
formato, mas nada depois dele olha. O anel em volta de uma nota marca star
power, não tipo de nota.

Padrão do teclado: `A S J K L` nos trastes, espaço para o star power, shift
esquerdo na alavanca. Tudo remapeável nos ajustes. Controle comum (Xbox/PS)
também funciona, pela API de gamepad: trastes nos quatro botões de ação mais
o bumper direito.

## Testes

```bash
npm test          # 68 testes do engine: parsers, julgamento, score, medidor
npm run smoke     # abre o jogo num navegador de verdade e toca a demo
npm run capture   # capturas do jogo em andamento
npm run shots     # um retrato de cada plano de câmera
npm run gallery   # cada guitarra e cada personagem na tela de seleção
npm run menus     # as telas de menu
npm run library   # confere que a pasta songs/ é lida e tocada
npm run test-song # escreve uma música de teste em songs/
```

O teste de fumaça sobe o próprio servidor, injeta um piloto automático na
página que lê o chart e dispara eventos de teclado nos tempos certos — o
mesmo caminho que um teclado de verdade percorre. É o que cobre o que os
testes do engine não podem cobrir: WebGL subindo, áudio decodificando, e as
três camadas conversando. Ele também falha se qualquer erro aparecer no
console, que foi como um shader quebrado apareceu durante o desenvolvimento.

Ele roda numa janela pequena de propósito: o navegador headless rasteriza
por software, e numa resolução alta o laço de desenho trava a thread
principal a ponto de atrasar o próprio piloto automático — o teste passaria
a medir o rasterizador em vez do jogo. Pelo mesmo motivo o limiar de
precisão é 85% e não 98%: a medida oscila entre execuções por causa do
ambiente. `npm run capture` é o oposto, roda grande e não verifica nada.

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
