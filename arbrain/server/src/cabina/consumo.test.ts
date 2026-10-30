import { describe, expect, it } from 'vitest'
import { ventanaDe } from './cuerpo.js'

// 2 oct 2026: la ficha del Taller dice «19 % de 1M» solo cuando la ventana sale de la misma regla del %.
describe('cabina · ventana de contexto', () => {
  it('Claude: la ventana de la tabla del lector; sin % no hay ventana; otro harness no la inventa', () => {
    expect(ventanaDe('claude-sonnet-5-5', 19)).toBe(1_000_000)
    expect(ventanaDe('claude-haiku-4-5-20251001', 40)).toBe(200_000)
    expect(ventanaDe('claude-opus-5-5', undefined)).toBeNull()
    expect(ventanaDe('gpt-5.5-codex', 30)).toBeNull()
  })
})

describe('motor · tokens de Claude sobre el archivo completo', () => {
  it('suma todo el archivo, sin repetir mensajes, y luego solo lo agregado', async () => {
    const { mkdtempSync, writeFileSync, appendFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const { tokensClaudeCompletos } = await import('../motor/lector.js')
    const f = join(mkdtempSync(join(tmpdir(), 'tok-')), 's.jsonl')
    const linea = (id: string, i: number) => JSON.stringify({ message: { id, usage: { input_tokens: i, cache_creation_input_tokens: 10, output_tokens: 5 } } }) + '\n'
    writeFileSync(f, linea('a', 100) + linea('a', 100) + 'x'.repeat(900_000) + '\n' + linea('b', 1))
    expect(await tokensClaudeCompletos(f)).toBe(115 + 16)
    appendFileSync(f, linea('c', 4))
    expect(await tokensClaudeCompletos(f)).toBe(115 + 16 + 19)
  })
})
