# Migrar arte para glTF/GLB

Plano para trocar geometria construída em código por modelos importados,
sem perder o que a construção em código dá de graça.

Estado em 21/09/2026: nenhum arquivo de modelo existe no projeto.

## O que torna isso diferente de "só carregar um GLB"

Os integrantes da banda **não são `SkinnedMesh`**. São marionetes de
`THREE.Object3D` rígidos aninhados (`hips` → `torso` → `neck` → `head`, e
os braços), animadas por cinemática inversa de dois ossos em
`src/render/character/ik.ts`, que posiciona as mãos sobre o instrumento.

Daí a regra que organiza este plano inteiro:

> Peça rígida importada entra sem briga. Corpo articulado importado, não —
> ele viria sem o rig que anima tudo.

## Fase 1 — Guitarras (o caminho curto)

A costura já existe. `src/render/guitar/guitarModel.ts` expõe:

```ts
export interface GuitarModel {
  group: THREE.Group
  setGlow(amount: number): void    // star power
  setWhammy(amount: number): void  // alavanca
  dispose(): void
}
```

E `CharacterModel` tem um `instrumentAnchor` público, um `Group` pendurado
no torso. Uma função que devolva esse mesmo contrato entra no lugar de
`buildGuitar()` e nada mais na cena precisa saber.

**Trabalho:**

1. `src/render/guitar/guitarGlb.ts`, com
   `loadGuitarGlb(url, guitar): Promise<GuitarModel>` usando `GLTFLoader`.
2. Convenção de nomes dentro do `.glb`, para o carregador achar o que
   precisa sem adivinhar:
   - malhas com prefixo `glow_` entram na lista do `setGlow`;
   - um nó chamado `whammy_pivot` é o que o `setWhammy` gira;
   - o resto é geometria muda.
3. Campo opcional `model?: string` em `Guitar`
   (`src/content/guitars.ts`). Com ele, carrega o GLB; sem ele, constrói
   como hoje. As duas formas convivem, e nenhuma guitarra existente
   precisa ser refeita.
4. `dispose()` precisa liberar geometria, materiais **e texturas** do GLB.
   O caminho procedural não tem textura e por isso o `dispose` atual não
   trata disso.

**A armadilha, e é real:** as mãos são posicionadas por *constantes de
distância* em `characterModel.ts` — entre elas a distância do corpo até o
fim da escala —, e não medidas a partir da geometria. Um GLB fora da
convenção do `shapes.ts` faz a mão flutuar ao lado do braço da guitarra.

Convenção a respeitar: corpo centrado na origem, `+Y` apontando para o
braço, 1 unidade ≈ 30cm, guitarra inteira ≈ 2,5 unidades.

**Melhoria que vale fazer junto:** transformar essas constantes em campos
do modelo (`neckEnd`, `bridge`), lidos tanto pelo caminho procedural quanto
pelo importado. Aí um GLB em qualquer escala funciona declarando onde
ficam seus pontos, e a IK para de depender de um número global.

**Como validar:** `npm run gallery` fotografa cada guitarra; uma importada
ao lado das procedurais mostra escala e orientação erradas de imediato.

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
