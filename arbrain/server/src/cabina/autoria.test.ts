// Contrato de autoría (27 oct 2026): cada commit de un subagente lleva «Subagente: <nombre del encargo>».
import { describe, expect, it } from 'vitest'
import { notaAutoria, trailerAutoria, valorAutoria } from './autoria.js'

describe('autoría de los subagentes', () => {
  it('el trailer es una sola línea «Subagente: nombre», recortada', () => {
    expect(trailerAutoria('hn-competencia')).toBe('Subagente: hn-competencia')
    expect(valorAutoria('  Noche del harness:\nGit visible  ')).toBe('Noche del harness: Git visible')
    expect(valorAutoria(': raro')).toBe('raro')
    expect(valorAutoria('x'.repeat(200))).toHaveLength(80)
    expect(valorAutoria('\n')).toBe('sin nombre')
  })
  it('la nota del encargo pide el trailer junto a los demás', () => {
    const n = notaAutoria('capturas del panel')
    expect(n).toContain('Subagente: capturas del panel')
    expect(n).toMatch(/Co-Authored-By/)
    expect(n.split('\n').filter(Boolean)).toHaveLength(1)
  })
})
