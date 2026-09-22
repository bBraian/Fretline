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

import { DIFFICULTIES } from '../../engine/types'
import { mixer } from '../../audio/mixer'
import { useGame } from '../store'
import { difficultyName } from './MenuScreen'

export function DifficultyPicker() {
  const difficulty = useGame((s) => s.settings.difficulty)
  const updateSettings = useGame((s) => s.updateSettings)

  return (
    <div className="segmented" aria-label="Dificuldade">
      {DIFFICULTIES.map((d) => (
        <button
          key={d}
          data-active={difficulty === d}
          onClick={() => {
            if (d !== difficulty) mixer.play('move')
            updateSettings({ difficulty: d })
          }}
        >
          {difficultyName(d)}
        </button>
      ))}
    </div>
  )
}
