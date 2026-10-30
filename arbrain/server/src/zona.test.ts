/** T7 de la cohorte (29 oct 2026): el daemon del alumno usa SU zona; el original sigue en México. */
import { afterEach, describe, expect, it } from 'vitest'
import { diaCivil, instanteDeHoraCivil, zonaDueno, ZONA_ORIGINAL } from './zona.js'
import { describirDespertador, etiquetaZona, fechaHoraCivil, resolverHora, type Despertador } from './chat-runtime/despertadores.js'

const CLIENTE = { ARBRAIN_EDICION: 'cliente' } as NodeJS.ProcessEnv
const ORIGINAL = { ARBRAIN_EDICION: 'original' } as NodeJS.ProcessEnv
const antes = { ARBRAIN_EDICION: process.env.ARBRAIN_EDICION, ARBRAIN_TZ: process.env.ARBRAIN_TZ }
afterEach(() => { for (const [k, v] of Object.entries(antes)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } })

describe('zonaDueno (daemon)', () => {
  it('Instalación original: siempre México, diga lo que diga el sistema o ARBRAIN_TZ', () => {
    expect(zonaDueno(ORIGINAL, 'Europe/Madrid')).toBe(ZONA_ORIGINAL)
    expect(zonaDueno({ ...ORIGINAL, ARBRAIN_TZ: 'America/Santiago' }, 'Europe/Madrid')).toBe(ZONA_ORIGINAL)
  })
  it('alumno: ARBRAIN_TZ válida, luego la del sistema, luego UTC', () => {
    expect(zonaDueno(CLIENTE, 'Europe/Madrid')).toBe('Europe/Madrid')
    expect(zonaDueno({ ...CLIENTE, ARBRAIN_TZ: 'America/Santiago' }, 'Europe/Madrid')).toBe('America/Santiago')
    expect(zonaDueno({ ...CLIENTE, ARBRAIN_TZ: 'Nada/Valido' }, 'Europe/Madrid')).toBe('Europe/Madrid')
    expect(zonaDueno(CLIENTE, '')).toBe('UTC')
  })
  it('día civil cambia a la medianoche de cada zona', () => {
    expect(diaCivil(Date.parse('2026-10-29T22:59:00Z'), 'Europe/Madrid')).toBe('2026-10-29')
    expect(diaCivil(Date.parse('2026-10-29T23:01:00Z'), 'Europe/Madrid')).toBe('2026-10-30')
    expect(diaCivil(Date.parse('2026-10-30T02:59:00Z'), 'America/Santiago')).toBe('2026-10-29')
    expect(diaCivil(Date.parse('2026-10-30T03:01:00Z'), 'America/Santiago')).toBe('2026-10-30')
    expect(diaCivil(Date.parse('2026-10-30T05:59:00Z'), ZONA_ORIGINAL)).toBe('2026-10-29')
    expect(diaCivil(Date.parse('2026-10-30T06:01:00Z'), ZONA_ORIGINAL)).toBe('2026-10-30')
  })
  it('instanteDeHoraCivil respeta el horario de verano de cada día', () => {
    // Madrid: verano (UTC+2) hasta el 25 oct 2026; invierno (UTC+1) después.
    expect(new Date(instanteDeHoraCivil('2026-10-24', 14, 5, 'Europe/Madrid')).toISOString()).toBe('2026-10-24T12:05:00.000Z')
    expect(new Date(instanteDeHoraCivil('2026-10-30', 14, 5, 'Europe/Madrid')).toISOString()).toBe('2026-10-30T13:05:00.000Z')
  })
})

describe('despertador «a las 14:05» en la zona del dueño', () => {
  const base = Date.parse('2026-10-30T08:00:00Z') // 09:00 en Madrid, 02:00 en México, 05:00 en Santiago
  it('Madrid: cae a las 14:05 de Madrid', () => {
    expect(new Date(resolverHora('14:05', base, 'Europe/Madrid')).toISOString()).toBe('2026-10-30T13:05:00.000Z')
    // Ya pasó (las 08:00 de Madrid) → mañana a las 08:00 de Madrid.
    expect(new Date(resolverHora('08:00', base, 'Europe/Madrid')).toISOString()).toBe('2026-10-31T07:00:00.000Z')
  })
  it('Santiago: cae a las 14:05 de Santiago', () => {
    expect(new Date(resolverHora('14:05', base, 'America/Santiago')).toISOString()).toBe('2026-10-30T17:05:00.000Z')
  })
  it('México: igual que siempre', () => {
    expect(new Date(resolverHora('14:05', base, ZONA_ORIGINAL)).toISOString()).toBe('2026-10-30T20:05:00.000Z')
    expect(new Date(resolverHora('01:00', base, ZONA_ORIGINAL)).toISOString()).toBe('2026-10-31T07:00:00.000Z')
  })
  it('por defecto toma la zona de la edición: alumno con ARBRAIN_TZ=Europe/Madrid, original en México', () => {
    process.env.ARBRAIN_EDICION = 'cliente'; process.env.ARBRAIN_TZ = 'Europe/Madrid'
    expect(new Date(resolverHora('14:05', base)).toISOString()).toBe('2026-10-30T13:05:00.000Z')
    expect(etiquetaZona(zonaDueno())).toBe('hora local, Europe/Madrid')
    const d = { id: 'd-1', dueAt: Date.parse('2026-10-30T13:05:00Z'), estado: 'pendiente', cadaMs: null, restantes: null, texto: 'x', motivo: null } as unknown as Despertador
    expect(describirDespertador(d, base)).toContain('2026-10-30 14:05')
    process.env.ARBRAIN_EDICION = 'original'
    expect(new Date(resolverHora('14:05', base)).toISOString()).toBe('2026-10-30T20:05:00.000Z')
    expect(etiquetaZona(zonaDueno())).toBe('hora de México')
    expect(fechaHoraCivil(Date.parse('2026-10-30T20:05:00Z'), zonaDueno())).toBe('2026-10-30 14:05')
  })
})
