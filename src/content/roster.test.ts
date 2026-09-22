/**
 * O elenco e a vitrine de guitarras como progressão.
 *
 * Estes números não são detalhe de conteúdo: o perfil inicial é *derivado*
 * deles. `DEFAULT_PROFILE`, em `ui/store.ts`, dá de graça tudo que custa
 * zero e equipa o primeiro da lista — então "o jogo começa com o Douglas e
 * a Stratos" é, na prática, "o primeiro da lista custa zero". Um preço
 * trocado por engano tira do jogador o personagem com que ele deveria
 * começar, e o sintoma aparece longe daqui.
 */

import { describe, expect, it } from 'vitest'
import { CHARACTERS, SHOP_CHARACTERS } from './characters'
import { GUITARS } from './guitars'

describe('vitrine de personagens', () => {
  it('começa no Douglas, de graça e sem exigir estrelas', () => {
    const primeiro = SHOP_CHARACTERS[0]
    expect(primeiro.name).toBe('Douglas')
    expect(primeiro.price).toBe(0)
    expect(primeiro.unlockAtStars).toBe(0)
  })

  it('só o primeiro sai de graça — senão o começo viria com meia vitrine', () => {
    const gratuitos = SHOP_CHARACTERS.filter((c) => c.price === 0)
    expect(gratuitos.map((c) => c.name)).toEqual(['Douglas'])
  })

  it('não tem mais a Stella', () => {
    expect(CHARACTERS.some((c) => c.name.startsWith('Stella'))).toBe(false)
  })

  it('sobe de preço e de exigência na ordem da lista', () => {
    for (let i = 1; i < SHOP_CHARACTERS.length; i++) {
      const anterior = SHOP_CHARACTERS[i - 1]
      const atual = SHOP_CHARACTERS[i]
      expect(atual.price).toBeGreaterThan(anterior.price)
      expect(atual.unlockAtStars).toBeGreaterThan(anterior.unlockAtStars)
    }
  })

  it('está na ordem combinada, do primeiro ao mais raro', () => {
    expect(SHOP_CHARACTERS.map((c) => c.name)).toEqual([
      'Douglas',
      'Estevão Rodrigues',
      'Dartes Vale',
      'Vermelhão',
      'Kairos',
      'Lara Cruz',
      'Teixeira',
      'Soldado Bené',
      'Gokê Ramos',
    ])
  })
})

describe('vitrine de guitarras', () => {
  it('começa na Stratos, de graça e sem exigir estrelas', () => {
    expect(GUITARS[0].name).toBe('Stratos')
    expect(GUITARS[0].price).toBe(0)
    expect(GUITARS[0].unlockAtStars).toBe(0)
  })

  it('só a primeira sai de graça', () => {
    expect(GUITARS.filter((g) => g.price === 0).map((g) => g.name)).toEqual(['Stratos'])
  })

  it('sobe de preço e de exigência na ordem da lista', () => {
    for (let i = 1; i < GUITARS.length; i++) {
      expect(GUITARS[i].price).toBeGreaterThan(GUITARS[i - 1].price)
      expect(GUITARS[i].unlockAtStars).toBeGreaterThan(GUITARS[i - 1].unlockAtStars)
    }
  })
})
