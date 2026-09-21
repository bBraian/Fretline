/**
 * Painel de ajuste dos encaixes, aberto com `?rig` na URL.
 *
 * Existe porque acertar a posição de um instrumento na mão de um personagem
 * editando números no código, recarregando e olhando é lento e impreciso —
 * e foi assim que várias rodadas se perderam. Aqui se mexe e se vê na hora.
 *
 * O painel **não guarda nada**: ele mostra o estado e devolve o bloco de
 * código pronto. O que vale continua sendo o `bandRig.ts` — mexer aqui e
 * não colar lá significa perder o ajuste no próximo recarregamento, e isso é
 * de propósito. Um editor que grava escondido faz o repositório deixar de
 * descrever o que o jogo faz.
 */

import * as THREE from 'three'
import { ATTACHMENTS, CHARACTER_ADJUSTMENTS, type Attachment } from './bandRig'

interface Live {
  nome: string
  attachment: Attachment
  anchor: THREE.Object3D
  /** Refaz o encaixe com os valores de agora. */
  apply: () => void
  /** Personagem sendo ajustado, quando o encaixe é de um só. */
  characterId?: string | null
}

const registrados: Live[] = []

/** Personagem em edição, para o bloco copiado sair na chave certa. */
let editando: string | null = null

/** A tela de seleção diz quem está no visor. */
export function setRigCharacter(id: string | null) {
  if (!rigPanelEnabled()) return
  editando = id
  render()
}

/** Esquece os encaixes de uma tela que saiu do ar. */
export function clearAttachments() {
  if (!rigPanelEnabled()) return
  registrados.length = 0
  if (painel) painel.innerHTML = ''
}

export function rigPanelEnabled() {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('rig')
}

/**
 * Registra um encaixe vivo para o painel poder mexer nele.
 *
 * Chamado pelo palco ao pendurar cada instrumento; fora do modo `?rig` não
 * faz nada.
 */
export function registerAttachment(
  nome: string,
  attachment: Attachment,
  anchor: THREE.Object3D,
  apply: () => void,
  characterId?: string | null,
) {
  if (!rigPanelEnabled()) return
  // Um instrumento é posicionado mais de uma vez — o provisório e o
  // importado —, e cada encaixe deve aparecer uma vez só. O registro mais
  // novo substitui o anterior, porque é o que está na tela.
  const existente = registrados.findIndex((r) => r.nome === nome)
  const vivo = { nome, attachment, anchor, apply, characterId }
  if (existente >= 0) registrados[existente] = vivo
  else registrados.push(vivo)
  render()
}

let painel: HTMLDivElement | null = null
let esperandoCena = false

/** Ganchos que a cena publica quando o painel está ligado. */
interface RigScene {
  shots: string[]
  lockShot(id: string | null): void
  lockedShot(): string | null
  setFrozen(value: boolean): void
  isFrozen(): boolean
}

function cena(): RigScene | null {
  return (window as unknown as { __rigScene?: RigScene }).__rigScene ?? null
}

/**
 * Congelar e escolher o plano.
 *
 * Sem os dois, ajustar é impossível na prática: a câmera corta sozinha a
 * cada poucos compassos e a banda se mexe debaixo do controle que se está
 * arrastando.
 */
function controlesDeCena() {
  const bloco = document.createElement('section')
  bloco.className = 'rig-cena'

  const scene = cena()
  if (!scene) {
    const aviso = document.createElement('p')
    aviso.textContent = 'entre numa música para congelar e trocar de câmera'
    bloco.appendChild(aviso)
    // Os instrumentos podem registrar antes de a cena publicar os ganchos;
    // tenta de novo em vez de deixar o painel sem os controles.
    if (!esperandoCena) {
      esperandoCena = true
      const tentar = () => {
        if (cena()) {
          esperandoCena = false
          render()
        } else {
          setTimeout(tentar, 400)
        }
      }
      setTimeout(tentar, 400)
    }
    return bloco
  }

  const congelar = document.createElement('button')
  const rotular = () => (congelar.textContent = scene.isFrozen() ? '▶ continuar' : '⏸ congelar')
  rotular()
  congelar.onclick = () => {
    scene.setFrozen(!scene.isFrozen())
    rotular()
  }
  bloco.appendChild(congelar)

  if (!scene.shots.length) return bloco

  const camera = document.createElement('select')
  const solto = document.createElement('option')
  solto.value = ''
  solto.textContent = 'câmera: direção automática'
  camera.appendChild(solto)
  for (const id of scene.shots) {
    const item = document.createElement('option')
    item.value = id
    item.textContent = `câmera: ${id}`
    camera.appendChild(item)
  }
  camera.value = scene.lockedShot() ?? ''
  camera.onchange = () => scene.lockShot(camera.value || null)
  bloco.appendChild(camera)

  return bloco
}

