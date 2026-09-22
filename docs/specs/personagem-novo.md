# Acrescentar um personagem que toca

Receita para pôr um `.glb` de banco público no elenco e deixá-lo tocando
guitarra como os outros. É a ordem que importa: **conferir o rig antes de
cadastrar** economiza a tarde que já se perdeu descobrindo na tela o que um
comando mostrava em dez segundos.

A animação é uma só, `/models/animations/guitar-playing.glb`, e vem de um rig
Mixamo em T-pose. Quem a adapta para outros esqueletos é
`src/render/character/animationClips.ts` — vale ler o bloco de doc do meio
dele antes de mexer em qualquer coisa aqui.

---

## 1. Preparar o arquivo

```bash
# uma pasta só com os novos, senão reprocessa o que já está pronto
npm run optimize-models <pasta-com-os-glb> public/models/characters
```

Corta textura para 512 em WebP e comprime geometria com `quantize`. Nos
modelos deste elenco isso levou 8–12 MB para 1–3 MB sem tocar no esqueleto.

O nome do arquivo vira o `id` do personagem (`glb-<arquivo>`), então ele
precisa sobreviver a uma URL — a ferramenta já sanitiza.

`public/models/` **não é versionado**: são megabytes de binário com licença
de terceiros. Guarde os originais fora do repositório.

---

## 2. Conferir o rig — antes de cadastrar

Duas perguntas, nessa ordem: **tem esqueleto?** e **de que família?**

```bash
cat > src/rig.probe.test.ts <<'EOF'
import { describe, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { readFileSync } from 'node:fs'
import { boneNameMap, retarget, retargetMapped } from './render/character/animationClips'

globalThis.self = globalThis as never
if (!globalThis.createImageBitmap)
  (globalThis as never as Record<string, unknown>).createImageBitmap =
    async () => ({ width: 1, height: 1, close() {} })

const loader = new GLTFLoader()
const load = (p: string) => {
  const b = readFileSync(p)
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
  return new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>(
    (ok, err) => loader.parse(ab, '', ok as never, err))
}

describe('rig', () => {
  it('confere', async () => {
    const clipe = await load('public/models/animations/guitar-playing.glb')
    const clip = clipe.animations.find((a) => a.tracks.length > 0)!
    for (const arquivo of process.env.MODELOS!.split(',')) {
      const gltf = await load(`public/models/characters/${arquivo}.glb`)
      const raiz = gltf.scene
      raiz.updateMatrixWorld(true)
      let pele: THREE.SkinnedMesh | null = null
      raiz.traverse((n) => {
        if (!pele && (n as THREE.SkinnedMesh).isSkinnedMesh) pele = n as THREE.SkinnedMesh
      })
      const ossos = pele ? (pele as THREE.SkinnedMesh).skeleton.bones.map((b) => b.name) : []
      const direto = retarget(clip, raiz)
      const mapa = pele ? boneNameMap(pele as unknown as THREE.Object3D, clipe.scene) : {}
      const mapeado = !direto && pele ? retargetMapped(clip, clipe.scene, pele) : null
      console.log(`\n=== ${arquivo} ===`)
      console.log(`  ossos: ${ossos.length}`)
      console.log(`  caminho: ${direto ? 'DIRETO' : mapeado ? 'MAPEADO' : 'NENHUM -- estatua'}`)
      console.log(`  mapa (${Object.keys(mapa).length}/8): ${JSON.stringify(mapa)}`)
      console.log(`  bracos: ${ossos.filter((n) => /arm|shoulder|clav|hand|bicep|fore|wrist|elbow/i.test(n)).slice(0, 12).join(', ')}`)
    }
  }, 300000)
})
EOF
MODELOS=meu_personagem npx vitest run src/rig.probe.test.ts
rm src/rig.probe.test.ts
```

Leia a saída assim:

| o que apareceu | o que significa |
|---|---|
| `caminho: DIRETO` | rig Mixamo. Não precisa de mais nada: a cópia direta de faixas resolve. |
| `caminho: MAPEADO` e `mapa 8/8` | família conhecida e reconhecida. Siga para o passo 3. |
| `caminho: MAPEADO` e `mapa` com menos de 8 | parte do braço não casou. Vá para o passo 4. |
| `caminho: NENHUM` e `ossos: 0` | **o arquivo não tem esqueleto.** Vá para o passo 6. |

---

## 3. Cadastrar

Uma linha em `IMPORTED`, em `src/content/characters.ts`:

```ts
// arquivo, nome, descrição, estrelas, preço, tem esqueleto, giro
['meu_personagem', 'Nome Dele', 'Uma linha de sabor', 18, 8500, true, undefined],
```

