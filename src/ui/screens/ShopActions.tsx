/**
 * O bloco de ação das telas de loja.
 *
 * Um item pode estar em quatro situações, e cada uma pede uma coisa
 * diferente do jogador: bloqueado por estrelas (não há o que fazer ainda),
 * à venda (comprar), comprado mas guardado (equipar), ou em uso (nada).
 * Concentrar isso num componente só evita que as telas de personagem e de
 * guitarra divirjam com o tempo.
 */

import { blockable } from '../blocked'
import { useT } from '../useT'

export interface ShopItemState {
  owned: boolean
  equipped: boolean
  /** Já atingiu as estrelas necessárias? */
  unlocked: boolean
  price: number
  unlockAtStars: number
  money: number
}

export interface ShopActionsProps extends ShopItemState {
  onBuy: () => void
  onEquip: () => void
}

export function ShopActions({
  owned,
  equipped,
  unlocked,
  price,
  unlockAtStars,
  money,
  onBuy,
  onEquip,
}: ShopActionsProps) {
  const t = useT()

  if (equipped) {
    return (
      <div className="shop-actions">
        <span className="tag tag-own">{t.shop.equipped}</span>
      </div>
    )
  }

  if (owned) {
    return (
      <div className="shop-actions">
        <button className="btn btn-primary btn-lg" onClick={onEquip}>
          {t.shop.equip}
        </button>
      </div>
    )
  }

  if (!unlocked) {
    return (
      <div className="shop-actions">
        {/* Bloqueio de estrelas é coisa que só a interface sabe — a loja
            nem chega a ser consultada. Então é aqui que a recusa soa. */}
        <button className="btn btn-lg" {...blockable(true, () => {})}>
          {t.shop.locked}
        </button>
        <span className="shop-note">{t.shop.unlockAt(unlockAtStars)}</span>
      </div>
    )
  }

  const affordable = money >= price
  return (
    <div className="shop-actions">
      {/* Sem saldo o clique passa mesmo assim: quem recusa é a loja, que é
          quem conhece o preço e o bolso — e é ela que toca a recusa. */}
      <button className="btn btn-primary btn-lg" aria-disabled={!affordable || undefined} onClick={onBuy}>
        {t.shop.buy(price)}
      </button>
      {!affordable && <span className="shop-note">{t.shop.short(price - money)}</span>}
    </div>
  )
}

/** Etiqueta curta para a linha da lista. */
export function ShopTag({ owned, equipped, unlocked, price, unlockAtStars }: ShopItemState) {
  const t = useT()
  if (equipped) return <span className="tag tag-own">{t.shop.equipped}</span>
  if (owned) return <span className="tag">{t.shop.owned}</span>
  if (!unlocked) return <span className="tag tag-locked">{unlockAtStars} ★</span>
  return <span className="tag">{t.money(price)}</span>
}
