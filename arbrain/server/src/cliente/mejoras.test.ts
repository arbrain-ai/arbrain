import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { accionMejoras, guardarMejoras, leerMejoras, mejoraActiva, MEJORAS } from './mejoras.js'
import { MEJORAS_DE_FABRICA } from './mejoras-lista.js'

describe('Ajustes › Mejoras en el daemon', () => {
  let dir = ''
  let archivo = ''
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'mejoras-')); archivo = path.join(dir, 'sub', 'mejoras.json') })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('sin archivo, todo como de fábrica', () => {
    expect(leerMejoras(archivo)).toEqual({ mejoras: MEJORAS_DE_FABRICA, existe: false })
    for (const id of MEJORAS) expect(mejoraActiva(id, archivo)).toBe(MEJORAS_DE_FABRICA[id])
  })

  it('prender y apagar cada una queda guardado', () => {
    for (const id of MEJORAS) {
      guardarMejoras({ [id]: true }, archivo)
      expect(mejoraActiva(id, archivo)).toBe(true)
      guardarMejoras({ [id]: false }, archivo)
      expect(mejoraActiva(id, archivo)).toBe(false)
    }
  })

  it('ignora ids desconocidos y archivos rotos', () => {
    expect(accionMejoras({ accion: 'guardar', mejoras: { inventada: true } }, archivo)).toMatchObject({ status: 400 })
    guardarMejoras({ 'mic-con-turno': true }, archivo)
    writeFileSync(archivo, '{roto')
    expect(leerMejoras(archivo).mejoras).toEqual(MEJORAS_DE_FABRICA)
  })
})
