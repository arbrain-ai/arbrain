/**
 * Almacén del permiso por app y reloj de turnos del daemon (1 nov 2026; cliente/permisos-app.ts), y la lista blanca del
 * pase para sus rutas: el MCP de manos pide y consulta; ver, resolver y quitar es solo de la app.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PermisosApp, TurnosManos, VIDA_PEDIDO_MS, appObjetivo, claveApp } from './permisos-app.js'
import { rutaSoloApp } from './cofre.js'

const nuevo = (ahora = () => Date.now()) => { const dir = mkdtempSync(join(tmpdir(), 'arbrain-apps-')); return { s: new PermisosApp(() => join(dir, 'manos', 'apps-siempre.json'), ahora), ruta: join(dir, 'manos', 'apps-siempre.json') } }
const WA = { clave: 'net.whatsapp.whatsapp', nombre: 'WhatsApp' }

describe('PermisosApp', () => {
  it('una tarjeta por app y conversación: pedir otra vez devuelve la misma', () => {
    const { s } = nuevo()
    const a = s.pedir({ app: WA, para: 'responder a Juan', conversacion: 'c1' })
    const b = s.pedir({ app: WA, para: 'otra cosa', conversacion: 'c1' })
    expect(a).toEqual(b)
    expect(s.pendientes()).toHaveLength(1)
    expect(s.pendientes()[0].para).toBe('responder a Juan')
    s.pedir({ app: WA, conversacion: 'c2' })
    expect(s.pendientes()).toHaveLength(2)
  })

  it('«siempre» se guarda en disco (0600) y resuelve también las tarjetas de esa app en otras conversaciones', () => {
    const { s, ruta } = nuevo()
    const a = s.pedir({ app: WA, conversacion: 'c1' }) as { id: string }
    s.pedir({ app: WA, conversacion: 'c2' })
    expect(s.resolver(a.id, 'siempre').ok).toBe(true)
    expect(s.pendientes()).toHaveLength(0)
    expect(JSON.parse(readFileSync(ruta, 'utf8')).apps[0]).toMatchObject(WA)
    expect(statSync(ruta).mode & 0o777).toBe(0o600)
    expect(new PermisosApp(() => ruta).consultar(WA, 'c-nueva')).toMatchObject({ estado: 'permitida', alcance: 'siempre' })
  })

  it('«esta conversación» y «no» viven en memoria: un daemon nuevo vuelve a preguntar', () => {
    const { s, ruta } = nuevo()
    s.resolver((s.pedir({ app: WA, conversacion: 'c1' }) as { id: string }).id, 'conversacion')
    expect(s.consultar(WA, 'c1')).toMatchObject({ estado: 'permitida', alcance: 'conversacion' })
    expect(new PermisosApp(() => ruta).consultar(WA, 'c1')).toBeNull()
  })

  it('resolver valida la decisión, el id y que siga pendiente', () => {
    const { s } = nuevo()
    const a = s.pedir({ app: WA, conversacion: 'c1' }) as { id: string }
    expect(s.resolver(a.id, 'una')).toMatchObject({ ok: false, status: 400 })
    expect(s.resolver('pa_000000000000', 'no')).toMatchObject({ ok: false, status: 404 })
    expect(s.resolver('../x', 'no')).toMatchObject({ ok: false, status: 404 })
    expect(s.resolver(a.id, 'no').ok).toBe(true)
    expect(s.resolver(a.id, 'siempre')).toMatchObject({ ok: false, status: 409 })
  })

  it('una tarjeta sin respuesta deja de pintarse a los 10 min (el agente la vuelve a pedir)', () => {
    let t = 1_000_000
    const { s } = nuevo(() => t)
    const a = s.pedir({ app: WA, conversacion: 'c1' }) as { id: string }
    t += VIDA_PEDIDO_MS + 1
    expect(s.pendientes()).toHaveLength(0)
    expect(s.estadoDe(a.id)).toEqual({ estado: 'vencida' })
    expect(s.pedir({ app: WA, conversacion: 'c1' })).toMatchObject({ estado: 'pendiente' })
  })

  it('quitar de «siempre» vuelve a preguntar', () => {
    const { s } = nuevo()
    s.resolver((s.pedir({ app: WA, conversacion: 'c1' }) as { id: string }).id, 'siempre')
    expect(s.quitar('NET.WhatsApp.WhatsApp')).toBe(true)
    expect(s.quitar('net.whatsapp.whatsapp')).toBe(false)
    expect(s.consultar(WA, 'c1')).toBeNull()
  })

  it('la app y el para qué llegan limpios (sin controles ni direcciones de texto invisibles)', () => {
    expect(appObjetivo({ clave: '  Com.Apple.Notes ', nombre: 'Notas\u202e' })).toEqual({ clave: 'com.apple.notes', nombre: 'Notas' })
    expect(appObjetivo({ nombre: 'sin clave' })).toBeNull()
    expect(claveApp('A\u0000B')).toBe('a b')
    const { s } = nuevo()
    s.pedir({ app: WA, para: 'x'.repeat(500) + '\n\u0007', conversacion: 'c1' })
    expect(s.pendientes()[0].para.length).toBe(200)
  })
})

describe('TurnosManos', () => {
  it('cuenta turnos terminados por conversación y sabe si hay uno vivo', () => {
    const t = new TurnosManos()
    expect(t.estado('c1')).toEqual({ vivo: false, fin: 0 })
    t.empezar('c1')
    expect(t.estado('c1')).toEqual({ vivo: true, fin: 0 })
    t.terminar('c1')
    expect(t.estado('c1')).toEqual({ vivo: false, fin: 1 })
    expect(t.estado('c2')).toEqual({ vivo: false, fin: 0 })
    expect(t.estado(undefined)).toEqual({ vivo: false, fin: 0 })
  })
})

describe('pase de agente y rutas del permiso por app', () => {
  it('el MCP de manos pide, consulta su pedido y pregunta por su turno', () => {
    for (const [m, r] of [['POST', '/manos/apps/pedir'], ['GET', '/manos/apps/pa_0123456789ab'], ['POST', '/manos/turno']] as const) expect(rutaSoloApp(m, r), `${m} ${r}`).toBe(false)
  })
  it('ver la lista, resolver una tarjeta y quitar una app: solo la app', () => {
    for (const [m, r] of [['GET', '/manos/apps'], ['POST', '/manos/apps/resolver'], ['POST', '/manos/apps/quitar'], ['GET', '/manos/apps/pa_0123'], ['GET', '/manos/apps/pa_0123456789abX'], ['POST', '/manos/apps/pa_0123456789ab'], ['GET', '/manos/turno']] as const)
      expect(rutaSoloApp(m, r), `${m} ${r}`).toBe(true)
  })
})
