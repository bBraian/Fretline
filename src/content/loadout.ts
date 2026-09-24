/**
 * O que o jogador tem e o que está usando, conferido contra o elenco atual.
 *
 * O save é uma fotografia do elenco do dia em que foi gravado, e o elenco
 * muda: o padrão já foi `CHARACTERS[0]`, que hoje é marionete de reserva e
 * não aparece na loja; a Stella saiu; o Douglas entrou de graça depois de
 * muita gente já ter perfil. Mesclar o save por cima dos padrões preserva
 * tudo isso — e o sintoma era o Douglas sem "Em uso", à venda por $0, com
 * o palco mostrando alguém que a loja nem lista.
 */

import { SHOP_CHARACTERS } from './characters'
import { GUITARS } from './guitars'

export interface Loadout {
  ownedCharacters: string[]
  ownedGuitars: string[]
  characterId: string
  guitarId: string
}

/** Curinga de desenvolvimento: `['*']` significa tudo liberado. */
export function owns(list: string[], id: string) {
  return list.includes('*') || list.includes(id)
}

// Só quem a loja mostra: as marionetes de reserva também custam zero, mas
// não aparecem em lugar nenhum.
const FREE_CHARACTERS = SHOP_CHARACTERS.filter((c) => c.price === 0).map((c) => c.id)
const FREE_GUITARS = GUITARS.filter((g) => g.price === 0).map((g) => g.id)

/** Junta sem repetir, na ordem de quem já estava. */
function union(saved: string[], extra: string[]) {
  return [...saved, ...extra.filter((id) => !saved.includes(id))]
}

/**
 * Corrige o perfil lido do save.
 *
 * O que é de graça passa a ser do jogador, e o equipado precisa ser algo
 * que a loja mostra e que ele tem — senão volta para o primeiro da vitrine,
 * que é com quem o jogo começa. Uma escolha válida não é tocada.
 */
export function reconcileLoadout<T extends Loadout>(profile: T): T {
  const ownedCharacters = union(profile.ownedCharacters, FREE_CHARACTERS)
  const ownedGuitars = union(profile.ownedGuitars, FREE_GUITARS)

  const characterOk =
    SHOP_CHARACTERS.some((c) => c.id === profile.characterId) &&
    owns(ownedCharacters, profile.characterId)
  const guitarOk =
    GUITARS.some((g) => g.id === profile.guitarId) && owns(ownedGuitars, profile.guitarId)

  return {
    ...profile,
    ownedCharacters,
    ownedGuitars,
    characterId: characterOk ? profile.characterId : SHOP_CHARACTERS[0].id,
    guitarId: guitarOk ? profile.guitarId : GUITARS[0].id,
  }
}
