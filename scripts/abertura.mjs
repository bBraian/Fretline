/**
 * A abertura fica entre o carregamento da página e o menu: baixa o que o
 * jogo mostra e espera um gesto. Todo script que abre o jogo passa por ela.
 *
 * Enter, e não um clique: é o gesto mais curto que o jogo aceita, e sai no
 * `keyup` — o menu que monta depois não recebe nada.
 */
export async function passarAbertura(page, timeout = 120_000) {
  await page.getByText(/Pressione/).waitFor({ timeout })
  await page.keyboard.press('Enter')
  await page.getByText(/Pressione/).waitFor({ state: 'detached', timeout: 10_000 })
}
