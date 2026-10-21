// Quién te escribe (16 oct 2026): el Levy de otra persona del equipo recibe su identidad y su contexto, no la campana
// del dueño. Nombres de prueba, nunca personas reales (este archivo viaja con el código).
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bloqueEquipo, equipoDelTurno, leerContexto, leerEntregas, personaDelEquipo } from './equipo.js'

const ID = '11111111-2222-4333-8444-555555555555'
const OTRO = '99999999-2222-4333-8444-555555555555'
const inst = { perfiles_equipo: { [ID]: { nombre: 'Prueba', contexto: 'equipo/prueba.md' } } }

function raiz(contenido?: string) {
  const r = mkdtempSync(join(tmpdir(), 'equipo-'))
  if (contenido !== undefined) { mkdirSync(join(r, 'equipo')); writeFileSync(join(r, 'equipo', 'prueba.md'), contenido) }
  return { raiz: r, store: join(r, 'store') }
}

describe('personaDelEquipo', () => {
  it('reconoce el perfil configurado y nadie más', () => {
    expect(personaDelEquipo(ID, inst, false)).toEqual({ nombre: 'Prueba', contexto: 'equipo/prueba.md' })
    expect(personaDelEquipo(ID.toUpperCase(), inst, false)?.nombre).toBe('Prueba')
    expect(personaDelEquipo(OTRO, inst, false)).toBeNull()
    expect(personaDelEquipo('no-es-uuid', inst, false)).toBeNull()
  })
  it('en la edición cliente nunca hay equipo', () => {
    expect(personaDelEquipo(ID, inst, true)).toBeNull()
  })
})

describe('leerContexto', () => {
  it('no sale de la raíz', () => {
    const { raiz: r } = raiz('hola')
    expect(leerContexto(r, 'equipo/prueba.md')).toBe('hola')
    expect(leerContexto(r, '../fuera.md')).toBeNull()
    expect(leerContexto(r, '/etc/hosts')).toBeNull()
    expect(leerContexto(r, 'no-existe.md')).toBeNull()
  })
})

describe('bloqueEquipo', () => {
  const p = { nombre: 'Prueba', contexto: 'equipo/prueba.md' }
  it('conversación nueva: identidad + contexto + novedad la primera vez', () => {
    const b = bloqueEquipo(p, 'Ya llegó todo.', { conversacionNueva: true })!
    expect(b.texto).toMatch(/QUIÉN TE ESCRIBE/)
    expect(b.texto).toMatch(/Te escribe Prueba/)
    expect(b.texto).toMatch(/Ya llegó todo\./)
    expect(b.novedad).toBe(true)
    expect(b.texto).toMatch(/NOVEDAD/)
  })
  it('ya entregado: en conversación nueva va sin novedad; en una abierta no va', () => {
    const primera = bloqueEquipo(p, 'Ya llegó todo.', { conversacionNueva: true })!
    const nueva = bloqueEquipo(p, 'Ya llegó todo.', { conversacionNueva: true, entregada: primera.huella })!
    expect(nueva.novedad).toBe(false)
    expect(nueva.texto).not.toMatch(/NOVEDAD/)
    expect(bloqueEquipo(p, 'Ya llegó todo.', { conversacionNueva: false, entregada: primera.huella })).toBeNull()
  })
  it('contexto cambiado: llega también a la conversación ya abierta', () => {
    const vieja = bloqueEquipo(p, 'v1', { conversacionNueva: true })!
    const b = bloqueEquipo(p, 'v2', { conversacionNueva: false, entregada: vieja.huella })!
    expect(b.novedad).toBe(true)
    expect(b.texto).toMatch(/v2/)
  })
  it('sin archivo: solo identidad en conversación nueva, nada en una abierta', () => {
    expect(bloqueEquipo(p, null, { conversacionNueva: true })!.texto).toMatch(/Te escribe Prueba/)
    expect(bloqueEquipo(p, null, { conversacionNueva: false })).toBeNull()
  })
})

describe('equipoDelTurno', () => {
  it('el dueño no cambia nada', () => {
    const { raiz: r, store } = raiz('x')
    expect(equipoDelTurno(OTRO, r, store, true, inst)).toBeNull()
  })
  it('la novedad se marca entregada una vez y no se repite', () => {
    const { raiz: r, store } = raiz('Ya llegó todo.')
    const t1 = equipoDelTurno(ID, r, store, false, inst)!
    expect(t1.bloque?.novedad).toBe(true)
    t1.marcar()
    expect(leerEntregas(join(store, 'equipo-entregado.json'))[ID]?.huella).toBe(t1.bloque!.huella)
    expect(equipoDelTurno(ID, r, store, false, inst)!.bloque).toBeNull()
    expect(equipoDelTurno(ID, r, store, true, inst)!.bloque?.novedad).toBe(false)
  })
})
