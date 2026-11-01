/**
 * Permiso por app y «la persona tiene el control» (1 nov 2026, opciones 1 y 2 firmadas por Daniel;
 * docs/builds/manos-permiso-por-app-2026-11-01).
 *
 * De punta a punta sin pantalla: el daemon es un servidor local con el almacén REAL (`cliente/permisos-app.ts`) y las
 * mismas rutas que `server.ts` (`/manos/apps/pedir`, `/manos/apps/<id>`); la «persona» resuelve la tarjeta llamando al
 * almacén como lo hace la ruta de la app (`/manos/apps/resolver`). El adaptador es falso y anota lo que llegaría a la app.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PermisosApp, appObjetivo } from '../cliente/permisos-app.js'
import { CapaApps, CATEGORIA_CONTROL, daemonHttp, type DaemonPermisos } from './permiso-app.js'
import { Freno } from './freno.js'
import { ejecutarManos } from './herramientas.js'
import { _politicaParaPruebas } from './politica.js'
import { componerManos } from './registro.js'
import type { Adaptador, App } from './contrato.js'

const previo = { ...process.env }
let srv: Server
let store: PermisosApp
const pedidos: Array<{ app: unknown; para: unknown; conversacion: unknown }> = []

beforeAll(async () => {
  srv = createServer(async (req, res) => {
    let cuerpo = ''; for await (const t of req) cuerpo += t
    const b = cuerpo ? JSON.parse(cuerpo) : {}
    const json = (x: unknown, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(x)) }
    if (req.headers.authorization !== 'Bearer pase-prueba') return json({ error: 'sin pase' }, 401)
    if (req.method === 'POST' && req.url === '/manos/apps/pedir') {
      pedidos.push(b)
      const app = appObjetivo(b.app)
      return app ? json(store.pedir({ app, para: b.para, conversacion: b.conversacion })) : json({ error: 'app' }, 400)
    }
    const m = req.url?.match(/^\/manos\/apps\/(pa_[0-9a-f]{12})$/)
    if (req.method === 'GET' && m) { const e = store.estadoDe(m[1]); return json(e ?? { error: 'no' }, e ? 200 : 404) }
    json({ error: 'no existe' }, 404)
  })
  await new Promise<void>(ok => srv.listen(0, '127.0.0.1', () => ok()))
})
afterAll(async () => { await new Promise<void>(ok => srv.close(() => ok())) })
beforeEach(() => {
  process.env.ARBRAIN_EDICION = 'cliente'
  process.env.ARBRAIN_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'arbrain-permiso-app-'))
  process.env.MC_SERVER_PORT = String((srv.address() as AddressInfo).port)
  process.env.ARBRAIN_PASE_AGENTE = 'pase-prueba'
  process.env.ARBRAIN_MANOS_CONVERSACION = 'conv-1'
  process.env.ARBRAIN_PERMISO_APP_ESPERA_S = '0.4'
  process.env.ARBRAIN_CONFIRMAR_ESPERA_S = '0.3'
  _politicaParaPruebas({ fuenteLocal: true })
  store = new PermisosApp(() => join(process.env.ARBRAIN_CONFIG_DIR!, 'apps-siempre.json'))
  pedidos.length = 0
})
afterEach(() => { for (const k of Object.keys(process.env)) if (!(k in previo)) delete process.env[k]; Object.assign(process.env, previo) })

/** Adaptador falso: WhatsApp (pid 7) y Notas (pid 8); `frente` = la app al frente; `toma` = segundos desde el último clic. */
function falso(op: { frente?: number; toma?: number; inactividad?: number } = {}) {
  const llego: string[] = []
  const apps: App[] = [
    { nombre: 'WhatsApp', bundle: 'net.whatsapp.WhatsApp', pid: 7, activa: op.frente === 7 },
    { nombre: 'Notas', bundle: 'com.apple.Notes', pid: 8, activa: op.frente === 8 },
  ]
  const a: Adaptador = {
    nombre: 'falso',
    observar: async (p) => { llego.push(`observar:${p.app ?? p.pid}`); return { app: 'WhatsApp', pid: 7, ventana: 70, elementos: [], texto: '', total_elementos: 0 } },
    actuar: async (p) => { llego.push(`actuar:${p.accion}:${p.texto ?? p.tecla ?? ''}`); return { ok: true, efecto: 'confirmado' } },
    apps: async () => apps,
    abrir: async (app) => { llego.push(`abrir:${app}`); return { pid: 9, ventanas: [] } },
    ventanas: async () => [{ id: 70, pid: 7, app: 'WhatsApp', marco: { x: 0, y: 0, w: 1, h: 1 }, en_pantalla: true }, { id: 80, pid: 8, app: 'Notas', marco: { x: 0, y: 0, w: 1, h: 1 }, en_pantalla: true }],
    verificar: async () => ({ cumple: true, detalle: '' }),
    cursor: async () => ({ x: 0, y: 0 }),
    salud: async () => ({ ok: true, detalle: '' }),
    cerrar: async () => {},
    contexto: async () => ({ app: 'WhatsApp', bundle: 'net.whatsapp.WhatsApp', elemento: { rol: 'AXTextArea', titulo: 'Escribe un mensaje' } }),
    mostrar: async (p) => { llego.push(`mostrar:${p.pid ?? p.app}`) },
    ...(op.toma !== undefined ? { ultimaToma: async () => op.toma } : {}),
    ...(op.inactividad !== undefined ? { inactividad: async () => op.inactividad } : {}),
  }
  return { a, llego }
}

