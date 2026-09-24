/**
 * Painel de ajuste do cenário, aberto com `?rig` na URL.
 *
 * Mesma ideia do painel de encaixes, e pelo mesmo motivo: acertar onde um
 * palco de arquivo cai editando números, recarregando e olhando é lento e
 * impreciso. Aqui se troca de cenário na hora, se arrasta cada número e se
 * vê o resultado no quadro seguinte.
 *
 * O painel **não guarda nada**. Ele mostra o estado e devolve o JSON da
 * entrada; o que vale continua sendo a tabela em `stageModel.ts`. Mexer
 * aqui e não colar lá significa perder o ajuste no próximo recarregamento,
 * e isso é de propósito — um editor que grava escondido faz o repositório
 * deixar de descrever o que o jogo faz.
 *
 * Fica no canto **esquerdo**, porque o de encaixes já ocupa o direito e os
 * dois abrem com a mesma URL.
 */

import { STAGE_MODELS, type StageModel } from './stageModel'

/** O que o palco vivo oferece ao painel. */
export interface StageControls {
  /** Troca o cenário na hora; `null` volta ao palco construído em código. */
  setStageModel(model: StageModel | null): Promise<void>
  /** O cenário em uso, ou `null`. */
  currentStageModel(): StageModel | null
  /** Reaplica a transformação depois de o painel mexer nos números. */
  applyStageModel(): void
  /** Chuta uma transformação que põe o cenário na vizinhança certa. */
  fitStageModel(): void
  /** Caixa envolvente do cenário depois da transformação, em texto. */
  describeBounds(): string | null
  /** Se há estrado sob os pés de cada integrante, e a que altura. */
  footing(): Array<{ nome: string; chao: number | null }>
  /** Progresso do carregamento, para o painel não parecer travado. */
  isLoading(): boolean
}

/**
 * Controles da cena de jogo, não do cenário.
 *
 * Congelar e esconder o braço são da tela de jogo, não do palco — mas é
 * daqui que se usa: o braço tapa justamente a frente do palco que se está
 * ajustando, e sem congelar a banda se mexe debaixo do controle.
 */
export interface SceneControls {
  setPlayVisible(visible: boolean): void
  isPlayVisible(): boolean
  setFrozen(value: boolean): void
  isFrozen(): boolean
}

let controls: StageControls | null = null
let scene: SceneControls | null = null
let painel: HTMLDivElement | null = null

export function stagePanelEnabled() {
  if (typeof location === 'undefined') return false
  const params = new URLSearchParams(location.search)
  return params.has('rig') || params.has('stage-panel')
}

/** O palco se registra ao montar; a tela de jogo o esquece ao sair. */
export function registerStageControls(vivo: StageControls | null) {
  if (!stagePanelEnabled()) return
  controls = vivo
  if (!vivo) {
    painel?.remove()
    painel = null
    return
  }
  render()
}

/** A cena de jogo se registra ao montar, e some ao sair. */
export function registerSceneControls(vivo: SceneControls | null) {
  if (!stagePanelEnabled()) return
  scene = vivo
  if (controls) render()
}

/**
 * Redesenha o painel.
 *
 * O palco chama quando um cenário termina de carregar: o painel é montado
 * antes de o arquivo chegar, e sem este aviso ele fica dizendo
 * «carregando…» para sempre, com os controles mostrando a medida de um
 * cenário que já está na tela.
 */
export function refreshStagePanel() {
  if (!stagePanelEnabled() || !controls) return
  render()
}

/**
 * Números vivos do cenário atual.
 *
 * O painel edita **a entrada da tabela**, não uma cópia: é o mesmo objeto
 * que o palco leu ao montar, então arrastar um controle e chamar `apply`
 * basta. O preço é que trocar de cenário e voltar mantém o que foi
 * arrastado — o que é o comportamento desejado enquanto se afina.
 */
function atual(): StageModel | null {
  return controls?.currentStageModel() ?? null
}

