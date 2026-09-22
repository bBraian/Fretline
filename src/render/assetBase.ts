/**
 * De onde vêm os modelos.
 *
 * Rodando na própria máquina eles saem de `public/models/`, e os caminhos
 * `/models/...` espalhados pelo conteúdo funcionam direto. Na versão
 * hospedada não: são vinte e poucos megabytes de binário que ficam fora do
 * versionamento e fora do deploy, num storage à parte.
 *
 * Reescrever os caminhos em cada arquivo que os declara seria mexer em seis
 * lugares para resolver um problema que é de endereço, não de conteúdo. O
 * `LoadingManager` do three tem o gancho exato para isso: toda URL que
 * qualquer loader vai buscar passa por `setURLModifier` antes. Os loaders
 * do projeto são criados sem gerente próprio, então usam o padrão — e um
 * gancho só cobre modelos de personagem, de guitarra, de banda, de cenário
 * e os clipes de animação.
 *
 * Sem `VITE_ASSETS_BASE`, nada é instalado e tudo continua como era.
 */

import { DefaultLoadingManager } from 'three'

export function installAssetBase() {
  const base = import.meta.env.VITE_ASSETS_BASE?.replace(/\/$/, '')
  if (!base) return

  DefaultLoadingManager.setURLModifier((url) =>
    // Só os modelos: o gerente padrão vê toda URL que o three carrega, e
    // reescrever outra coisa por engano seria difícil de enxergar depois.
    url.startsWith('/models/') ? base + url : url,
  )
}
