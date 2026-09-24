import { describe, expect, it } from 'vitest'
import { essentialModelUrls } from './essentials'
import { STAGE_MODELS, activeStageModel } from './stage/stageModel'
import { BAND } from './character/bandMember'
import { STAGE_PROPS } from './props'
import { CLIPS } from './character/animationClips'
import { CHARACTERS } from '../content/characters'
import { GUITARS } from '../content/guitars'

describe('essentialModelUrls', () => {
  const urls = essentialModelUrls()

  it('tem o palco ativo, a banda, as props e as animações', () => {
    const esperadas = [
      activeStageModel()!.url,
      ...Object.values(BAND),
      ...Object.values(STAGE_PROPS),
      ...Object.values(CLIPS),
    ]
    for (const url of esperadas) expect(urls).toContain(url)
  })

  it('tem todo personagem e toda guitarra com modelo', () => {
    const comModelo = [...CHARACTERS, ...GUITARS].flatMap((item) => (item.model ? [item.model] : []))
    expect(comModelo.length).toBeGreaterThan(0)
    for (const url of comModelo) expect(urls).toContain(url)
  })

  it('não tem cenário que o jogo não usa', () => {
    const ativo = activeStageModel()!.url
    for (const cenario of STAGE_MODELS) {
      if (cenario.url !== ativo) expect(urls).not.toContain(cenario.url)
    }
  })

  it('não repete URL', () => {
    expect(new Set(urls).size).toBe(urls.length)
  })
})
