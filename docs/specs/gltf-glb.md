# Migrar arte para glTF/GLB

Plano para trocar geometria construída em código por modelos importados,
sem perder o que a construção em código dá de graça.

**Estado em 21/09/2026: as fases 1 e 3 estão implementadas** — oito
guitarras e seis integrantes importados do Sketchfab. A fase 2 (peças
rígidas de personagem) não foi feita, e deixou de ser urgente: importar o
personagem inteiro cobre o que ela resolveria.

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

### O catálogo é só de importadas

As guitarras construídas em código saíram da loja: todas as que o jogador
escolhe vêm de arquivo. O montador procedural **continua no projeto**, por
dois usos que não são a loja:

- o **baixo do palco** (`BASS_PROP`), que o jogador não escolhe;
- o **lugar-guardado** enquanto um `.glb` carrega.

Um perfil salvo que aponte para uma guitarra removida cai no fallback de
`guitarById` e o jogo abre normalmente — o jogador só perde o que tinha
equipado.

### A normalização, em cinco passos

1. **Eixo do braço para Y.** Uma guitarra é comprida numa direção e estreita
   nas outras duas, então o eixo mais longo é o do braço.
2. **Escala**, para o comprimento virar 2,5 unidades.
3. **Qual ponta é o corpo**, comparando o ponto mais largo de cada metade —
   nenhuma parte de uma guitarra é mais larga que o corpo. O corpo vai para
   baixo, porque +Y é a direção do braço.
4. **Tampo de frente**: alinhado o braço em Y, sobram largura e espessura, e
   a espessura é sempre a menor. Vai para Z, como no `shapes.ts`.
5. **Braço exatamente na vertical.** Os passos acima alinham a *caixa*, e a
   caixa não é a guitarra: com o braço alguns graus torto dentro do arquivo,
   a caixa fica reta e o instrumento não. Do centro de massa do terço de
   baixo ao do terço de cima sai o eixo real, que é alinhado com +Y. Usa
   centro de massa, e não vértices extremos, porque um extremo é um ponto só
   — a ponta de um headstock ou uma alavanca mandaria o eixo para o lado.

**A escala vem por último, depois de todos os giros.** Medida no meio do
caminho, o mesmo alvo de 2,5 produzia comprimentos de 2,40 a 2,62, porque a
medida sai de uma caixa alinhada aos eixos e cada rotação muda essa caixa.

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

A cena monta tudo de forma síncrona, e o arquivo chega depois. Nos três
lugares onde isso aparece:

- **na prévia da loja**, um sinalizador de cancelamento descarta um
  carregamento antigo que chegue depois de o jogador já ter trocado de item;
- **no palco** e **na prévia de personagem**, a guitarra construída em
  código entra na hora como lugar-guardado e é trocada quando o arquivo
  chega. Esperar o arquivo atrasaria o início da música, e um guitarrista de
  mão vazia é pior que uma guitarra provisória.

### Enquadramento na loja

Todas no mesmo ângulo: de frente, braço para cima, inclinadas uns seis graus
para a esquerda — sem giro em torno da vertical. A pose anterior girava
0,34 rad, quase vinte graus, e punha cada guitarra num ângulo diferente
conforme a espessura do corpo.

O `fit` da prévia é 1,05: no padrão de 0,88, o enquadramento encostava nas
bordas e a ponta do headstock saía do quadro.

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

## Fase 3 — Personagem com esqueleto — FEITA

`src/render/character/characterGlb.ts` carrega um integrante de arquivo e
cumpre a mesma porta que a marionete construída em código — agora declarada
em `character/stageCharacter.ts`. Palco e prévia recebem um `StageCharacter`
e não sabem qual das duas implementações têm em mãos.

### O que tornou isso viável

`solveTwoBone` recebe `THREE.Object3D`, e **`THREE.Bone` herda de
`Object3D`**. A conta da cinemática inversa serve para um esqueleto
importado sem uma linha de diferença.

### Três coisas que o plano não previa

**1. Nomes de osso não têm padrão, e o three ainda os reescreve.**

Apareceram quatro convenções em seis arquivos:

| perfil | ombro → braço → antebraço → mão |
|---|---|
| `mixamo` | `LeftShoulder` `LeftArm` `LeftForeArm` `LeftHand` |
| `maya-shjnt` | `l_Arm_Clavicle` `l_Arm_Shoulder` `l_Arm_Elbow` `l_Arm_Wrist` |
| `bone-bicep` | `Bone_Collar_L` `Bone_Bicep_L` `Bone_Forearm_L` `Bone_Palm_L` |

