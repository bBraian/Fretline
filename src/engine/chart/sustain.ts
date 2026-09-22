/**
 * Quando um comprimento de nota é sustain, e quando é só a célula da grade.
 *
 * Todo formato de chart guarda a nota como um par de eventos, começo e fim,
 * e não distingue "segure isto" de "esta nota ocupa uma semicolcheia". Quem
 * distingue é um limiar, e ele é parte do formato — não uma preferência.
 *
 * O limiar é o do Clone Hero: **um doze avos de nota inteira**, ou seja a
 * colcheia de tercina, `division / 3` em ticks. Abaixo disso o comprimento é
 * notação, acima é intenção de segurar.
 *
 * O valor importa mais do que parece. Um `notes.mid` de Rock Band escreve as
 * gems exatamente na grade — a nota comum mede uma semicolcheia cravada,
 * `division / 4`. Com o limiar posto nesse mesmo valor, a comparação
 * inclusiva classificava a grade inteira como sustain: em "When I Come
 * Around" eram 764 notas de 827, cada uma com um rastro desenhado na pista e
 * um sustain impossível de segurar, porque no expert a nota seguinte chega
 * antes do rastro acabar. Com `division / 3` sobram as 59 que o charter de
 * fato quis longas.
 */

/** Ticks mínimos para um comprimento contar como sustain. */
export function sustainThreshold(division: number): number {
  return division / 3
}