const capa = (a: Adaptador, extra: Partial<ConstructorParameters<typeof CapaApps>[1]> = {}) => new CapaApps(new Freno(a), { cadaMs: 20, ...extra })
/** La persona contesta la tarjeta (lo que hace `/manos/apps/resolver` con el secreto de la app). */
function contestarEn(ms: number, decision: 'siempre' | 'conversacion' | 'no') {
  return new Promise<void>(ok => setTimeout(() => { const t = store.pendientes()[0]; if (t) store.resolver(t.id, decision); ok() }, ms))
}

describe('permiso por app (edición del alumno)', () => {
  it('la primera vez que toca una app pide la tarjeta con el para qué, y nada llega a la app hasta su clic', async () => {
    const { a, llego } = falso()
    const manos = capa(a)
    manos.declarar('responder el mensaje de Juan')
    const espera = manos.observar({ app: 'WhatsApp' })
    await new Promise(r => setTimeout(r, 80))
    expect(store.pendientes()).toHaveLength(1)
    expect(store.pendientes()[0]).toMatchObject({ app: { clave: 'net.whatsapp.whatsapp', nombre: 'WhatsApp' }, para: 'responder el mensaje de Juan', conversacion: 'conv-1' })
    expect(llego).toEqual([])
    store.resolver(store.pendientes()[0].id, 'conversacion')
    await espera
    expect(llego).toEqual(['observar:WhatsApp'])
  })

  it('«Solo esta conversación»: no vuelve a preguntar aquí, pero en otra conversación sí', async () => {
    const { a, llego } = falso()
    const manos = capa(a)
    await Promise.all([manos.actuar({ app: 'WhatsApp', accion: 'click', ref: 'e1' }), contestarEn(60, 'conversacion')])
    await manos.actuar({ app: 'WhatsApp', accion: 'click', ref: 'e1' })
    expect(pedidos).toHaveLength(2) // se consulta al daemon cada vez (Ajustes puede cambiarlo), pero no hay tarjeta nueva
    expect(store.pendientes()).toHaveLength(0)
    expect(llego.filter(x => x.startsWith('actuar'))).toHaveLength(2)
    process.env.ARBRAIN_MANOS_CONVERSACION = 'conv-2'
    const otra = await manos.actuar({ app: 'WhatsApp', accion: 'click', ref: 'e1' })
    expect(otra.efecto).toBe('bloqueado')
    expect(otra.detalle).toMatch(/PERMISO_PENDIENTE/)
  })

  it('«Siempre»: queda en la lista de Ajustes (persistente) y ninguna conversación vuelve a preguntar; quitarla vuelve a preguntar', async () => {
    const { a, llego } = falso()
    const manos = capa(a)
    await Promise.all([manos.observar({ pid: 8 }), contestarEn(60, 'siempre')])
    expect(new PermisosApp(() => join(process.env.ARBRAIN_CONFIG_DIR!, 'apps-siempre.json')).siempre().map(x => x.nombre)).toEqual(['Notas'])
    process.env.ARBRAIN_MANOS_CONVERSACION = 'conv-9'
    await manos.observar({ app: 'com.apple.Notes' })
    expect(store.pendientes()).toHaveLength(0)
    expect(llego).toHaveLength(2)
    expect(store.quitar('com.apple.notes')).toBe(true)
    const r = await manos.actuar({ app: 'Notas', accion: 'click', ref: 'e2' })
    expect(r.detalle).toMatch(/PERMISO_PENDIENTE/)
  })

  it('«No»: no toca nada, el agente recibe app_negada y no vuelve a salir la tarjeta en esta conversación', async () => {
    const { a, llego } = falso()
    const manos = capa(a)
    const [r] = await Promise.all([manos.actuar({ app: 'WhatsApp', accion: 'escribir', ref: 'e1', texto: 'hola' }), contestarEn(60, 'no')])
    expect(r).toMatchObject({ ok: false, efecto: 'bloqueado', freno: { categoria: 'permiso_app', paso: false } })
    expect(r.detalle).toMatch(/app_negada/)
    expect(r.detalle).toMatch(/No lo intentes por otra vía/)
    await expect(manos.observar({ app: 'WhatsApp' })).rejects.toThrow(/app_negada/)
    expect(store.pendientes()).toHaveLength(0)
    expect(llego).toEqual([])
  })

  it('«No» en una conversación manda ahí aunque la app esté en «siempre» desde otra', () => {
    const app = { clave: 'com.apple.notes', nombre: 'Notas' }
    store.resolver((store.pedir({ app, conversacion: 'conv-2' }) as { id: string }).id, 'no')
    store.resolver((store.pedir({ app, conversacion: 'conv-1' }) as { id: string }).id, 'siempre')
    expect(store.consultar(app, 'conv-1')).toMatchObject({ estado: 'permitida', alcance: 'siempre' })
    expect(store.consultar(app, 'conv-3')).toMatchObject({ estado: 'permitida', alcance: 'siempre' })
    expect(store.consultar(app, 'conv-2')).toEqual({ estado: 'negada' })
  })

  it('mientras no contesta: estado de espera con nombre (no un error), sin cerrar el turno; al reintentar, la misma tarjeta', async () => {
    const { a, llego } = falso()
    const manos = capa(a)
    const r = await manos.actuar({ app: 'WhatsApp', accion: 'click', ref: 'e1' })
    expect(r.efecto).toBe('bloqueado')
    expect(r.detalle).toMatch(/^PERMISO_PENDIENTE \(app_en_espera\)/)
    expect(r.detalle).toMatch(/No termines tu turno/)
    expect(r.detalle).toMatch(/vuelve a llamar a esta misma herramienta/)
    await expect(manos.observar({ app: 'WhatsApp' })).rejects.toThrow(/PERMISO_PENDIENTE/)
    expect(store.pendientes()).toHaveLength(1) // el reintento no apila tarjetas
    expect(llego).toEqual([])
    // Contesta mientras el agente reintenta: la llamada que espera sigue sola.
    const [r2] = await Promise.all([manos.actuar({ app: 'WhatsApp', accion: 'click', ref: 'e1' }), contestarEn(100, 'conversacion')])
    expect(r2.ok).toBe(true)
  })

  it('las ventanas que abrieron las manos no preguntan (ya pasaron su propio juicio)', async () => {
    const { a, llego } = falso()
    const freno = new Freno(a)
    freno.adoptar(80)
    const manos = new CapaApps(freno, { cadaMs: 20 })
    await manos.observar({ ventana: 80 })
    expect(pedidos).toHaveLength(0)
    expect(llego).toHaveLength(1)
  })

  it('abrir y mostrar también pasan por la puerta; la lista de apps y de ventanas no', async () => {
    const { a, llego } = falso()
    const manos = capa(a)
    await expect(manos.abrir('Spotify')).rejects.toThrow(/PERMISO_PENDIENTE/)
    await expect(manos.mostrar!({ app: 'WhatsApp' })).rejects.toThrow(/PERMISO_PENDIENTE/)
    expect(store.pendientes().map(p => p.app.nombre).sort()).toEqual(['Spotify', 'WhatsApp'])
    await manos.apps(); await manos.ventanas()
    expect(llego).toEqual([])
  })

  it('por la herramienta MCP: `para` llega a la tarjeta y no viaja al adaptador', async () => {
    const { a } = falso()
    const vistos: unknown[] = []
    const espia: Adaptador = { ...a, observar: async (p) => { vistos.push(p); return a.observar(p) } }
    const manos = capa(espia)
    const [r] = await Promise.all([ejecutarManos('observar', { app: 'WhatsApp', para: 'leer el último mensaje de Juan' }, manos, () => { throw new Error('sin decisor') }), contestarEn(60, 'conversacion')])
    expect(r.error).toBeFalsy()
    expect(pedidos[0]).toMatchObject({ para: 'leer el último mensaje de Juan', conversacion: 'conv-1' })
    expect(JSON.stringify(vistos)).not.toMatch(/para/)
  })

  it('componerManos pone la puerta encima del freno', () => {
    const { a } = falso()
    const m = componerManos(a) as any
    expect(m.interno).toBeInstanceOf(CapaApps)
    expect(m.interno.interno).toBeInstanceOf(Freno)
  })

  it('sin daemon: no toca nada y lo dice', async () => {
    delete process.env.MC_SERVER_PORT
    const { a, llego } = falso()
    const r = await capa(a).actuar({ app: 'WhatsApp', accion: 'click', ref: 'e1' })
    expect(r.detalle).toMatch(/sin_conexion/)
    expect(llego).toEqual([])
  })

  it('instalación de Daniel: sin tarjeta (su interruptor y su freno como están)', async () => {
    process.env.ARBRAIN_EDICION = 'original'
    const { a, llego } = falso()
    const daemon: DaemonPermisos = { pedir: async () => { throw new Error('no debe preguntar') }, estado: async () => { throw new Error('no') } }
    await capa(a, { daemon }).actuar({ app: 'WhatsApp', accion: 'click', ref: 'e1' })
    expect(llego).toEqual(['actuar:click:'])
  })

  it('el cliente HTTP manda el pase y entiende las tres respuestas', async () => {
    const d = daemonHttp()
    const app = { clave: 'com.apple.notes', nombre: 'Notas' }
    const p = await d.pedir({ app, para: 'x', conversacion: 'conv-1' })
    expect(p.estado).toBe('pendiente')
    store.resolver((p as { id: string }).id, 'no')
    expect(await d.estado((p as { id: string }).id)).toEqual({ estado: 'negada' })
  })
})