function render() {
  if (!controls) return
  if (!painel) {
    painel = document.createElement('div')
    painel.id = 'stage-panel'
    document.body.appendChild(painel)
    injectStyle()
  }

  painel.innerHTML = ''
  const titulo = document.createElement('h3')
  titulo.textContent = 'Cenário'
  painel.appendChild(titulo)

  painel.appendChild(seletor())
  if (scene) painel.appendChild(controlesDeCena(scene))

  const model = atual()
  if (!model) {
    const aviso = document.createElement('p')
    aviso.className = 'stage-aviso'
    aviso.textContent = controls.isLoading()
      ? 'carregando…'
      : 'palco construído em código — escolha um arquivo acima'
    painel.appendChild(aviso)
    return
  }

  if (controls.isLoading()) {
    const aviso = document.createElement('p')
    aviso.className = 'stage-aviso'
    aviso.textContent = 'carregando…'
    painel.appendChild(aviso)
  }

  const eixos = ['x', 'y', 'z'] as const

  // A escala é o controle que mais importa e o que tem mais alcance útil:
  // os arquivos vão de uma maquete de 0,9 a uma sala de 180. Por isso ela é
  // logarítmica — num controle linear que chega a 30, tudo abaixo de 1 cabe
  // no primeiro pixel.
  const bloco = secao('transformação')
  bloco.appendChild(
    sliderLog('scale', model.scale, 0.02, 60, (v) => {
      model.scale = v
      controls!.applyStageModel()
    }),
  )
  for (let i = 0; i < 3; i++) {
    bloco.appendChild(
      slider(`position.${eixos[i]}`, model.position[i], 0.05, -40, 40, (v) => {
        model.position[i] = v
        controls!.applyStageModel()
      }),
    )
  }
  for (let i = 0; i < 3; i++) {
    bloco.appendChild(
      slider(`rotation.${eixos[i]}`, model.rotation[i], 0.02, -Math.PI, Math.PI, (v) => {
        model.rotation[i] = v
        controls!.applyStageModel()
      }),
    )
  }
  painel.appendChild(bloco)

  const luz = secao('luz e refletores')
  luz.appendChild(
    slider('emissiveCap', model.emissiveCap, 0.1, 0, 10, (v) => {
      model.emissiveCap = v
      controls!.applyStageModel()
    }),
  )
  for (let i = 0; i < 3; i++) {
    luz.appendChild(
      slider(`rigOffset.${eixos[i]}`, model.rigOffset[i], 0.05, -12, 12, (v) => {
        model.rigOffset[i] = v
        controls!.applyStageModel()
      }),
    )
  }
  painel.appendChild(luz)

  const plateia = secao('plateia')
  plateia.appendChild(
    slider('crowd.y', model.crowd.y, 0.05, -6, 2, (v) => {
      model.crowd.y = v
      controls!.applyStageModel()
    }),
  )
  plateia.appendChild(
    slider('crowd.z', model.crowd.z, 0.1, -6, 20, (v) => {
      model.crowd.z = v
      controls!.applyStageModel()
    }),
  )
  painel.appendChild(plateia)

  const partes = secao('o arquivo substitui')
  for (const [chave, rotulo] of [
    ['floor', 'piso'],
    ['backdrop', 'paredes e treliça'],
    ['amps', 'amplificadores'],
    ['ledWall', 'telão do refletor'],
  ] as const) {
    partes.appendChild(
      caixa(rotulo, model.replaces[chave] === true, (v) => {
        model.replaces[chave] = v
        controls!.applyStageModel()
      }),
    )
  }
  painel.appendChild(partes)

  const pisada = document.createElement('p')
  pisada.className = 'stage-pisada'
  pisada.innerHTML = textoDaPisada()
  painel.appendChild(pisada)

  const medida = document.createElement('p')
  medida.className = 'stage-medida'
  medida.textContent = controls.describeBounds() ?? ''
  painel.appendChild(medida)

  const encaixar = document.createElement('button')
  encaixar.textContent = 'encaixar automaticamente'
  encaixar.title =
    'escala pela pegada, centro no meio do palco e altura pelo estrado sob a banda'
  encaixar.onclick = () => {
    controls!.fitStageModel()
    render()
  }
  painel.appendChild(encaixar)

  const copiar = document.createElement('button')
  copiar.textContent = 'copiar JSON'
  copiar.onclick = () => {
    void navigator.clipboard.writeText(snippet()).then(() => {
      copiar.textContent = 'copiado'
      setTimeout(() => (copiar.textContent = 'copiar JSON'), 1200)
    })
  }
  painel.appendChild(copiar)

  const saida = document.createElement('pre')
  saida.id = 'stage-out'
  saida.textContent = snippet()
  painel.appendChild(saida)
}

