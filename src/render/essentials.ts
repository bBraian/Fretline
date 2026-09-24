/**
 * O que a abertura baixa, e como.
 *
 * As URLs saem dos módulos que já as declaram — nenhuma lista paralela
 * para dessincronizar. Ficam de fora os cenários que o jogo não usa: eles
 * só entram com `?stage=`, e são 55 MB.
 *
 * Baixar aqui não é carregar: os bytes vão para o cache HTTP do navegador
 * e são descartados. Quem monta o modelo depois é o `GLTFLoader` de
 * sempre, que acha o arquivo local. O `FileLoader` é o do three, com o
 * gerente padrão, para herdar a reescrita de URL de `assetBase.ts`.
 */

import { DefaultLoadingManager, FileLoader } from 'three'
import { retry } from '../net/retry'
import { activeStageModel } from './stage/stageModel'
import { BAND } from './character/bandMember'
import { STAGE_PROPS } from './props'
import { CLIPS } from './character/animationClips'
import { CHARACTERS } from '../content/characters'
import { GUITARS } from '../content/guitars'

export function essentialModelUrls(): string[] {
  const urls = [
    activeStageModel()?.url,
    ...Object.values(BAND),
    ...Object.values(STAGE_PROPS),
    ...Object.values(CLIPS),
    ...CHARACTERS.map((character) => character.model),
    ...GUITARS.map((guitar) => guitar.model),
  ]
  return [...new Set(urls.filter((url): url is string => Boolean(url)))]
}

const loader = new FileLoader(DefaultLoadingManager)
loader.setResponseType('arraybuffer')

type ModelProgress = { state: 'receiving' | 'done'; loaded: number; total?: number }

function baixarUmaVez(url: string, onProgress: (p: ModelProgress) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (data) => resolve((data as ArrayBuffer).byteLength),
      (event) =>
        onProgress({
          state: 'receiving',
          loaded: event.loaded,
          total: event.lengthComputable ? event.total : undefined,
        }),
      reject,
    )
  })
}

/** Baixa um modelo para o cache. `false` quando desistiu — ele vem sob demanda depois. */
export async function downloadModel(
  url: string,
  onProgress: (p: ModelProgress) => void,
): Promise<boolean> {
  try {
    const bytes = await retry(() => baixarUmaVez(url, onProgress))
    onProgress({ state: 'done', loaded: bytes, total: bytes })
    return true
  } catch (error) {
    console.warn(`A abertura não trouxe ${url}; ele carrega quando precisar.`, error)
    return false
  }
}
