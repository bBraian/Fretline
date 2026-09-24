import { describe, expect, it } from 'vitest'
import { CHARACTERS, SHOP_CHARACTERS } from './characters'
import { GUITARS } from './guitars'
import { reconcileLoadout } from './loadout'

const douglas = SHOP_CHARACTERS[0].id
const marionete = CHARACTERS.find((c) => c.hidden)!.id
const segundo = SHOP_CHARACTERS[1].id

function loadout(parcial: Partial<Parameters<typeof reconcileLoadout>[0]> = {}) {
  return {
    ownedCharacters: [douglas],
    ownedGuitars: [GUITARS[0].id],
    characterId: douglas,
    guitarId: GUITARS[0].id,
    ...parcial,
  }
}

describe('reconcileLoadout', () => {
  it('um save da época em que o padrão era uma marionete volta para o Douglas', () => {
    // O padrão já foi `CHARACTERS[0]`, que hoje é marionete de reserva e
    // não aparece na loja: nenhuma linha mostrava "Em uso".
    const salvo = loadout({ ownedCharacters: [marionete], characterId: marionete })
    const perfil = reconcileLoadout(salvo)
    expect(perfil.characterId).toBe(douglas)
    expect(perfil.ownedCharacters).toContain(douglas)
  })

  it('personagem que saiu do jogo também volta para o Douglas', () => {
    const perfil = reconcileLoadout(loadout({ characterId: 'stella' }))
    expect(perfil.characterId).toBe(douglas)
  })

  it('quem é de graça passa a ser seu, mesmo tendo entrado depois do save', () => {
    const perfil = reconcileLoadout(loadout({ ownedCharacters: [], ownedGuitars: [] }))
    expect(perfil.ownedCharacters).toContain(douglas)
    expect(perfil.ownedGuitars).toContain(GUITARS[0].id)
  })

  it('não mexe em escolha válida nem tira o que foi comprado', () => {
    const salvo = loadout({
      ownedCharacters: [douglas, segundo],
      characterId: segundo,
      ownedGuitars: [GUITARS[0].id, GUITARS[3].id],
      guitarId: GUITARS[3].id,
    })
    expect(reconcileLoadout(salvo)).toEqual(salvo)
  })

  it('equipado sem ser seu não fica equipado', () => {
    const perfil = reconcileLoadout(loadout({ characterId: segundo, guitarId: GUITARS[3].id }))
    expect(perfil.characterId).toBe(douglas)
    expect(perfil.guitarId).toBe(GUITARS[0].id)
  })

  it('guitarra que não existe mais volta para a primeira', () => {
    const perfil = reconcileLoadout(loadout({ guitarId: 'thunderbird-v' }))
    expect(perfil.guitarId).toBe(GUITARS[0].id)
  })

  it('respeita o curinga de desenvolvimento', () => {
    const salvo = loadout({ ownedCharacters: ['*'], characterId: segundo })
    const perfil = reconcileLoadout(salvo)
    expect(perfil.characterId).toBe(segundo)
    expect(perfil.ownedCharacters).toContain('*')
  })

  it('preserva os outros campos do perfil', () => {
    const perfil = reconcileLoadout({ ...loadout(), money: 1200 })
    expect(perfil.money).toBe(1200)
  })
})