/**
 * Congelar e esconder o braço.
 *
 * Os dois ficam acima de tudo porque são o que se liga **antes** de
 * começar a ajustar: com a banda se mexendo e o braço no meio da tela, não
 * há o que conferir.
 */
function controlesDeCena(vivo: SceneControls) {
  const bloco = secao('cena')

  const congelar = document.createElement('button')
  const rotular = () => {
    congelar.textContent = vivo.isFrozen() ? '▶ continuar' : '⏸ congelar tudo'
  }
  rotular()
  congelar.onclick = () => {
    vivo.setFrozen(!vivo.isFrozen())
    rotular()
  }
  bloco.appendChild(congelar)

  bloco.appendChild(
    caixa('braço da guitarra', vivo.isPlayVisible(), (v) => vivo.setPlayVisible(v)),
  )

  return bloco
}

function seletor() {
  const escolha = document.createElement('select')
  const classico = document.createElement('option')
  classico.value = ''
  classico.textContent = 'palco construído em código'
  escolha.appendChild(classico)
  for (const model of STAGE_MODELS) {
    const item = document.createElement('option')
    item.value = model.id
    item.textContent = model.label
    escolha.appendChild(item)
  }
  escolha.value = atual()?.id ?? ''
  // O estado vem de `isLoading`, e não de um `disabled = true` na mão: cada
  // `render` refaz este elemento do zero, então uma marca posta aqui some no
  // próximo desenho — e o seletor voltava a aceitar cliques no meio de um
  // carregamento de vinte megabytes.
  escolha.disabled = controls!.isLoading()
  escolha.onchange = () => {
    const model = STAGE_MODELS.find((m) => m.id === escolha.value) ?? null
    void controls!.setStageModel(model).finally(() => render())
    render()
  }
  return escolha
}

function secao(titulo: string) {
  const bloco = document.createElement('section')
  const nome = document.createElement('h4')
  nome.textContent = titulo
  bloco.appendChild(nome)
  return bloco
}

/**
 * O JSON da entrada, pronto para colar em `STAGE_MODELS`.
 *
 * Sai com `id`, `label` e `url` junto de propósito: é o que permite dizer
 * de qual cenário o bloco é sem depender de quem colou lembrar.
 */
function snippet() {
  const model = atual()
  if (!model) return '// palco construído em código — nada a copiar'
  const n = (v: number) => Number(v.toFixed(3))
  return JSON.stringify(
    {
      id: model.id,
      label: model.label,
      url: model.url,
      scale: n(model.scale),
      position: model.position.map(n),
      rotation: model.rotation.map(n),
      replaces: model.replaces,
      rigOffset: model.rigOffset.map(n),
      crowd: { y: n(model.crowd.y), z: n(model.crowd.z) },
      emissiveCap: n(model.emissiveCap),
      // Não tem controle no painel, mas sair do bloco faria colar o JSON
      // devolver ao palco as peças que o cenário esconde.
      ...(model.albedo !== undefined ? { albedo: n(model.albedo) } : {}),
      ...(model.hide ? { hide: model.hide } : {}),
      ...(model.draw === false ? { draw: false } : {}),
    },
    null,
    2,
  )
}

/**
 * Quem está pisando no palco.
 *
 * A linha mais útil do painel: um integrante sem estrado embaixo está
 * flutuando sobre o fosso, e nenhum plano de câmera mostra isso — os planos
 * miram o peito, e os pés ficam fora do quadro.
 */
function textoDaPisada() {
  if (!controls) return ''
  const pes = controls.footing()
  if (!pes.length) return ''
  return pes
    .map(({ nome, chao }) => {
      if (chao === null) return `<i class="mal">✕</i> ${nome}: sem chão`
      const degrau = Math.abs(chao)
      const marca = degrau < 0.06 ? 'bem' : 'mal'
      const sinal = degrau < 0.06 ? '✓' : chao < 0 ? '↓' : '↑'
      return `<i class="${marca}">${sinal}</i> ${nome}: ${chao.toFixed(2)}`
    })
    .join('<br>')
}

function atualizarSaida() {
  const saida = document.getElementById('stage-out')
  if (saida) saida.textContent = snippet()
  const medida = painel?.querySelector('.stage-medida')
  if (medida && controls) medida.textContent = controls.describeBounds() ?? ''
  const pisada = painel?.querySelector('.stage-pisada')
  if (pisada) pisada.innerHTML = textoDaPisada()
}

