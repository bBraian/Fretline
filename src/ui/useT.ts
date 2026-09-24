/**
 * O dicionário do idioma escolhido.
 *
 * Toda tela lê o texto por aqui, e é isto que faz a troca de idioma valer
 * na hora: o seletor grava `settings.language`, e cada tela que leu por este
 * gancho desenha de novo na outra língua. Ver `i18n/`.
 */

import { useGame } from './store'
import { messages, type Messages } from '../i18n'

export function useT(): Messages {
  return messages(useGame((s) => s.settings.language))
}
