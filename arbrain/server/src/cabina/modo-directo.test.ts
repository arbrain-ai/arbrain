import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Personas de prueba, inventadas: nunca datos reales de clientes en un test (viaja en git).
const dir = mkdtempSync(path.join(tmpdir(), 'modo-directo-'))
const fichas = path.join(dir, 'fichas')
const tabla = path.join(dir, 'tablero.md')
const antes = { estado: process.env.ARBRAIN_MODO_DIRECTO, fichas: process.env.ARBRAIN_DIRECTO_FICHAS, tablas: process.env.ARBRAIN_DIRECTO_TABLAS }

beforeAll(() => {
  process.env.ARBRAIN_MODO_DIRECTO = path.join(dir, 'modo-directo.json')
  process.env.ARBRAIN_DIRECTO_FICHAS = fichas
  process.env.ARBRAIN_DIRECTO_TABLAS = tabla
  writeFileSync(tabla, '# Tablero\n\n| Métrica | Valor |\n|---|---|\n| Cupos | 7 |\n\n| Nombre | Llamada |\n|---|---|\n| **Zutano Perengano** | dom 18 |\n| [Mengana](x.md) | lun 19 |\n| Perenganito Ruiz, Fulanita y Sutana (saldo el 26 oct) | mar 20 |\n| Cohorte | — |\n')
  mkdirSync(fichas, { recursive: true })
  writeFileSync(path.join(fichas, 'INDICE.md'), '| Ficha |\n|---|\n| [Rosaura Quintanilla (Panadería Sol)](rosaura-quintanilla.md) | +52 999 000 1111 |\n')
  writeFileSync(path.join(fichas, 'rosaura-quintanilla.md'), '---\ntipo: project\n---\n# Rosaura Quintanilla · Fundadora\n\n**Contacto:** rosaura.prueba@example.com · WhatsApp +52 999 000 1111\n')
  writeFileSync(path.join(fichas, 'daniel-ejemplar.md'), '# Daniel Ejemplar · Fundador\n')
  writeFileSync(path.join(dir, 'modo-directo-nombres.txt'), '# extra\nTeodoro Bastidas\n')
})
afterAll(() => {
  for (const [k, v] of [['ARBRAIN_MODO_DIRECTO', antes.estado], ['ARBRAIN_DIRECTO_FICHAS', antes.fichas], ['ARBRAIN_DIRECTO_TABLAS', antes.tablas]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  rmSync(dir, { recursive: true, force: true })
})

describe('modo directo · estado', () => {
  it('nace apagado, se prende y se apaga; rev sube y desde marca el arranque', async () => {
    const m = await import('./modo-directo.js')
    expect(m.leer().prendido).toBe(false)
    const a = m.poner(true, 'prueba', undefined, new Date('2026-11-07T18:00:00Z'))
    expect(a).toMatchObject({ prendido: true, rev: 1, desde: '2026-11-07T18:00:00.000Z', por: 'prueba' })
    expect(m.poner(true, 'prueba', undefined, new Date('2026-11-07T18:05:00Z')).desde).toBe('2026-11-07T18:00:00.000Z')
    expect(m.poner(false, 'prueba')).toMatchObject({ prendido: false, rev: 3, desde: null })
  })
  it('la acción del daemon: leer sin nombres apagado; poner valida y trae el diccionario prendido', async () => {
    const m = await import('./modo-directo.js')
    m.poner(false, 'prueba')
    expect(m.accionModoDirecto({ accion: 'leer' })).not.toHaveProperty('diccionario')
    expect(m.accionModoDirecto({ accion: 'poner' })).toMatchObject({ status: 400 })
    const r = m.accionModoDirecto({ accion: 'poner', prendido: true })
    expect('estado' in r && r.estado.prendido).toBe(true)
    expect('diccionario' in r && r.diccionario?.nombres).toContain('Rosaura Quintanilla')
    m.poner(false, 'prueba')
  })
})

describe('modo directo · diccionario', () => {
  it('saca nombres, apellidos, alias, correos y teléfonos de las fichas, el índice y la lista extra; nunca el nombre del dueño', async () => {
    const { diccionario } = await import('./modo-directo.js')
    const d = diccionario()
    expect(d.nombres).toEqual(expect.arrayContaining(['Rosaura Quintanilla', 'Rosaura', 'Quintanilla', 'Panadería Sol', 'Teodoro Bastidas', 'Daniel Ejemplar', 'Ejemplar']))
    expect(d.literales).toEqual(expect.arrayContaining(['rosaura.prueba@example.com', '+52 999 000 1111']))
    // Prospectos de las tablas de personas (Nombre/Persona/Quién); las tablas de métricas no aportan nombres.
    expect(d.nombres).toEqual(expect.arrayContaining(['Zutano Perengano', 'Zutano', 'Perengano', 'Mengana']))
    expect(d.nombres).toEqual(expect.arrayContaining(['Perenganito Ruiz', 'Fulanita', 'Sutana']))
    for (const x of ['Cupos', 'Cohorte', 'saldo el 26 oct']) expect(d.nombres).not.toContain(x)
    const { DUENO } = await import('../dueno.js')
    expect(d.nombres.map(n => n.toLowerCase())).not.toContain(DUENO.toLowerCase())
  })
})

describe('modo directo · la Cabina niega lo vetado aunque un agente lo pida', () => {
  it('vetoDirecto: vistas, rutas sensibles y destinos; apagado no niega nada', async () => {
    const { vetoDirecto } = await import('./modo-directo.js')
    for (const vista of ['finanzas', 'centro', 'cohorte', 'casa', 'perro']) expect(vetoDirecto('mostrar', { vista }, true)).toMatch(/^Oculto por modo directo/)
    expect(vetoDirecto('mostrar', { vista: 'cohorte' }, false)).toBeNull()
    expect(vetoDirecto('mostrar', { vista: 'calendario' }, true)).toBeNull()
    expect(vetoDirecto('mostrar', { vista: 'documento', ruta: 'arbrain/server/.env' }, true)).toMatch(/Oculto por modo directo/)
    expect(vetoDirecto('mostrar', { vista: 'documento', ruta: '~/.aws/config' }, true)).toMatch(/Oculto/)
    expect(vetoDirecto('mostrar', { vista: 'documento', ruta: '.claude/memory/reference/credenciales-operativas.md' }, true)).toMatch(/Oculto/)
    expect(vetoDirecto('mostrar', { vista: 'documento', ruta: 'docs/notas.md', compararCon: '.claude/memory/project/fundadores/x.md' }, true)).toMatch(/Oculto/)
    expect(vetoDirecto('mostrar', { vista: 'documento', ruta: 'docs/notas.md' }, true)).toBeNull()
    expect(vetoDirecto('abrir', { destino: 'finanzas' }, true)).toMatch(/Oculto/)
    expect(vetoDirecto('abrir', { destino: 'calendario' }, true)).toBeNull()
    // Quitar una pestaña fijada nunca enseña nada: se permite.
    expect(vetoDirecto('mostrar', { vista: 'cohorte', soltar: true }, true)).toBeNull()
  })
  it('ejecutarCabina responde «Oculto por modo directo» como error (el chat no monta la vista ni navega)', async () => {
    const m = await import('./modo-directo.js')
    const { ejecutarCabina } = await import('./tools.js')
    m.poner(true, 'prueba')
    try {
      for (const vista of ['finanzas', 'cohorte', 'casa']) {
        const r = await ejecutarCabina('mostrar', { vista })
        expect(r.error).toBe(true)
        expect(r.text).toMatch(/^Oculto por modo directo/)
      }
      const a = await ejecutarCabina('abrir', { destino: 'finanzas' })
      expect(a).toMatchObject({ error: true })
      expect(a.text).toMatch(/Oculto por modo directo/)
    } finally { m.poner(false, 'prueba') }
    const libre = await ejecutarCabina('abrir', { destino: 'finanzas' })
    expect(libre.error).toBeFalsy()
  })
  it('Levy recibe el aviso en cada turno solo con el modo prendido', async () => {
    const { avisoDirecto } = await import('./modo-directo.js')
    expect(avisoDirecto(false)).toBe('')
    expect(avisoDirecto(true)).toMatch(/MODO DIRECTO PRENDIDO/)
    expect(avisoDirecto(true)).toMatch(/\.env/)
  })
})
