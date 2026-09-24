import { describe, expect, it } from 'vitest'
import { isLanguage, messages } from '.'
import { pt } from './pt'
import { en } from './en'
import { CHARACTERS } from '../content/characters'
import { BASS_PROP, GUITARS } from '../content/guitars'

/** Acento que só o português tem: um texto inglês com ele ficou sem tradução. */
const PORTUGUES = /[ãõçáéíóúâêôàÃÕÇÁÉÍÓÚÂÊÔÀ]/

/**
 * Todo texto de um dicionário, com o caminho de cada um.
 *
 * As frases com número são chamadas com alguns valores — o singular, o
 * plural, o zero, e um além do fim da escala de estrelas —, porque é nelas
 * que um ramo do plural esquecido em português se esconde.
 */
function textos(valor: unknown, caminho = ''): Array<[string, string]> {
  if (typeof valor === 'string') return [[caminho, valor]]
  if (typeof valor === 'function') {
    return [0, 1, 2, 7].flatMap((n) => {
      const chamar = valor as (...args: unknown[]) => unknown
      let saida: unknown
      try {
        saida = chamar(n, n, n)
      } catch {
        saida = chamar('x', 'x', 'x')
      }
      return textos(saida, `${caminho}(${n})`)
    })
  }
  if (valor && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([chave, filho]) =>
      textos(filho, caminho ? `${caminho}.${chave}` : chave),
    )
  }
  return []
}

/** O desenho do dicionário: as chaves, em qualquer profundidade. */
function chaves(valor: unknown, caminho = ''): string[] {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return [caminho]
  return Object.entries(valor).flatMap(([chave, filho]) =>
    chaves(filho, caminho ? `${caminho}.${chave}` : chave),
  )
}

describe('dicionários', () => {
  it('inglês e português têm as mesmas chaves', () => {
    // O tipo já garante; isto pega o que escapa dele, como um `Record<string, …>`.
    expect(chaves(en).sort()).toEqual(chaves(pt).sort())
  })

  it('nenhum texto em inglês ficou em português', () => {
    const esquecidos = textos(en).filter(([, texto]) => PORTUGUES.test(texto))
    expect(esquecidos).toEqual([])
  })

  it('nenhum texto ficou vazio', () => {
    for (const dicionario of [pt, en]) {
      const vazios = textos(dicionario).filter(([, texto]) => texto.trim() === '')
      expect(vazios).toEqual([])
    }
  })

  it('a marcação de código e de negrito fecha em todo texto', () => {
    for (const [caminho, texto] of [...textos(pt), ...textos(en)]) {
      expect((texto.match(/`/g) ?? []).length % 2, caminho).toBe(0)
      expect((texto.match(/\*\*/g) ?? []).length % 2, caminho).toBe(0)
    }
  })

  it('escolhe o dicionário pelo idioma', () => {
    expect(messages('en')).toBe(en)
    expect(messages('pt')).toBe(pt)
    expect(isLanguage('pt')).toBe(true)
    expect(isLanguage('es')).toBe(false)
    expect(isLanguage(undefined)).toBe(false)
  })

  it('formata números e dinheiro no costume de cada língua', () => {
    expect(pt.money(12500)).toBe('$12.500')
    expect(en.money(12500)).toBe('$12,500')
    expect(pt.results.verdict(6)).toBe('Sem um erro')
    expect(en.results.verdict(0)).toBe("Didn't make it")
  })
})

describe('conteúdo', () => {
  const descricoes = [
    ...CHARACTERS.map((c) => [c.id, c.subtitle] as const),
    ...[BASS_PROP, ...GUITARS].map((g) => [g.id, g.brandless] as const),
  ]

  it('toda descrição de personagem e guitarra tem inglês de verdade', () => {
    for (const [id, texto] of descricoes) {
      expect(texto.en, id).not.toMatch(PORTUGUES)
      expect(texto.en, id).not.toBe(texto.pt)
    }
  })
})
