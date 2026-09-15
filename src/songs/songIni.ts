/**
 * Leitor do `song.ini`, o arquivo de metadados que acompanha os charts.
 *
 * O `notes.mid` não carrega nome, artista nem deslocamento de áudio — tudo
 * isso vive no `.ini` ao lado. Sem ele, uma pasta importada aparece na lista
 * como "Sem nome".
 *
 * O formato é um INI simples, mas na prática os arquivos vêm com variações:
 * seção `[song]` ou `[Song]`, chaves com maiúsculas trocadas, comentários
 * com `;` ou `#`, e valores de tempo ora em milissegundos ora em segundos.
 * A leitura abaixo é deliberadamente tolerante.
 */

import type { SongMeta } from '../engine/types'

export interface SongIni {
  values: Map<string, string>
  meta: Partial<SongMeta>
  /** Dificuldade declarada da guitarra, de 0 a 6; -1 quando ausente. */
  guitarDifficulty: number
}

function normalizeKey(key: string) {
  return key.trim().toLowerCase().replace(/\s+/g, '_')
}

export function parseSongIni(text: string): SongIni {
  const values = new Map<string, string>()

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('[')) continue

    const eq = line.indexOf('=')
    if (eq < 0) continue
    values.set(normalizeKey(line.slice(0, eq)), line.slice(eq + 1).trim())
  }

  const number = (key: string) => {
    const value = Number(values.get(key))
    return Number.isFinite(value) ? value : undefined
  }

  // Os campos de tempo vêm em milissegundos no formato do Clone Hero.
  const lengthMs = number('song_length')
  const previewMs = number('preview_start_time')
  const delayMs = number('delay')

  const meta: Partial<SongMeta> = {
    name: values.get('name') || undefined,
    artist: values.get('artist') || undefined,
    album: values.get('album') || undefined,
    charter: values.get('charter') || values.get('frets') || undefined,
    year: values.get('year') || undefined,
    length: lengthMs !== undefined ? lengthMs / 1000 : undefined,
    previewStart: previewMs !== undefined ? previewMs / 1000 : undefined,
    // `delay` positivo significa áudio atrasado em relação ao chart, que é
    // exatamente o sentido do nosso `offset`.
    offset: delayMs !== undefined ? delayMs / 1000 : undefined,
  }

  for (const key of Object.keys(meta) as Array<keyof SongMeta>) {
    if (meta[key] === undefined) delete meta[key]
  }

  return {
    values,
    meta,
    guitarDifficulty: number('diff_guitar') ?? -1,
  }
}
