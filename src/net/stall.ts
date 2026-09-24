/**
 * O vigia de pedido pendurado.
 *
 * Uma conexão que para sem erro nunca rejeita: sem vigia, a nova tentativa
 * nunca dispara e quem espera fica esperando para sempre — a abertura em
 * "Conectando…", o Afinando numa barra parada. O vigia aborta quando passa
 * tempo demais sem sinal de vida, com `TimeoutError`, que `isTransient`
 * trata como coisa que vale tentar de novo.
 *
 * Mede inatividade, não duração: um download grande numa conexão lenta
 * leva o tempo que precisar, desde que continue chegando.
 */

export const STALL_MS = 20_000

export interface StallWatch {
  signal: AbortSignal
  /** Chegou alguma coisa: o prazo recomeça. */
  touch: () => void
  /** Terminou: o vigia não aborta mais. */
  stop: () => void
}

export function watchStall(ms = STALL_MS): StallWatch {
  const controller = new AbortController()
  let timer = setTimeout(disparar, ms)

  function disparar() {
    controller.abort(new DOMException(`nada chegou em ${ms / 1000} s`, 'TimeoutError'))
  }

  return {
    signal: controller.signal,
    touch() {
      if (controller.signal.aborted) return
      clearTimeout(timer)
      timer = setTimeout(disparar, ms)
    },
    stop() {
      clearTimeout(timer)
    },
  }
}