function slider(
  rotulo: string,
  valor: number,
  passo: number,
  min: number,
  max: number,
  onChange: (v: number) => void,
) {
  const linha = document.createElement('label')
  const nome = document.createElement('span')
  nome.textContent = rotulo
  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.step = String(passo)
  input.value = String(valor)
  const lido = document.createElement('b')
  lido.textContent = valor.toFixed(2)
  input.oninput = () => {
    const v = Number(input.value)
    lido.textContent = v.toFixed(2)
    onChange(v)
    atualizarSaida()
  }
  linha.append(nome, input, lido)
  return linha
}

/** Controle logarítmico, para uma faixa que cobre três ordens de grandeza. */
function sliderLog(
  rotulo: string,
  valor: number,
  min: number,
  max: number,
  onChange: (v: number) => void,
) {
  const linha = document.createElement('label')
  const nome = document.createElement('span')
  nome.textContent = rotulo
  const input = document.createElement('input')
  input.type = 'range'
  input.min = '0'
  input.max = '1000'
  input.step = '1'
  const paraPosicao = (v: number) =>
    ((Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min))) * 1000
  const paraValor = (p: number) =>
    Math.exp(Math.log(min) + (p / 1000) * (Math.log(max) - Math.log(min)))
  input.value = String(Math.round(paraPosicao(valor)))
  const lido = document.createElement('b')
  lido.textContent = valor.toFixed(3)
  input.oninput = () => {
    const v = paraValor(Number(input.value))
    lido.textContent = v.toFixed(3)
    onChange(v)
    atualizarSaida()
  }
  linha.append(nome, input, lido)
  return linha
}

function caixa(rotulo: string, valor: boolean, onChange: (v: boolean) => void) {
  const linha = document.createElement('label')
  linha.className = 'stage-caixa'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = valor
  const nome = document.createElement('span')
  nome.textContent = rotulo
  input.onchange = () => {
    onChange(input.checked)
    atualizarSaida()
  }
  linha.append(input, nome)
  return linha
}

function injectStyle() {
  const style = document.createElement('style')
  style.textContent = `
#stage-panel {
  position: fixed; top: 8px; left: 8px; width: 300px; max-height: 94vh;
  overflow: auto; z-index: 9999; background: rgba(12, 8, 4, 0.94);
  border: 2px solid #cd9f5b; border-radius: 4px; padding: 10px 12px;
  color: #f2e4c4; font: 12px ui-monospace, monospace;
}
#stage-panel h3 { margin: 0 0 8px; font-size: 13px; letter-spacing: .1em; text-transform: uppercase; }
#stage-panel h4 { margin: 12px 0 4px; font-size: 11px; color: #cd9f5b;
  border-top: 1px solid rgba(205,159,91,.3); padding-top: 8px; }
#stage-panel label { display: grid; grid-template-columns: 78px 1fr 48px; align-items: center; gap: 6px; margin: 2px 0; }
#stage-panel label.stage-caixa { display: flex; gap: 8px; }
#stage-panel input[type=range] { width: 100%; }
#stage-panel b { text-align: right; font-weight: 400; color: #9fbcd6; }
#stage-panel section > button { margin-top: 6px; }
#stage-panel button { width: 100%; margin-top: 10px; padding: 6px; cursor: pointer;
  background: #f2e4c4; color: #a81f16; border: 0; border-radius: 3px; font-weight: 700; }
#stage-panel select { width: 100%; padding: 5px; cursor: pointer;
  background: #241608; color: #f2e4c4; border: 1px solid rgba(205,159,91,.5);
  border-radius: 3px; font: inherit; }
#stage-panel select:disabled { opacity: .5; }
#stage-panel .stage-aviso { margin: 8px 0 0; color: #9a7338; font-size: 11px; }
#stage-panel .stage-medida { margin: 6px 0 0; color: #9fbcd6; font-size: 10px; line-height: 1.5; }
#stage-panel .stage-pisada { margin: 10px 0 0; font-size: 11px; line-height: 1.7; }
#stage-panel .stage-pisada i { font-style: normal; display: inline-block; width: 14px; }
#stage-panel .stage-pisada .bem { color: #3ddc84; }
#stage-panel .stage-pisada .mal { color: #ff6b57; }
#stage-panel pre { margin: 8px 0 0; white-space: pre-wrap; font-size: 10px;
  color: #9a7338; border-top: 1px solid rgba(205,159,91,.3); padding-top: 8px; }
`
  document.head.appendChild(style)
}
