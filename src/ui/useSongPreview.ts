/**
 * O preview da música em que o seletor parou.
 *
 * Recebe a entrada já resolvida — quem decide onde o seletor parou é a
 * lista, e as duas telas que têm lista organizam os itens de formas
 * diferentes. Aqui mora só o que as duas fazem igual: começar, calar, e
 * devolver o fundo do menu ao sair.
 *
 * `null` cala, mas só se algum preview já tiver tocado. Entrar numa tela de
 * lista não pode derrubar a música de fundo antes de existir preview para
 * pôr no lugar dela — o silêncio seria a primeira coisa que o jogador
 * ouviria ao abrir a lista.
 */

import { useEffect, useRef } from 'react'
import { mixer } from '../audio/mixer'
import { backgroundAudio, type SongEntry } from '../songs/library'

/** O trecho tocável de uma música, ou nada quando ela não tem áudio. */
export function previewOf(entry: SongEntry | undefined | null) {
  return entry ? backgroundAudio(entry, { usePreview: true }) : null
}

export function useSongPreview(entry: SongEntry | null) {
  const jaTocou = useRef(false)

  useEffect(() => {
    const audio = previewOf(entry)
    if (!entry || !audio) {
      if (jaTocou.current) mixer.playPreview(null)
      return
    }
    jaTocou.current = true
    mixer.playPreview({ id: entry.song.meta.id, ...audio })
  }, [entry])

  // Sair da tela devolve o fundo do menu. Separado do efeito acima porque
  // vale só na desmontagem: voltar à trilha por dois segundos entre um
  // preview e o seguinte soaria pior que o silêncio.
  useEffect(() => () => mixer.endPreview(), [])
}