function render() {
  if (!painel) {
    painel = document.createElement('div')
    painel.id = 'rig-panel'
    document.body.appendChild(painel)
    injectStyle()
  }

  painel.innerHTML = ''
  const titulo = document.createElement('h3')
  titulo.textContent = 'Encaixes'
  painel.appendChild(titulo)
  painel.appendChild(controlesDeCena())

  for (const item of registrados) {
    const bloco = document.createElement('section')
    const nome = document.createElement('h4')
    nome.textContent = editando
      ? `${item.nome} · ${editando}`
      : `${item.nome} · osso ${item.attachment.bone}`
    bloco.appendChild(nome)

    const eixos = ['x', 'y', 'z'] as const
    for (const [campo, passo, min, max] of [
      ['position', 0.005, -1.5, 1.5],
      ['rotation', 0.02, -Math.PI, Math.PI],
    ] as const) {
      for (let i = 0; i < 3; i++) {
        bloco.appendChild(
          slider(`${campo}.${eixos[i]}`, item.attachment[campo][i], passo, min, max, (v) => {
            item.attachment[campo][i] = v
            item.apply()
          }),
        )
      }
    }
    bloco.appendChild(
      slider('scale', item.attachment.scale, 0.01, 0.02, 2, (v) => {
        item.attachment.scale = v
        item.apply()
      }),
    )
    painel.appendChild(bloco)
  }

  const copiar = document.createElement('button')
  copiar.textContent = editando ? 'copiar ajuste deste personagem' : 'copiar para bandRig.ts'
  copiar.onclick = () => {
    void navigator.clipboard.writeText(snippet()).then(() => {
      copiar.textContent = 'copiado'
      setTimeout(() => (copiar.textContent = 'copiar para bandRig.ts'), 1200)
    })
  }
  painel.appendChild(copiar)

  const saida = document.createElement('pre')
  saida.id = 'rig-out'
  saida.textContent = snippet()
  painel.appendChild(saida)
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
  lido.textContent = valor.toFixed(3)
  input.oninput = () => {
    const v = Number(input.value)
    lido.textContent = v.toFixed(3)
    onChange(v)
    const saida = document.getElementById('rig-out')
    if (saida) saida.textContent = snippet()
  }
  linha.append(nome, input, lido)
  return linha
}

/**
 * O bloco pronto para colar em `bandRig.ts`.
 *
 * Com um personagem em edição, sai como ajuste dele — é o que permite dar a
 * cada um o seu ângulo sem mexer no que já está bom para os outros. Sem
 * personagem (no palco, onde há três de uma vez), sai a tabela base.
 */
function snippet() {
  const n = (v: number) => Number(v.toFixed(3))
  const corpoDe = (a: Attachment) => `    bone: '${a.bone}',
    position: [${a.position.map(n).join(', ')}],
    rotation: [${a.rotation.map(n).join(', ')}],
    scale: ${n(a.scale)},`

  if (editando) {
    // O encaixe vivo é o que está na tela, com o que já foi arrastado.
    const vivo = registrados.find((r) => r.characterId === editando)?.attachment
    const base = ATTACHMENTS.guitar
    const linhas = (a: Partial<Attachment>) => `    position: [${(a.position ?? base.position).map(n).join(', ')}],
    rotation: [${(a.rotation ?? base.rotation).map(n).join(', ')}],
    scale: ${n(a.scale ?? base.scale)},`

    const entradas = Object.entries(CHARACTER_ADJUSTMENTS)
      .filter(([id]) => id !== editando)
      .map(([id, a]) => `  '${id}': {\n${linhas(a)}\n  },`)
    if (vivo) entradas.push(`  '${editando}': {\n${linhas(vivo)}\n  },`)

    return `export const CHARACTER_ADJUSTMENTS: Record<string, Partial<Attachment>> = {\n${entradas.join('\n')}\n}`
  }

  const corpo = Object.entries(ATTACHMENTS)
    .map(([chave, a]) => `  ${chave}: {\n${corpoDe(a)}\n  },`)
    .join('\n')
  return `export const ATTACHMENTS: Record<string, Attachment> = {\n${corpo}\n}`
}

function injectStyle() {
  const style = document.createElement('style')
  style.textContent = `
#rig-panel {
  position: fixed; top: 8px; right: 8px; width: 290px; max-height: 94vh;
  overflow: auto; z-index: 9999; background: rgba(12, 8, 4, 0.94);
  border: 2px solid #cd9f5b; border-radius: 4px; padding: 10px 12px;
  color: #f2e4c4; font: 12px ui-monospace, monospace;
}
#rig-panel h3 { margin: 0 0 8px; font-size: 13px; letter-spacing: .1em; text-transform: uppercase; }
#rig-panel h4 { margin: 10px 0 4px; font-size: 11px; color: #cd9f5b; }
#rig-panel label { display: grid; grid-template-columns: 62px 1fr 46px; align-items: center; gap: 6px; margin: 2px 0; }
#rig-panel input { width: 100%; }
#rig-panel b { text-align: right; font-weight: 400; color: #9fbcd6; }
#rig-panel button { width: 100%; margin-top: 10px; padding: 6px; cursor: pointer;
  background: #f2e4c4; color: #a81f16; border: 0; border-radius: 3px; font-weight: 700; }
#rig-panel .rig-cena { border-bottom: 1px solid rgba(205,159,91,.35); padding-bottom: 10px; margin-bottom: 4px; }
#rig-panel .rig-cena button { margin-top: 0; }
#rig-panel .rig-cena p { margin: 0; color: #9a7338; font-size: 11px; }
#rig-panel select { width: 100%; margin-top: 6px; padding: 5px; cursor: pointer;
  background: #241608; color: #f2e4c4; border: 1px solid rgba(205,159,91,.5);
  border-radius: 3px; font: inherit; }
#rig-panel pre { margin: 8px 0 0; white-space: pre-wrap; font-size: 10px;
  color: #9a7338; border-top: 1px solid rgba(205,159,91,.3); padding-top: 8px; }
`
  document.head.appendChild(style)
}
