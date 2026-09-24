/**
 * A abertura fica entre o carregamento da página e o menu: baixa o que o
 * jogo mostra e espera um gesto. Todo script que abre o jogo passa por ela.
 *
 * Enter, e não um clique: é o gesto mais curto que o jogo aceita, e sai no
 * `keyup` — o menu que monta depois não recebe nada.
 *
 * Os scripts acham os botões pelo texto em português, e o jogo abre em
 * inglês: o endereço de todo script leva `lang=pt`. Sem ele a abertura diz
 * "Press any key", e em vez de esperar dois minutos por um "Pressione" que
 * não vem, isto falha na hora dizendo por quê.
 */
export async function passarAbertura(page, timeout = 120_000) {
  const aviso = page.getByText(/Pressione|Press any key/)
  await aviso.waitFor({ timeout })
  if (/Press any key/.test(await aviso.innerText())) {
    throw new Error('O jogo abriu em inglês: falta `lang=pt` no endereço do script.')
  }
  await page.keyboard.press('Enter')
  await page.getByText(/Pressione/).waitFor({ state: 'detached', timeout: 10_000 })
}
