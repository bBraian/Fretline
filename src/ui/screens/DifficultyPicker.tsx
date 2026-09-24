/**
 * O seletor de dificuldade do cabeçalho.
 *
 * Mora aqui, e não numa tela, porque duas telas escolhem música — a
 * biblioteca e a carreira — e escolher a dificuldade faz parte de escolher
 * o que tocar. Quando existia só na biblioteca, entrar na carreira pelo
 * menu significava tocar no que estivesse escolhido da última vez, sem
 * lugar nenhum para mudar.
 *
 * O ajuste é global e gravado: é o mesmo que a tela de ajustes escreve.
 */

import { useCallback } from 'react'
import { DIFFICULTIES } from '../../engine/types'
import { mixer } from '../../audio/mixer'
import { useGame } from '../store'
import { useT } from '../useT'

export function DifficultyPicker() {
  const difficulty = useGame((s) => s.settings.difficulty)
  const updateSettings = useGame((s) => s.updateSettings)
  const t = useT()

  return (
    <div className="segmented" aria-label={t.settings.difficulty}>
      {DIFFICULTIES.map((d) => (
        <button
          key={d}
          data-active={difficulty === d}
          onClick={() => {
            if (d !== difficulty) mixer.play('move')
            updateSettings({ difficulty: d })
          }}
        >
          {t.difficulty[d]}
        </button>
      ))}
    </div>
  )
}

/**
 * Anda a dificuldade um passo, para o lado pedido.
 *
 * É o seletor acima, pelas setas laterais das listas de música — o único
 * jeito de chegar nele de controle na mão. Para nos extremos, sem dar a
 * volta: do Expert para o Fácil num toque é um susto, não um atalho.
 */
export function useStepDifficulty() {
  const difficulty = useGame((s) => s.settings.difficulty)
  const updateSettings = useGame((s) => s.updateSettings)

  return useCallback(
    (delta: 1 | -1) => {
      const i = DIFFICULTIES.indexOf(difficulty)
      const next = DIFFICULTIES[Math.min(DIFFICULTIES.length - 1, Math.max(0, i + delta))]
      if (next === difficulty) return
      mixer.play('move')
      updateSettings({ difficulty: next })
    },
    [difficulty, updateSettings],
  )
}
