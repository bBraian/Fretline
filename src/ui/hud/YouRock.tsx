/**
 * O letreiro da vitória: "You rock!", como no fim de uma música do GH3.
 *
 * Antes o encerramento era só o véu escurecendo — a banda tocava o fim, a
 * tela apagava e os resultados entravam. Correto, mas mudo: terminar uma
 * música é o momento mais raro da partida, e o jogo não dizia nada sobre
 * ele além do som.
 *
 * Entra por cima do véu, então fica mais legível à medida que o palco
 * apaga. As letras batem uma a uma no ritmo do grito do `you_rockR.wav`,
 * que ataca logo no começo — por isso a entrada inteira cabe em menos de um
 * segundo. A saída conta do fim do encerramento, que chega por `seconds`
 * para o letreiro e a troca de tela nunca discordarem.
 *
 * Só aparece para quem terminou a música. Quem falhou também passa pelo
 * encerramento, pelo botão "ver o resultado", e ali ninguém venceu.
 */

import type { CSSProperties } from 'react'

const WORDS = ['You', 'Rock!']

/** Cada letra com o seu lugar na frase inteira, que é o que escalona a entrada. */
const LETTERS = WORDS.map((word, w) => {
  const before = WORDS.slice(0, w).join('').length
  return [...word].map((char, i) => ({ char, index: before + i }))
})

export function YouRock({ seconds }: { seconds: number }) {
  return (
    <div className="you-rock" style={{ '--outro': `${seconds}s` } as CSSProperties}>
      <div className="you-rock-rays" aria-hidden="true" />
      <div className="you-rock-flash" aria-hidden="true" />
      <p className="you-rock-text" role="status" aria-label="You rock!">
        {LETTERS.map((letters, w) => (
          <span className="you-rock-word" key={WORDS[w]} aria-hidden="true">
            {letters.map(({ char, index }) => (
              <span
                className="you-rock-letter"
                data-char={char}
                key={index}
                style={{ '--i': index } as CSSProperties}
              >
                {char}
              </span>
            ))}
          </span>
        ))}
      </p>
    </div>
  )
}
