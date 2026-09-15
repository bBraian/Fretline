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

O jogo não distribui áudio. Já vem com uma faixa de demonstração
sintetizada em código — o mesmo arquivo gera o chart e o som, então não há
como saírem de sincronia — e importa a sua própria biblioteca no formato do
Clone Hero: uma pasta por música, com o `.chart` e as faixas de áudio dentro.
Os arquivos ficam no seu computador; nada é enviado a lugar nenhum.

Estão implementados: acordes, sustains, notas abertas, trechos de star
power, e mudanças de andamento e de fórmula de compasso. O parser também
deriva HOPO e tap porque fazem parte do formato, mas o jogo não os usa —
ver abaixo.

## Arte

Personagens, guitarras, bateria e palco são construídos em código a partir
de parâmetros — não há nenhum arquivo de modelo no projeto. Acrescentar um
personagem ao elenco é acrescentar uma entrada em
`src/content/characters.ts`. Trocar isso por modelos glTF depois não mexe no
resto: `render/character.ts` e `render/guitarModel.ts` são os únicos que
precisariam mudar.

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

Padrão do teclado: `A S D F G` nos trastes, espaço para o star power, shift
esquerdo na alavanca. Tudo remapeável nos ajustes. Controle comum (Xbox/PS)
também funciona, pela API de gamepad: trastes nos quatro botões de ação mais
o bumper direito.

## Testes

```bash
npm test          # 45 testes do engine: parser, julgamento, score, medidor
npm run smoke     # abre o jogo num navegador de verdade e toca a demo
npm run capture   # capturas de tela para conferência visual
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
