/**
 * Texto do dicionário com as duas marcações que ele usa: `crase` vira
 * código e **asteriscos duplos** viram negrito.
 *
 * Existe para a frase continuar inteira no dicionário. Partir "Coloque as
 * pastas em", `<code>`, "— cada uma…" em três chaves obrigaria quem traduz
 * a manter a ordem das palavras do português, e o inglês não põe as coisas
 * no mesmo lugar.
 */

const MARCA = /(`[^`]+`|\*\*[^*]+\*\*)/

export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(MARCA).map((parte, i) => {
        if (parte.startsWith('`') && parte.endsWith('`') && parte.length > 1)
          return <code key={i}>{parte.slice(1, -1)}</code>
        if (parte.startsWith('**') && parte.endsWith('**') && parte.length > 3)
          return <b key={i}>{parte.slice(2, -2)}</b>
        return parte
      })}
    </>
  )
}
