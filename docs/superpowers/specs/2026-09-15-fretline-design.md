# Fretline — Design

Data: 2026-09-15
Status: aprovado (abordagem A)

## Objetivo

Um jogo de ritmo de guitarra no espírito do Guitar Hero III: braço da
guitarra em perspectiva ocupando o centro da tela, notas descendo em cinco
trastes, banda 3D tocando ao fundo, quatro dificuldades, troca de
personagem e de guitarra, progressão por carreira.

Roda no navegador. Stack: TypeScript + Vite + React 19 + zustand + Three.js.

## Decisões fechadas

| Questão | Decisão |
|---|---|
| Plataforma | Web (Three.js), empacotável depois via Capacitor/Tauri |
| Músicas | Importa `.chart` / `.mid` no formato Clone Hero; o jogador traz a própria pasta de songs |
| Escopo | Clone completo, implementado em fases com jogabilidade desde a fase 1 |
| Input | Teclado + gamepad comum (Xbox/PS) |
| Palhetada | Não existe: a nota é tocada no traste (ver *Revisão*) |
| Arquitetura | Núcleo vanilla + React só na casca |
| Arte 3D | Procedural em código, sem assets externos |

## Arquitetura

Três camadas, com dependências apontando só para dentro:

    ui/  ──▶  engine/  ◀──  render/

- **`engine/`** — TypeScript puro. Sem React, sem Three.js, sem DOM.
  Relógio, parsing de chart, julgamento de acerto, score, star power, rock
  meter. Roda e é testado em Node.
- **`render/`** — Three.js vanilla. Lê o estado do engine a cada frame e
  desenha. Nunca escreve no engine.
- **`ui/`** — React + zustand. Menus, seleção, configuração, HUD.
  Fala com o engine por comandos (iniciar música, pausar), nunca por frame.

`engine/` não sabe que `render/` existe. Isso é o que permite testar o
timing sem navegador.

### O relógio

`AudioContext.currentTime` é a única fonte de verdade da posição da música.

    songTime = audioCtx.currentTime - startedAt - userOffset

O loop de render lê `songTime`; nunca acumula delta próprio. Se um frame
atrasar, as notas dão um salto visual mas o julgamento permanece correto.
O caminho oposto — áudio seguindo o render — causa deriva acumulada, que é
o defeito clássico de clones de jogo de ritmo.

Dois offsets, separados porque têm causas diferentes:
- **offset de áudio** — latência da saída de som; desloca o julgamento.
- **offset de vídeo** — latência do display; desloca só o desenho.

Ambos ajustáveis numa tela de calibração.

### Fluxo de um frame

1. `render` pergunta ao `clock` o `songTime`.
2. `session.update(songTime)` no engine: expira notas passadas
   (miss), decai star power, atualiza rock meter.
3. Eventos de input chegam de forma assíncrona, com timestamp próprio,
   e vão para `session.onInput(event)` — não são amostrados por frame,
   porque um frame de 16ms é largo demais para a janela de acerto.
4. `render` desenha a partir do estado.
5. O HUD React lê o estado em throttle (~15fps).

### Modelo de dados

    Song      { id, meta, audioTracks[], charts: Record<Difficulty, Chart> }
    Chart     { resolution, notes: Note[], starPowerPhrases[], beats[] }
    Note      { time, duration, frets: bitmask, type: strum|hopo|tap, isOpen }
    Judgement { notaIndex, delta, veredito: perfect|good|miss }

Tempo sempre em **segundos** dentro do engine. Ticks e BPM existem só no
parser; nada depois dele conhece tick.

## Componentes

### Parser de chart
Dois formatos de entrada, uma saída normalizada.
- `.chart` — texto, seções `[Song]`, `[SyncTrack]`, `[ExpertSingle]`…
- `.mid` — formato Clone Hero / Rock Band, notas por faixa `PART GUITAR`.

Ambos produzem o mesmo `Chart`. Conversão de tick para segundos percorre o
`SyncTrack` acumulando mudanças de BPM.

Regras derivadas no parser, não no gameplay: HOPO (nota próxima da
anterior, traste diferente), sustains, acordes, notas abertas, forced flags.
Depois da revisão abaixo, HOPO e tap continuam sendo derivados por fidelidade
ao formato, mas nada no gameplay os consulta.

### Julgamento
Máquina de estados por nota, com janela de acerto de ±70ms (ajustável).
- **Toque** — a transição de solto para pressionado resolve a nota, se a mão
  satisfaz os trastes dela. Soltar não resolve nota comum.
- **Nota simples** — vale segurar trastes abaixo do alvo, desde que o mais
  alto pressionado seja o da nota. Um traste acima invalida.
- **Acorde** — correspondência exata, sem sobras.
- **Nota aberta** — tocada soltando todos os trastes.
- **Sustain** — mantém pontos enquanto o traste ficar pressionado.
- **Toque no vazio** — um toque que não resolve nota quebra a corrente e
  machuca o medidor, depois de uma folga de 30ms para montar acordes.

