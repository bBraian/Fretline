/**
 * Idiomas da interface.
 *
 * Um dicionário por idioma, cada um um objeto de TypeScript simples: o
 * português define o formato (`Messages`), e o inglês precisa cumpri-lo por
 * inteiro — faltar uma chave é erro de compilação, não um texto que some na
 * tela. Frases com número são funções, porque o plural e a ordem das
 * palavras mudam de uma língua para a outra.
 *
 * Fica fora de `ui/` porque o conteúdo também fala: a descrição de um
 * personagem ou de uma guitarra é um `Localized`, escrito ao lado do resto
 * da entrada. Quem escolhe o idioma é a interface (`settings.language`); o
 * que mora aqui não sabe qual está valendo.
 *
 * Nomes próprios — de personagem, de guitarra, de tier, de música — não são
 * traduzidos: são nomes, não frases.
 */

import { pt, type Messages } from './pt'
import { en } from './en'

export type { Messages }

export type Language = 'en' | 'pt'

export const LANGUAGES: readonly Language[] = ['en', 'pt']

/** Um texto em todos os idiomas, para o conteúdo que a interface mostra. */
export type Localized = Record<Language, string>

const MESSAGES: Record<Language, Messages> = { en, pt }

export function messages(language: Language): Messages {
  return MESSAGES[language]
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}
