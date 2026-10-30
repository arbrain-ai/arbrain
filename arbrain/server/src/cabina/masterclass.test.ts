import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { masterclass, RUTA_MASTERCLASS } from './masterclass.js'
import { REPO } from './documento.js'

describe('masterclass: lectura del repo del Studio', () => {
  it('entrega el JSON tal cual con su mtime', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'mc-'))
    mkdirSync(dirname(join(repo, RUTA_MASTERCLASS)), { recursive: true })
    writeFileSync(join(repo, RUTA_MASTERCLASS), JSON.stringify({ evento: { titulo: 'X' }, bloques: [] }))
    const r = await masterclass(repo)
    expect(r.error).toBeUndefined()
    expect(r.datos).toEqual({ evento: { titulo: 'X' }, bloques: [] })
    expect(r.mtime).toMatch(/^\d{4}-/)
  })

  it('un JSON roto o un archivo que no existe dicen el error, sin datos', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'mc-'))
    expect((await masterclass(repo)).error).toContain('No encuentro')
    mkdirSync(dirname(join(repo, RUTA_MASTERCLASS)), { recursive: true })
    writeFileSync(join(repo, RUTA_MASTERCLASS), '{ "evento": ')
    const r = await masterclass(repo)
    expect(r.datos).toBeUndefined()
    expect(r.error).toContain('no es JSON válido')
  })

  // Solo en el repo de Daniel: la copia del alumno no trae los documentos de su lanzamiento.
  it.skipIf(!existsSync(join(REPO, RUTA_MASTERCLASS)))('el archivo real del repo se lee y trae los 10 bloques', async () => {
    const r = await masterclass(REPO)
    expect(r.error).toBeUndefined()
    expect((r.datos as { bloques: unknown[] }).bloques.length).toBeGreaterThan(0)
  })
})