A lista é lida de cima para baixo e **é** a ordem da vitrine, então preço e
estrelas têm de subir junto com a posição — há teste que cobra isso
(`src/content/roster.test.ts`). Se ele reclamar da ordem, é a lista que está
errada, não o teste.

O último campo é um giro em torno da vertical, em radianos, para o caso de o
modelo nascer de costas. Quase nunca é necessário: o retargeting mede para
onde cada corpo olha e desconta a diferença sozinho.

---

## 4. Família de esqueleto nova

`SKELETONS`, em `animationClips.ts`, tem uma entrada por convenção de
nomenclatura — Mixamo, Maya, Rigify, Biped do 3ds Max, Biped da Valve,
Unreal, e um rig próprio. Se o `mapa` do passo 2 veio incompleto, acrescente
a sua.

**Cuidado com número no fim do nome.** Os padrões escritos na tabela passam
por `patternKey`, que — diferente do `slotKey` dos nomes de osso — **não**
corta o sufixo numérico, justamente porque num padrão o número costuma fazer
parte do nome. A coluna do Unreal é `spine_01`, `spine_02`, `spine_03`: com o
corte, as três viram `spine`, casam todas com o primeiro osso e a coluna
colapsa numa junta só. O tronco simplesmente não se mexe, sem aviso nenhum.

**Confira os comprimentos dos elos antes de confiar nos nomes.** É a parte
que já custou um personagem: no Biped do 3ds Max o braço é `Arm`, `Arm1` e
`Arm2`, e a leitura óbvia — `Arm` de úmero, `Arm1` de antebraço — está
deslocada em um. `Arm` pendura no **pescoço** e mede 10 cm: é clavícula. Os
comprimentos não deixam dúvida:

| Biped (Gokê) | | Mixamo (Vermelhão) | |
|---|---|---|---|
| `Arm` → `Arm1` | 0,102 m | `Shoulder` → `Arm` | 0,132 m |
| `Arm1` → `Arm2` | 0,236 m | `Arm` → `ForeArm` | 0,229 m |
| `Arm2` → `Hand` | 0,219 m | `ForeArm` → `Hand` | 0,234 m |

Com o deslocamento o Gokê tocava com os punhos a 29 cm um do outro em vez de
59, porque o que se dirigia como antebraço era o úmero inteiro. Meça a
distância de cada elo, em metros de palco, e compare com a coluna do Mixamo:
clavícula curta, úmero e antebraço parecidos entre si.

O mesmo rig também não chama a perna de `Thigh` nem de `Calf`: é `Leg`, `Leg1`
e `Foot`. Enquanto a tabela procurou os nomes errados, ele tocou de pernas
juntas enquanto o resto do elenco abria a base — e nada avisou, porque um
papel que não casa simplesmente não recebe animação.

**Preencha também os marcos da palma** — `leftIndex`, `leftMiddle`,
`leftLittle`, `leftThumb` e os quatro da direita. São a base de cada dedo, e é
deles que sai o referencial que decide o giro do pulso: palma virada para o
corpo, dedos para baixo na mão da palhetada e para cima na que corre a escala.
Sem eles o pulso cai numa saída pior, e a mão fica torta mesmo com o braço
certo.

Duas armadilhas medidas:

- **nome de dedo raramente diz qual dedo é.** No rig Maya do Douglas são
  `Finger_01` a `Finger_04`; a ordem saiu de medir a distância ao polegar —
  o `01` é o mais perto (5,8 cm) e o `04` o mais longe (7,7 cm), logo índice →
  mindinho.
- **rig com poucos dedos usa outro par de marcos**, e o código já escolhe
  sozinho: sem mindinho, a travessia da palma vira polegar→pulso em vez de
  índice→mindinho. Não é capricho — polegar→índice fica a 21° do eixo dos
  dedos no clipe e a 52° no Gokê, quase paralelo nos dois e discordando 31
  graus entre si; tirar perpendicular daí virava a palma do avesso.

Acrescente o mesmo nome em `PAPEIS`, em `tools/derive-attachment.ts`, senão o
passo 5 não acha os ossos.

---

## 5. Onde a guitarra fica

Não se procura no painel: **mede-se.**

```bash
npm run attachment meu_personagem
```

Sai um bloco pronto para colar em `CHARACTER_ADJUSTMENTS`, em
`src/render/character/bandRig.ts`. O comando sem argumento mede o elenco
inteiro, e para quem já tem entrada imprime o quanto o medido discorda dela.

A conta está explicada no topo do script. Em resumo: toca-se o clipe, tira-se
a média das duas mãos, e a posição sai daí mais o braço até a origem da
guitarra; a rotação sai de um referencial de três eixos, o braço da guitarra
entre as mãos e o para-frente do corpo.

**A linha de conferência é o que importa ler.** Ela compara o medido com o
que está na tabela:

```
//   contra a tabela: 0.110 m e 16.4°
```

