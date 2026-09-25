/**
 * Reconhecer um controle de guitarra, para exigir palhetada só nele.
 *
 * O navegador não diz o tipo do controle. Sobram duas pistas, e nenhuma
 * pega todos os casos:
 *
 * - o **nome**, que traz o modelo nas guitarras de PS3, de Wii e nas de
 *   Xbox 360 fora do Windows — e o fabricante, no Chrome e no Firefox;
 * - a **alavanca**. No Windows, a guitarra de Xbox 360 passa pelo XInput e
 *   chega com o nome de um controle de Xbox comum. O que a entrega é o eixo
 *   da alavanca, que descansa no fim do curso (ver `whammyFromAxis`),
 *   enquanto o analógico de um controle comum descansa no meio.
 *
 * Quando nenhuma das duas pega, o ajuste tem "em qualquer controle".
 */

/** Quando a palhetada é exigida; é o ajuste `strum` do jogador. */
export type StrumMode = 'guitar' | 'always' | 'off'

export const STRUM_MODES: StrumMode[] = ['guitar', 'always', 'off']

/** O que o reconhecimento lê de um `Gamepad`. */
export interface PadLook {
  id: string
  mapping: string
  axes: readonly number[]
}

/**
 * Modelos e fabricantes. A RedOctane (`1430`) fez as guitarras do Guitar
 * Hero; o número aparece como `Vendor: 1430` no Chrome e `1430-` no começo
 * do nome no Firefox.
 */
const GUITAR_NAME = /guitar|gitarre|x-?plorer|les ?paul|redoctane|harmonix|rock ?band|santroller|vendor: ?1430\b|^1430-/i

/**
 * Longe o bastante do meio para não ser um analógico em repouso. Um
 * analógico empurrado até o fim também chega aqui, mas só enquanto alguém o
 * segura — e o reconhecimento acontece no começo da música.
 */
const AXIS_AT_END = 0.9

export function looksLikeGuitar(pad: PadLook, whammyAxis: number): boolean {
  if (GUITAR_NAME.test(pad.id)) return true
  // Fora do layout padrão os eixos não têm papel fixo: gatilho vira eixo, e
  // gatilho solto descansa em -1, exatamente como uma alavanca.
  if (pad.mapping !== 'standard' || whammyAxis < 0) return false
  return Math.abs(pad.axes[whammyAxis] ?? 0) >= AXIS_AT_END
}

/**
 * A partida exige palhetada?
 *
 * Sem controle, nunca: o teclado não tem barra de strum.
 */
export function strumRequired(mode: StrumMode, pad: PadLook | null, whammyAxis: number): boolean {
  if (!pad || mode === 'off') return false
  return mode === 'always' || looksLikeGuitar(pad, whammyAxis)
}
