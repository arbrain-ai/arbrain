/**
 * Re-aceptación corta (0.2.18, 31 oct 2026): quien estaba en Autónomo con el texto de una versión anterior baja a
 * «Automático en mi carpeta» hasta aceptar el nuevo. En la bienvenida corta (legal + autonomía) puede aceptarlo y volver
 * a Autónomo, o elegir otro nivel; en los dos casos la decisión queda escrita y la tarjeta de migración no vuelve a
 * preguntar (nadie queda atrapado entre la bienvenida y la tarjeta).
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { cambiarModoPermisos, estadoPermisos } from './modo-permisos.js'
import { HUELLA_AUTONOMIA, VERSION_AUTONOMIA } from './consentimiento-autonomia.js'

const raiz = realpathSync(mkdtempSync(join(tmpdir(), 'arbrain-reaceptacion-')))
const previo = process.env.ARBRAIN_CONFIG_DIR
let n = 0
const VIEJO = { ts: 1, version: 'autonomia-v1-2026-10-29', sha256: 'f'.repeat(64), app: '0.2.17', so: 'darwin', via: 'bienvenida' }

beforeEach(() => {
  // Una carpeta por caso: el estado se cachea por ruta y mtime.
  const dir = join(raiz, String(++n)); mkdirSync(dir, { recursive: true })
  process.env.ARBRAIN_CONFIG_DIR = dir
  writeFileSync(join(dir, 'permisos.json'), JSON.stringify({ modo: 'autonomo', cambiado: 1, consentimiento: VIEJO, historialModo: [] }))
})
afterAll(() => {
  if (previo === undefined) delete process.env.ARBRAIN_CONFIG_DIR; else process.env.ARBRAIN_CONFIG_DIR = previo
  rmSync(raiz, { recursive: true, force: true })
})
const guardado = () => JSON.parse(readFileSync(join(process.env.ARBRAIN_CONFIG_DIR!, 'permisos.json'), 'utf8'))

describe('Autónomo con el texto viejo', () => {
  it('baja a «carpeta» y pide re-aceptar', () => {
    const e = estadoPermisos()
    expect(e.modo).toBe('carpeta')
    expect(e.reaceptar).toBe(true)
  })

  it('aceptar el texto nuevo lo regresa a Autónomo', () => {
    const r = cambiarModoPermisos('autonomo', { acepto: { version: VERSION_AUTONOMIA, sha256: HUELLA_AUTONOMIA }, via: 'bienvenida' })
    expect(r.ok).toBe(true)
    const e = estadoPermisos()
    expect(e.modo).toBe('autonomo')
    expect(e.reaceptar).toBe(false)
    expect(e.consentimiento?.version).toBe(VERSION_AUTONOMIA)
  })

  it('sin aceptar no vuelve a Autónomo', () => {
    const r = cambiarModoPermisos('autonomo', { via: 'bienvenida' })
    expect(r.ok).toBe(false)
    expect(estadoPermisos().modo).toBe('carpeta')
  })

  it('elegir «carpeta» a propósito queda escrito: ya no pide re-aceptar (antes la tarjeta volvía a preguntar)', () => {
    const r = cambiarModoPermisos('carpeta', { via: 'bienvenida' })
    expect(r.ok && r.cambio).toBe(true)
    const e = estadoPermisos()
    expect(e.modo).toBe('carpeta')
    expect(e.reaceptar).toBe(false)
    expect(guardado().modo).toBe('carpeta')
    expect(e.historialModo.at(-1)?.motivo).toMatch(/en vez de aceptar el texto nuevo/)
  })

  it('elegir «preguntar» también cierra la re-aceptación', () => {
    expect(cambiarModoPermisos('preguntar', { via: 'bienvenida' }).ok).toBe(true)
    expect(estadoPermisos()).toMatchObject({ modo: 'preguntar', reaceptar: false })
  })

  it('sin nada pendiente, repetir el modo no escribe', () => {
    cambiarModoPermisos('carpeta', { via: 'bienvenida' })
    const r = cambiarModoPermisos('carpeta', { via: 'ajustes' })
    expect(r.ok && r.cambio).toBe(false)
  })
})