Até **0,15 m e 20°** é a faixa em que dois ajustes bons discordam — foi
medida contra o Kairos, cuja entrada tinha sido achada à mão. Acima disso o
script avisa, e o lugar de olhar é o **rig**, não a tabela: um encaixe que
pede giro muito fora do dos vizinhos quase sempre é braço mapeado errado
(passo 4). Antes de o Biped ser corrigido, o Gokê pedia 35° fora do resto.

Duas coisas que o script **não** faz, e por que:

- **Não mexe em `scale`.** A guitarra tem o mesmo tamanho na mão de qualquer
  um; é assim na vida. Braço mais curto alcança um traste diferente, e isso é
  certo, não defeito.
- **Não resolve corpo que avança além das próprias mãos.** Foi o caso do
  Homero, que saiu do elenco: com barriga assim a guitarra não pode estar ao
  mesmo tempo debaixo das mãos e fora do abdômen, e aí sobra escolher um meio
  olhando a imagem. É a única exceção, e tem de ficar comentada na tabela.

---

## 6. Arquivo sem esqueleto

Acontece, e não tem conserto do lado do código: modelo convertido de OBJ não
tem rig nenhum, por definição do formato. Foi o caso do Estevão Rodrigues —
o nó dentro do arquivo se chama `...obj.cleaner.materialmerger.gles`, e vem
com `skins: 0`.

Dá para cadastrar com `animated: false`: ele carrega, aparece na loja e no
palco com a guitarra na cintura, e fica parado. A arquitetura sempre previu
isso. Mas **o elenco não ficou com nenhum** — o Estevão entrou assim e saiu na
mesma semana, porque um integrante que não toca destoa demais dos outros oito
numa vitrine em que todos tocam. Trate `animated: false` como sala de espera,
não como destino.

Para fazê-lo tocar, o caminho é **conseguir o rig**, não mexer na animação:

- subir a malha no Mixamo, que rigga humanoide estático automaticamente e
  devolve um esqueleto Mixamo — que é justamente a família do caminho
  `DIRETO`, a que não tem conta para errar;
- ou procurar outro envio do mesmo personagem que já venha com esqueleto.

Confira com o passo 2 antes de trocar o `animated` para `true`.

---

## 7. Conferir na imagem

Alegar que ficou bom sem ver o PNG não vale.

```bash
npm run gallery characters   # scripts/gallery-char-*.png, um por personagem
npm run shots                # scripts/cam-guitar-hands.png, em partida
```

O padrão é o Vermelhão e o Kairos: eles são rigs Mixamo, passam pela cópia
direta e por isso são a referência que não depende de nenhuma conta.

Aceitável:

- mão esquerda no braço da guitarra, **palma virada para o corpo e dedos para
  cima**, fechando sobre a escala;
- mão direita sobre as cordas ou o corpo, **palma para o corpo e dedos para
  baixo**;
- cotovelos dobrados para fora, braços em pose de gente.

Não aceitável — se aparecer, volte ao passo 2 ou 4:

- braço atrás do corpo, ou atravessando o tronco;
- mão longe da guitarra, ou flutuando;
- cotovelo invertido, ombro deformado, braço esticado demais;
- palma virada para fora, ou mão espalmada em cima do braço da guitarra — é o
  sintoma de marco de palma faltando (passo 4);
- corpo duro, de pernas juntas, com só o braço se mexendo enquanto os outros
  abrem a base — é nome de coluna ou de perna que não casou (passo 4);
- personagem que claramente não está segurando nada.

O corpo inteiro é dirigido, não só os braços: coluna, pescoço, pernas e
dedos. É o que separa um personagem que **toca** de um que fica duro mexendo
o braço. O que continua em repouso, de propósito ou por limite:

- **o quadril**, de propósito. É o pai da coluna e das duas pernas, e as três
  cadeias discordariam sobre para onde girá-lo. Ele é a referência de aprumo,
  e o personagem fica plantado — que é como um guitarrista diante do microfone
  se comporta.
- **a ponta de cada fila** — cabeça, pés, última junta de dedo. Não têm elo
  seguinte para mirar, então acompanham rigidamente quem vem antes.

Para conferir quanto de fato chega em cada um, conte as faixas do clipe
adaptado por parte do corpo. Um rig completo fica em torno de 36; bem menos
que isso é sintoma de nome não casado, não de limite do modelo.

---

## Resumo

```bash
npm run optimize-models <pasta> public/models/characters  # 1
#                                                           2  conferir o rig
#                                                           3  cadastrar em characters.ts
#                                                           4  família nova? SKELETONS + PAPEIS
npm run attachment meu_personagem                         # 5  medir o encaixe
npm run gallery characters                                # 7  olhar o PNG
npm test                                                  #    a ordem da vitrine
```
