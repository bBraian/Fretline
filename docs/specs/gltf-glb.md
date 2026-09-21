# Migrar arte para glTF/GLB

Plano para trocar geometria construída em código por modelos importados,
sem perder o que a construção em código dá de graça.

**Estado em 21/09/2026: a Fase 1 está implementada e funcionando** com oito
guitarras importadas do Sketchfab. As fases 2 e 3 continuam por fazer.

## O que torna isso diferente de "só carregar um GLB"

Os integrantes da banda **não são `SkinnedMesh`**. São marionetes de
`THREE.Object3D` rígidos aninhados (`hips` → `torso` → `neck` → `head`, e
os braços), animadas por cinemática inversa de dois ossos em
`src/render/character/ik.ts`, que posiciona as mãos sobre o instrumento.

Daí a regra que organiza este plano inteiro:

> Peça rígida importada entra sem briga. Corpo articulado importado, não —
> ele viria sem o rig que anima tudo.

## Fase 1 — Guitarras — FEITA

`src/render/guitar/guitarGlb.ts` devolve o mesmo `GuitarModel` que
`buildGuitar()` monta em código, então cena e prévia não sabem de onde veio
o instrumento. Uma guitarra com o campo `model` em `content/guitars.ts` é
carregada do arquivo; sem o campo, é construída como sempre. As duas formas
convivem e nenhuma guitarra existente precisou mudar.

### O que a prática desmentiu no plano original

O plano dizia que o arquivo deveria respeitar a convenção do `shapes.ts`.
**Isso não funciona.** Os oito primeiros arquivos importados vinham assim:

| eixo do braço no arquivo | quantos |
|---|---|
| X | 3 |
| Y | 2 |
| Z | 3 |

E o comprimento ia de **2 a 1055 unidades** — quinhentas vezes de variação.
Quem exportou o modelo não conhecia a convenção, e não há como pedir que
conheça. O carregador mede o que recebeu e conserta.

### A normalização, em quatro passos

1. **Eixo do braço para Y.** Uma guitarra é comprida numa direção e estreita
   nas outras duas, então o eixo mais longo é o do braço.
2. **Escala**, para o comprimento virar 2,5 unidades.
3. **Qual ponta é o corpo**, comparando o ponto mais largo de cada metade —
   nenhuma parte de uma guitarra é mais larga que o corpo. O corpo vai para
   baixo, porque +Y é a direção do braço.
4. **Tampo de frente**: alinhado o braço em Y, sobram largura e espessura, e
   a espessura é sempre a menor. Vai para Z, como no `shapes.ts`.

Por fim o corpo — não o centro da caixa — vai para a origem, porque é dele
que saem as distâncias que posicionam as mãos.

**A heurística do passo 3 acerta cerca de dois terços dos arquivos.**
Reconhecer a orientação de um objeto arbitrário é um problema difícil, e não
vale persegui-lo: `modelAdjust` corrige o resto com uma linha por modelo
(`flip` quando sai de ponta-cabeça, `roll` quando sai de costas).

### Três erros que só a medição pegou

1. **Rotacionar em eixos locais.** `rotateX` e companhia giram em torno dos
   eixos do objeto, que os passos anteriores já mexeram — então cada etapa
   dependia da ordem das outras, e um ajuste no começo desalinhava tudo
   depois. A correção foi `rotateOnWorldAxis`. Com ela, um modelo que exigia
   ajuste manual passou a ser resolvido sozinho.
2. **Escala aplicada duas vezes.** `multiplyScalar` já multiplica pela escala
   corrente; o cálculo também multiplicava por `root.scale.x`. Passou
   despercebido porque quase todo arquivo vem com escala 1 na raiz.
3. **Emissivo aceso por padrão.** O carregador põe cor emissiva branca para
   o star power, mas não zerava a intensidade — e o material nasce com ela
   em 1. Toda guitarra aparecia branca lisa até alguém chamar `setGlow`, o
   que na prévia nunca acontece.

### Convenção de nomes dentro do arquivo

Opcional, e nenhum modelo de banco público traz:

- malha com prefixo `glow_` entra na lista do `setGlow`; sem nenhuma, o
  brilho vai em todos os materiais;
- nó chamado `whammy_pivot` é o que o `setWhammy` gira; sem ele, a alavanca
  simplesmente não mexe, o que é melhor que girar outra coisa no lugar.

### Carregamento assíncrono

