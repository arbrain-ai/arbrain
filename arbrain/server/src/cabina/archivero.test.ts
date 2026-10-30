import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { accionArchivero, buscar, guardar, leer, marcarAbierta, pedirAbrir, sacar, sinAbrir } from './archivero.js'
import { ejecutarCabina } from './tools.js'

describe('archivero del panel', () => {
  let dir: string, archivo: string, repo: string
  beforeEach(() => {
    dir = mkdtempSync(path.join('/tmp', 'archivero-'))
    archivo = path.join(dir, 'archivero.json')
    repo = mkdtempSync(path.join(tmpdir(), 'repo-'))
    process.env.ARBRAIN_ARCHIVERO = archivo
    // Aislado del panel real: con la app de Daniel conectada, `mostrar fijar/guardar` esperaría su acuse 8 s.
    process.env.ARBRAIN_PANEL_DIR = path.join(dir, 'panel')
  })
  afterEach(() => { delete process.env.ARBRAIN_ARCHIVERO; delete process.env.ARBRAIN_PANEL_DIR })

  it('guarda una vista sin fijar/soltar/guardar y no la duplica', () => {
    const a = guardar({ vista: 'calendario', alcance: 'semana', fijar: true, guardar: true }, { archivo, conversacion: 'c1' })
    expect(a.input).toEqual({ vista: 'calendario', alcance: 'semana' })
    expect(a.nombre).toBe('Calendario')
    expect(a.conversacion).toBe('c1')
    const b = guardar({ vista: 'calendario', alcance: 'mes' }, { archivo })
    expect(b.id).toBe(a.id)
    expect(b.conversacion).toBe('c1')
    expect(leer(archivo).entradas).toHaveLength(1)
  })

  it('un documento de /tmp se copia a docs/guardados/ y la entrada apunta a la copia', () => {
    const doc = path.join(dir, 'formatos.md')
    writeFileSync(doc, '# Prueba de formatos\n')
    const e = guardar({ vista: 'documento', ruta: doc, titulo: 'Formatos' }, { archivo, repo })
    expect(e.input.ruta).toBe('docs/guardados/formatos.md')
    expect(e.rutaOriginal).toBe(doc)
    expect(readFileSync(path.join(repo, 'docs/guardados/formatos.md'), 'utf8')).toBe('# Prueba de formatos\n')
    // Guardarlo otra vez es la misma entrada y la misma copia.
    const otra = guardar({ vista: 'documento', ruta: doc, titulo: 'Formatos' }, { archivo, repo })
    expect(otra.id).toBe(e.id)
    expect(leer(archivo).entradas).toHaveLength(1)
    // Mismo nombre con otro contenido: copia nueva, sin pisar la anterior.
    const doc2 = path.join(mkdtempSync(path.join('/tmp', 'otro-')), 'formatos.md')
    writeFileSync(doc2, 'otro')
    expect(guardar({ vista: 'documento', ruta: doc2 }, { archivo, repo }).input.ruta).toBe('docs/guardados/formatos-2.md')
  })

  it('busca por id o nombre, pide abrir, marca abierta y saca', () => {
    const e = guardar({ vista: 'finanzas', titulo: 'Runway de octubre' }, { archivo })
    expect(buscar('runway', archivo)?.id).toBe(e.id)
    expect(pedirAbrir('Runway de octubre', archivo)?.pedido?.accion).toBe('abrir')
    const abierta = marcarAbierta(e.id, archivo)
    expect(abierta?.pedido).toBeUndefined()
    expect(abierta?.abiertoEn).toBeTruthy()
    expect(sacar(e.id, archivo)?.id).toBe(e.id)
    expect(leer(archivo).entradas).toHaveLength(0)
  })

  it('lo no abierto en 30 días se propone, nunca se borra', () => {
    guardar({ vista: 'centro' }, { archivo, ahora: new Date('2026-08-01T12:00:00Z') })
    expect(sinAbrir(30, archivo, new Date('2026-10-03T12:00:00Z'))).toHaveLength(1)
    expect(leer(archivo).entradas).toHaveLength(1)
  })

  it('la app habla con el daemon por accionArchivero', () => {
    expect(accionArchivero({ accion: 'listar' })).toEqual({ entradas: [] })
    const r = accionArchivero({ accion: 'guardar', input: { vista: 'reporte' }, nombre: 'Lo de hoy', conversacion: 'c9' })
    expect('entrada' in r && r.entrada.nombre).toBe('Lo de hoy')
    expect(accionArchivero({ accion: 'sacar', id: 'nada' })).toMatchObject({ status: 404 })
    expect(accionArchivero({ accion: 'borrar-todo', id: 'x' })).toMatchObject({ status: 400 })
  })

  it('Levy: mostrar guardar:true y la herramienta archivero', async () => {
    const r = await ejecutarCabina('mostrar', { vista: 'objetivos', alcance: 'mes', guardar: true })
    expect(r.error).toBeFalsy()
    expect(r.text).toMatch(/guardada en el archivero/)
    expect(leer(archivo).entradas[0].input).toEqual({ vista: 'objetivos', alcance: 'mes' })
    expect((await ejecutarCabina('mostrar', { vista: 'objetivos', guardar: true, soltar: true })).error).toBe(true)
    expect((await ejecutarCabina('archivero', { accion: 'listar' })).text).toMatch(/1 en el archivero/)
    expect((await ejecutarCabina('archivero', { accion: 'abrir', id: 'objetivos' })).text).toMatch(/se abrirá/)
    expect((await ejecutarCabina('archivero', { accion: 'sacar', id: 'nada' })).error).toBe(true)
    expect((await ejecutarCabina('archivero', { accion: 'sacar', id: 'Objetivos' })).text).toMatch(/salió del archivero/)
    expect(existsSync(archivo)).toBe(true)
  })
})