E o **GLTFLoader sanitiza os nomes**: o `mixamorig:LeftArm` que está dentro
do arquivo chega em runtime como `mixamorig_LeftArm`. Um padrão escrito com
dois-pontos nunca casa. O casamento joga fora tudo que não é letra, o que
resolve isso e os sufixos numéricos de uma vez.

**2. A IK da marionete não serve para um rig de fora.**

`solveTwoBone` escreve a rotação absoluta do ombro assumindo que o osso
aponta para −Y em repouso. Isso vale para um esqueleto escrito à mão aqui
dentro e não vale para nenhum arquivo importado. Aplicada a um rig Mixamo,
ela levanta os braços acima da cabeça.

`solveRestChain`, no mesmo arquivo, faz a mesma conta e aplica o resultado
**por cima da pose de repouso**: o que se calcula é o giro que leva o braço
de onde ele repousa até onde precisa estar. É o que "retargeting" quer
dizer, e é o que faz a mesma rotina servir para qualquer convenção de eixo.

**3. O alvo precisa estar no espaço do pai da cadeia.**

`solveTwoBone` subtrai `root.position`, que é a posição do osso *dentro do
pai*. Parar no espaço do mundo deixava a IK resolvendo um triângulo entre
unidades incompatíveis — os ossos de um rig Mixamo medem dezenas e um alvo
em unidades de jogo mede frações. `parent.worldToLocal` traz escala e giro
de uma vez.

### A guitarra pendura no grupo, não num osso

Prendê-la ao osso do peito parecia melhor, porque acompanharia o balanço.
Mas cada rig orienta o peito do seu jeito, e a guitarra saía atravessada no
tronco, cada modelo de um jeito. Presa ao grupo do personagem, fica onde se
espera em todos.

### Materiais brancos

Três dos seis arquivos usavam **`KHR_materials_pbrSpecularGlossiness`**,
extensão descontinuada do glTF que o three.js não lê mais. O modelo carrega
sem erro nenhum e aparece **branco**, porque as texturas ficaram dentro da
extensão ignorada. `npm run optimize-models` agora roda `metalrough` antes
de comprimir, o que as traz para o metallic-roughness padrão.

### O limite honesto

- **Quatro dos seis têm braços animados.** Os outros dois vieram sem
  esqueleto: aparecem e ficam parados, com a guitarra pendurada. É o caso
  que o README sempre descreveu — modelo sem rig é uma estátua.
- **A pose é de quem segura a guitarra, não de quem toca uma nota
  específica.** As mãos vão para a região certa; não assentam exatamente
  sobre a escala. Fechar essa distância exigiria medir os pontos da guitarra
  por modelo, que é a pendência dos pontos da IK.
- **Só o guitarrista é importado.** Baixista, vocalista e baterista
  continuam marionetes, e `setRole` é ignorado num importado: sentar um
  baterista exigiria saber onde estão as pernas, e isso o esqueleto não diz
  de forma confiável entre ferramentas.

## Adereços de palco — FEITOS

Bateria, microfone e baixo também vêm de arquivo. Diferente de guitarras e
integrantes, **não são escolha do jogador** — são cenário —, então não têm
entrada em `content/`: os caminhos ficam em `STAGE_PROPS`, no próprio
`render/props.ts`, e o palco os carrega direto.

`loadProp` normaliza menos que o carregador de guitarra, porque um adereço
não precisa de eixo de braço nem de face de frente: basta escala uniforme
pela maior dimensão e assentar a base em `y=0` (ou centralizar, para o que
é preso na mão).

O baixo é exceção: um baixo **é** uma guitarra, e passa pelo
`loadGuitarGlb` com `scale` compensando o corpo e o braço maiores.

### Escolher entre dois arquivos

Vieram dois kits de bateria e dois baixos. Os pesos decidiram:

| | vértices | depois de otimizar |
|---|---|---|
| `drum_kit` | 354.826 | 6,75 MB |
| `drum_set_with_blender_armature` | 62.412 | 0,73 MB |

As texturas dos dois somavam quase nada — a diferença era geometria pura.
Para uma bateria que fica no fundo do palco, o kit pesado seria mais
polígonos que o jogo inteiro desenha por quadro. Os arquivos não escolhidos
foram apagados.

### O kit fica à frente do baterista

A plateia está em `+z` e o baterista senta em `z = -4,1`. O kit importado
foi para `z = -3,5`: mais ao fundo, ficaria atrás de quem toca.

### Marca de descarte

Adereço chega de forma assíncrona, e a tela de jogo é **desmontada de
verdade** ao sair. Sem uma marca de descarte no palco, um arquivo que termina
de carregar depois da saída seria acrescentado a uma cena já descartada, e
vazaria memória de GPU.

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