describe('«la persona tiene el control» (ambas ediciones)', () => {
  beforeEach(() => { process.env.ARBRAIN_EDICION = 'original' })

  it('la app está al frente y la persona hizo clic hace un instante: error con nombre, nada llega a la app', async () => {
    const { a, llego } = falso({ frente: 7, toma: 0.6 })
    const r = await capa(a).actuar({ app: 'WhatsApp', accion: 'escribir', ref: 'e1', texto: 'hola' })
    expect(r).toMatchObject({ ok: false, efecto: 'bloqueado', freno: { categoria: CATEGORIA_CONTROL, paso: false } })
    expect(r.detalle).toMatch(/tiene el control/)
    expect(r.detalle).toMatch(/No reintentes en bucle/)
    expect(llego).toEqual([])
  })

  it('si la persona lleva unos segundos sin tocar, o trabaja en OTRA app, las manos siguen', async () => {
    const quieta = falso({ frente: 7, toma: 6 })
    expect((await capa(quieta.a).actuar({ app: 'WhatsApp', accion: 'click', ref: 'e1' })).ok).toBe(true)
    const otra = falso({ frente: 8, toma: 0.1 })
    expect((await capa(otra.a).actuar({ app: 'WhatsApp', accion: 'click', ref: 'e1' })).ok).toBe(true)
  })

  it('sin `ultimaToma` (Windows) usa la inactividad; sin ninguna de las dos no adivina', async () => {
    const win = falso({ frente: 7, inactividad: 1 })
    expect((await capa(win.a).actuar({ app: 'WhatsApp', accion: 'click', ref: 'e1' })).freno?.categoria).toBe(CATEGORIA_CONTROL)
    const nada = falso({ frente: 7 })
    expect((await capa(nada.a).actuar({ app: 'WhatsApp', accion: 'click', ref: 'e1' })).ok).toBe(true)
  })

  it('MANOS_TOMA_S ajusta el umbral', async () => {
    process.env.MANOS_TOMA_S = '0.5'
    const { a } = falso({ frente: 7, toma: 1 })
    expect((await capa(a).actuar({ app: 'WhatsApp', accion: 'click', ref: 'e1' })).ok).toBe(true)
  })
})
