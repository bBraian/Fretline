/**
 * O bloco de ação das telas de loja.
 *
 * Um item pode estar em quatro situações, e cada uma pede uma coisa
 * diferente do jogador: bloqueado por estrelas (não há o que fazer ainda),
 * à venda (comprar), comprado mas guardado (equipar), ou em uso (nada).
 * Concentrar isso num componente só evita que as telas de personagem e de
 * guitarra divirjam com o tempo.
 */

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
  if (equipped) {
    return (
      <div className="shop-actions">
        <span className="tag tag-own">Em uso</span>
      </div>
    )
  }

  if (owned) {
    return (
      <div className="shop-actions">
        <button className="btn btn-primary btn-lg" onClick={onEquip}>
          Equipar
        </button>
      </div>
    )
  }

  if (!unlocked) {
    return (
      <div className="shop-actions">
        <button className="btn btn-lg" disabled>
          Bloqueado
        </button>
        <span className="shop-note">Abre com {unlockAtStars} estrelas na carreira.</span>
      </div>
    )
  }

  const affordable = money >= price
  return (
    <div className="shop-actions">
      <button className="btn btn-primary btn-lg" disabled={!affordable} onClick={onBuy}>
        Comprar por ${price.toLocaleString('pt-BR')}
      </button>
      {!affordable && (
        <span className="shop-note">
          Faltam ${(price - money).toLocaleString('pt-BR')}.
        </span>
      )}
    </div>
  )
}

/** Etiqueta curta para a linha da lista. */
export function ShopTag({ owned, equipped, unlocked, price, unlockAtStars }: ShopItemState) {
  if (equipped) return <span className="tag tag-own">Em uso</span>
  if (owned) return <span className="tag">Sua</span>
  if (!unlocked) return <span className="tag tag-locked">{unlockAtStars} ★</span>
  return <span className="tag">${price.toLocaleString('pt-BR')}</span>
}
