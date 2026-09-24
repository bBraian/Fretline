/**
 * Os downloads da abertura, uma vez por página.
 *
 * Fica fora do componente porque o `StrictMode` monta a tela duas vezes em
 * desenvolvimento, e a abertura não pode pedir 35 MB em dobro. A tela lê o
 * estado a cada 120 ms, como o Afinando lê o dele.
 */

import { mixer } from '../audio/mixer'
import { keepProgress } from '../audio/download'
import { downloadModel, essentialModelUrls } from '../render/essentials'
import type { DownloadItem } from './downloadProgress'
import type { BootState } from './bootView'

let estado: BootState = {
  itens: [],
  biblioteca: { done: 0, total: null, pronta: false, carregadas: null },
  falhas: 0,
}
let comecou = false

export function getBootState(): BootState {
  return estado
}

function publicar(patch: Partial<BootState>) {
  estado = { ...estado, ...patch }
}

/**
 * `refreshLibrary` lê a biblioteca relatando pastas lidas contra o total, e
 * devolve quantas músicas de fato entraram.
 */
export function startBoot(
  refreshLibrary: (onProgress: (done: number, total: number) => void) => Promise<number>,
) {
  if (comecou) return
  comecou = true

  // Todos os pedidos saem juntos: o host fala HTTP/2, e a barra só vira
  // bytes quando cada resposta tiver dito o próprio tamanho.
  const modelos = essentialModelUrls()
  const itensModelos: DownloadItem[] = modelos.map(() => ({ state: 'waiting', loaded: 0 }))
  let itensEfeitos: DownloadItem[] = []
  const relatarItens = () => publicar({ itens: [...itensModelos, ...itensEfeitos] })
  relatarItens()

  modelos.forEach((url, index) => {
    void downloadModel(url, (progresso) => {
      // Uma nova tentativa recomeça do zero; a barra não volta com ela.
      itensModelos[index] = keepProgress(itensModelos[index], progresso)
      relatarItens()
    }).then((chegou) => {
      itensModelos[index] = { ...itensModelos[index], state: 'done' }
      if (!chegou) publicar({ falhas: estado.falhas + 1 })
      relatarItens()
    })
  })

  void mixer
    .warm((itens) => {
      itensEfeitos = itens
      relatarItens()
    })
    .then((naoVieram) => {
      if (naoVieram > 0) publicar({ falhas: estado.falhas + naoVieram })
    })

  void refreshLibrary((done, total) =>
    publicar({ biblioteca: { ...estado.biblioteca, done, total } }),
  )
    .catch(() => 0)
    .then((carregadas) => publicar({ biblioteca: { ...estado.biblioteca, pronta: true, carregadas } }))
}