A cena monta tudo de forma síncrona, e o arquivo chega depois. Nos dois
lugares onde isso aparece:

- **na prévia da loja**, um sinalizador de cancelamento descarta um
  carregamento antigo que chegue depois de o jogador já ter trocado de item;
- **no palco**, a guitarra construída em código entra na hora como
  lugar-guardado e é trocada quando o arquivo chega. Esperar o arquivo
  atrasaria o início da música, e um guitarrista de mão vazia é pior que uma
  guitarra provisória.

### Peso

Arquivo de banco público vem pesado pelo motivo errado. Nos oito primeiros,
**53% do peso era textura**, e um deles trazia 31 mapas de 1024×1024 para
uma guitarra só — perto de 124 MB de memória de vídeo. A geometria, que é
onde se costuma olhar, não era problema em nenhum: 94 mil vértices no pior
caso, e o jogo já desenha uma banda inteira todo quadro.

`npm run optimize-models <pasta>` corta textura para 512 em WebP e comprime
a geometria com `quantize`. Nos oito: **26,4 MB → 5,3 MB**.

Fica no `quantize` e não no Draco de propósito: o Draco levaria a um quinto
disso, mas exige um decodificador WebAssembly no cliente, e o bundle já
passa de 900 kB.

### O que ficou por fazer nesta fase

`GUITAR_NECK_REACH` e os offsets em `characterModel.ts` continuam
constantes. A normalização põe todo modelo na mesma escala, o que faz as
constantes valerem para todos — mas uma guitarra de proporções muito fora do
comum ainda deslocaria a mão. Transformá-las em campos do modelo
(`neckEnd`, `bridge`) continua valendo.

## Fase 2 — Peças rígidas de personagem

Cabeça, chapéu, óculos, botas, cinto: cada uma já é um `Group` próprio.
Trocar a peça procedural por uma malha importada parenteada no mesmo nó
funciona sem tocar no rig.

**Trabalho:** um campo `parts?: Partial<Record<PartSlot, string>>` em
`Character`, e o montador consultando o campo antes de construir a peça.

**Limite:** só peças que não deformam. Uma jaqueta que precisa acompanhar o
torso dobrando é Fase 3.

## Fase 3 — Personagem com esqueleto de verdade

É troca de subsistema, e deve ser decidida à parte. O que reduz o susto:

`solveTwoBone` recebe `root: THREE.Object3D`, e **`THREE.Bone` herda de
`Object3D`**. O IK que já existe opera sobre um esqueleto importado sem
alteração nenhuma.

O trabalho real não é o IK, é o resto:

- rest pose compatível com o que a IK assume (`REST` aponta para `-Y`);
- mapear nomes de ossos, que variam por ferramenta, para os papéis que o
  código espera (ombro, cotovelo, mão, cabeça, mandíbula);
- prender a guitarra a um osso de mão em vez de ao torso;
- `SkinnedMesh` não é mesclável por `mergeStatic.ts` — vale conferir o
  custo antes, porque são quatro integrantes em cena;
- a qualidade "baixa" dos ajustes precisa continuar viável.

**Recomendação:** não começar por aqui. Fase 1 ensina o pipeline
Blender → GLB num objeto rígido, e o ganho visual já é grande.

## Ferramentas

| | |
|---|---|
| **Blender** | Grátis, exporta glTF/GLB nativo. É o alvo da Fase 1. |
| **Blockbench** | Bem mais fácil que Blender para low-poly estilizado. Bom primeiro passo. |
| **VRoid Studio** | Personagens já rigados, grátis. Exporta VRM, que é glTF por baixo. Atalho para a Fase 3. |
| **Mixamo** | Auto-rigging de um mesh sem esqueleto, grátis. |
| **three.js editor** | `threejs.org/editor`, para conferir um GLB no navegador antes de pôr no jogo. |

## Custo que isso acrescenta ao projeto

Hoje o build não carrega nenhum asset e a biblioteca de músicas é a única
coisa lida de disco. Importar modelos traz, de verdade:

- arte binária versionada no repositório;
- carregamento assíncrono numa cena que hoje monta tudo de forma síncrona —
  a tela de seleção precisa tratar o estado "ainda carregando";
- `GLTFLoader` e, se houver compressão, `DRACOLoader` no bundle, que já
  está em 928 kB.

Nada disso impede, mas nenhuma das três coisas existe hoje.