### Score
Base 50 por nota, multiplicador 1→2→3→4 a cada 10 acertos seguidos,
dobrado durante star power. Sustain rende pontos contínuos proporcionais à
duração.

### Rock meter
Sobe no acerto, desce no erro, com taxa por dificuldade. Chega a zero:
falha a música. Star power ativo suspende a queda.

### Braço e notas (render)
- Braço: plano com shader próprio — trastes, linhas de batida, textura
  rolando em função do `songTime`.
- Notas: um `InstancedMesh` por cor, com `DynamicDrawUsage`. Só as notas
  dentro da janela visível recebem matriz; o resto fica com escala zero.
  `frustumCulled = false` e nada de `computeBoundingSphere()` por frame.
- Sustains: geometria própria, esticada no eixo do braço.
- Efeitos: chamas no acerto e estrelas no star power. O anel em volta de
  uma nota marca star power, não tipo de nota.

### Banda 3D
Personagens procedurais: torso, membros e cabeça montados a partir de
primitivas, com um esqueleto simples e animação escrita à mão
(idle, tocando, solo, star power, falhando). Sem dependência de assets
externos — trocar de personagem é trocar proporções, cores e silhueta.
Guitarras idem: corpo, braço e headstock paramétricos.

Palco: luzes coloridas reagindo ao beat do chart, plateia como sprites
instanciados, fumaça e refletores.

Justificativa: importar modelos glTF é melhor artisticamente, mas cria
dependência de assets licenciados que não existem ainda. A interface de
`band/` aceita um provedor de modelo, então trocar procedural por glTF
depois não mexe no resto.

### Progressão
- 4 dificuldades: Easy, Medium, Hard, Expert.
- Carreira: setlists desbloqueadas por estrelas acumuladas.
- Moeda por performance, gasta em personagens e guitarras.
- Persistência em `localStorage`.

### Input
Camada de abstração acima de teclado e gamepad, emitindo dois tipos de
evento com timestamp: `fretChange(mask)` é o único que resolve notas, mais
`starPower()` e `whammy(value)`. Whammy e tilt ficam como eixos opcionais,
presentes na interface mas sem fonte no teclado.

## Testes

O engine é testado com Vitest em Node, sem navegador:
- parser: chart conhecido entra, notas com tempos esperados saem;
  mudanças de BPM; sustains; acordes; HOPO derivado (fidelidade ao formato).
- julgamento: sequência sintética de inputs com timestamps contra um chart
  sintético; verifica veredito nota a nota.
- score: multiplicador, star power, sustain.
- rock meter: falha e recuperação.

`render/` e `ui/` não têm testes automatizados nesta versão; são
verificados rodando o jogo.

## Fases

1. **Core jogável** — clock, parser `.chart`, braço, notas, input teclado,
   julgamento, score, HUD mínimo. Testes do engine.
2. **Sensação** — star power, rock meter, sustains, efeitos de acerto,
   calibração, gamepad, parser `.mid`.
3. **Cena** — banda 3D, palco, luzes no beat, câmeras.
4. **Meta** — menus completos, seleção de música, personagens, guitarras,
   carreira, loja, persistência.

Cada fase termina com o jogo rodando.


## Revisão: sem palhetada (2026-09-15)

Depois de jogar a primeira versão, a palhetada saiu.

**Motivo.** O jogo é jogado no teclado e no controle, e nenhum dos dois tem
um gesto decente para palhetar: no teclado é uma tecla a mais competindo com
os cinco trastes pela mesma mão, e no controle é um direcional que briga com
os botões. A palhetada existe no original porque existe um controle em
formato de guitarra com uma alavanca de verdade; sem esse controle, ela vira
atrito sem função.

**O que muda.** Toda nota é resolvida na transição de solto para pressionado
de um traste. Três consequências que a máquina de estados precisou tratar:

1. **Notas repetidas no mesmo traste** exigem soltar e apertar de novo. Sem
   isso, segurar o traste acertaria uma sequência inteira.
2. **Notas abertas** perdem o gesto que as tocava. Passam a ser tocadas
   soltando todos os trastes — o único jeito que sobrou de expressar
   "nenhum traste pressionado". Apertar um traste com uma nota aberta à
   frente não é castigado, porque o jogador está a caminho de soltar tudo.
3. **O castigo por palhetar no vazio** vira castigo por *tocar* no vazio,
   senão martelar os cinco trastes acertaria a música inteira. Como um
   acorde nunca sai com os dedos exatamente juntos, um toque que não resolve
   nada espera 30ms antes de virar castigo; se outro dedo chegar nesse
   intervalo e fechar o acorde, não há castigo. O instante guardado é o do
   primeiro dedo, para que montar o acorde não conte como atraso.

**O que some.** A distinção entre strum, HOPO e tap deixa de existir em
jogo — as três tocam igual. O parser continua derivando o tipo por fidelidade
ao formato `.chart`, mas nada depois dele consulta. O anel que marcava HOPO e
tap no braço foi realocado para marcar nota de star power, que é uma
distinção que ainda existe.
