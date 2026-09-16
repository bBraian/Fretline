# Extrator de charts do Guitar Hero III

Converte os charts de uma instalação do GH3 para o formato que o Fretline
lê. Não toca no áudio.

```bash
node tools/gh3/extract-charts.mjs "<caminho>/Guitar Hero III/DATA/SONGS" songs
```

O segundo argumento é a pasta de saída — aponte direto para `songs/` e as
músicas já entram na biblioteca do jogo. Cada uma sai como:

    songs/Barracuda/
      notes.chart
      song.ini
      FALTA-O-AUDIO.txt

O áudio precisa ser colocado à mão, como `song.ogg`. Com faixas separadas,
o arquivo chamado `guitar.ogg` faz a guitarra ser cortada quando você erra.

## O formato, como foi descoberto

Nada aqui veio de documentação: o formato foi lido dos próprios arquivos.

**PAK.** Cabeçalho de entradas de 32 bytes em big-endian, cada uma
`[extensão, deslocamento, tamanho, pai, nome, caminho, flags, 0]`,
terminado por uma entrada de extensão `2cb3ef3b`. As de extensão
`a7f505c4` são os pedaços `.qb`; a maior carrega as notas.

**Nomes.** Não sobrevivem no build de varejo — viraram somas de
verificação. Testar as grafias plausíveis contra a chave conhecida de um
arquivo mostrou que a função **não é o CRC-32 comum**, então identificar as
seções por nome exigiria descobrir a função.

**Por isso a identificação é pelo conteúdo**, que é inequívoco e vale para
as 158 músicas sem exceção:

| tipo | significado | conteúdo |
|---|---|---|
| `00010100` | vetor de inteiros | trincas `(tempo_ms, duração_ms, máscara)` = chart; inteiros crescentes sozinhos = grade de batidas |
| `00010c00` | vetor de vetores | cada elemento aponta para `(tempo, duração, nº de notas)` = trecho de star power |
| `00010a00` | vetor de estruturas | marcações de seção da música |

A ordem no arquivo também informa: os quatro primeiros charts são a
guitarra, em ordem crescente de dificuldade; os quatro seguintes são a base.

**Conferência.** Em Barracuda saem 401/646/838/858 notas nas quatro
dificuldades e 605 batidas em 265,2s — 136,9 BPM, que é o andamento real
da música. Um erro de layout não produziria um andamento certo por acaso.

## O áudio

Os bancos `DATA/MUSIC/*.fsb.xen` estão cifrados e este extrator não mexe
neles. Use uma ferramenta da comunidade de mods do Guitar Hero para
decifrar e extrair, e largue o resultado nas pastas geradas.

## Diagnóstico

`probe-pak.mjs` e `probe-elements.mjs` imprimem a estrutura de um arquivo
sem converter nada, para quando alguma música não sair como esperado:

```bash
node tools/gh3/probe-pak.mjs "<caminho>/DATA/SONGS/barracuda_song.pak.xen"
node tools/gh3/probe-elements.mjs "<caminho>/DATA/SONGS/barracuda_song.pak.xen" 4096 312596
```
