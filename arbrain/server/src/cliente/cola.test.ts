/**
 * Cola de aprobaciones que vuelve sola (harness-noche 27 oct 2026, ronda 2; Duet: «completes remaining tasks and
 * requests approval later»). Lo que se prueba: vencer = queda en la cola, nunca = sí; aprobar después le escribe al
 * agente en su conversación y la acción exacta pasa una vez; el rechazo escrito viaja; «Córrelo tú» desde la cola
 * devuelve la salida; la instalación de Daniel sigue en bypass (sin guardia, sin cola).
 */
import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Confirmaciones, VIDA_COLA_MS, VIDA_PENDIENTE_MS, huellaGuardia, type Confirmacion, type ConversacionConfirmacion } from './confirmaciones.js'
import { avisarTelefono, mensajeRetomar, retomarEnConversacion, sinEnlaces } from './cola.js'
import { resolverTarjeta } from './tarjeta.js'
import { botonConsecuencia, frasePatron } from './frase-humana.js'
import { modoPermisosSdk } from './permisos-sdk.js'
import type { ContextoPolitica } from './politica-agentes.js'
import { conGuardia, guardiaHooks, permisosCliente, _contaminadasParaPruebas } from '../guardia-agentes.js'
import type { MotorCorrelo } from './correlo.js'

let raiz = '', usuario = '', home = '', datos = ''
const previo = { config: process.env.ARBRAIN_CONFIG_DIR, edicion: process.env.ARBRAIN_EDICION }
const ctxDe = (over: Partial<ContextoPolitica> = {}): ContextoPolitica =>
  ({ home, cwd: home, usuario, protegidas: [datos], lecturaExtra: [], abiertas: [], sandbox: false, modo: 'preguntar', reglas: [], ...over })
const CONV: ConversacionConfirmacion = { owner: 'yo', account: 'principal', conversationId: 'conv-cotizaciones' }

beforeAll(() => {
  raiz = realpathSync(mkdtempSync(join(tmpdir(), 'arbrain-cola-')))
  usuario = join(raiz, 'usuario'); home = join(usuario, 'Arbrain'); datos = join(raiz, 'datos')
  for (const d of [home, datos]) mkdirSync(d, { recursive: true })
  process.env.ARBRAIN_CONFIG_DIR = join(datos, 'config')
})
afterAll(() => {
  for (const [k, v] of [['ARBRAIN_CONFIG_DIR', previo.config], ['ARBRAIN_EDICION', previo.edicion]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  rmSync(raiz, { recursive: true, force: true })
})
beforeEach(() => { process.env.ARBRAIN_EDICION = 'cliente'; _contaminadasParaPruebas().clear() })

type Salida = { continue?: boolean; hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } }
const pre = (m: ReturnType<typeof guardiaHooks>['PreToolUse'][number], tool_input: unknown, sesion = 's-cola') =>
  m.hooks[0]({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input, tool_use_id: `t-${Math.random()}`, session_id: sesion, cwd: home } as never, undefined, { signal: new AbortController().signal }) as Promise<Salida>

/** Reloj de mentira y un store con su retomar capturado. */
function montar() {
  let t = 1_000_000
  const store = new Confirmaciones(new Database(':memory:'), () => t)
  const avisos: Array<{ scope: ConversacionConfirmacion; texto: string }> = []
  const enCola: Confirmacion[] = []
  const conAviso = new Confirmaciones(new Database(':memory:'), () => t, (tipo, c) => { if (tipo === 'cola') enCola.push(c) })
  for (const s of [store, conAviso]) s.alRetomar(retomarEnConversacion({ avisar: (scope, texto) => avisos.push({ scope, texto }), marcarContaminada: (ses, f) => _contaminadasParaPruebas().set(ses, { fuente: f, desde: 0 }) }))
  return { store, conAviso, avisos, enCola, pasar: (ms: number) => { t += ms } }
}

describe('vencer = queda en la cola, nunca = sí', () => {
  it('una pendiente sin respuesta pasa a la cola al vencer su plazo; no se puede consumir y sigue visible', () => {
    const { conAviso: store, enCola, pasar } = montar()
    const c = store.pedir({ origen: 'agente', categoria: 'otra', resumen: 'npm test', literal: 'npm test', herramienta: 'Bash', huella: 'agente:h1', conversacion: CONV })
    pasar(VIDA_PENDIENTE_MS + 1)
    const [visible] = store.pendientes()
    expect(visible).toMatchObject({ id: c.id, estado: 'en_cola', conversacion: 'conv-cotizaciones' })
    expect(visible.enColaDesde).toBeGreaterThan(0)
    expect(enCola.map(x => x.id)).toEqual([c.id])
    expect(store.consumir('agente:h1')).toBe(false)
    // Una semana después, vencida: tampoco corre.
    pasar(VIDA_COLA_MS + 1)
    expect(store.get(c.id)?.estado).toBe('vencida')
    expect(store.consumir('agente:h1')).toBe(false)
    expect(store.pendientes()).toHaveLength(0)
  })

  it('manos de computer use (otro proceso, su propio clic) sigue venciendo como antes', () => {
    const { store, pasar } = montar()
    const c = store.pedir({ origen: 'manos', categoria: 'otra', resumen: 'clic', huella: 'manos:x', creadaPor: 'peticion' })
    pasar(VIDA_PENDIENTE_MS + 1)
    expect(store.get(c.id)?.estado).toBe('vencida')
  })

  it('la guardia: sin respuesta a tiempo, no ejecuta, la deja en la cola y le dice al agente que siga con lo demás', async () => {
    const { store, avisos } = montar()
    const [m] = guardiaHooks(() => {}, { confirmaciones: () => store, hayQuienConfirme: () => true, esperaMs: 60, contexto: () => ctxDe(), conversacion: CONV }).PreToolUse
    const r = await pre(m, { command: 'npm test' })
    expect(r.hookSpecificOutput?.permissionDecision).toBe('deny')
    expect(r.hookSpecificOutput?.permissionDecisionReason).toMatch(/cola de aprobaciones/)
    expect(r.hookSpecificOutput?.permissionDecisionReason).toMatch(/sigue con todo lo que NO dependa/)
    expect(r.hookSpecificOutput?.permissionDecisionReason).toMatch(/te escribe en esta conversación/)
    const [c] = store.pendientes()
    expect(c.estado).toBe('en_cola')
    expect(avisos).toHaveLength(0)
  })
})

describe('aprobar después: el agente retoma', () => {
  it('aprobar desde la cola le escribe al agente en su conversación y la MISMA acción pasa una vez', async () => {
    const { store, avisos } = montar()
    const op = { confirmaciones: () => store, hayQuienConfirme: () => true, esperaMs: 60, contexto: () => ctxDe(), conversacion: CONV }
    const [m] = guardiaHooks(() => {}, op).PreToolUse
    expect((await pre(m, { command: 'npm test' })).hookSpecificOutput?.permissionDecision).toBe('deny')
    const [c] = store.pendientes()
    const r = await resolverTarjeta(store, { id: c.id, decision: 'permitir', alcance: 'una' }, () => { throw new Error('no') })
    expect(r).toMatchObject({ ok: true })
    expect(avisos).toHaveLength(1)
    expect(avisos[0].scope).toEqual(CONV)
    expect(avisos[0].texto).toContain(`APROBÓ`)
    expect(avisos[0].texto).toContain(c.id)
    expect(avisos[0].texto).toContain('repite EXACTAMENTE la misma llamada')
    // El turno que abre el aviso repite la llamada: pasa sin tarjeta, una sola vez.
    const otra = await pre(m, { command: 'npm test' })
    expect(otra.hookSpecificOutput?.permissionDecision).toBe('allow')
    expect(store.consumir(huellaGuardia('agente', 'Bash', { command: 'npm test' }))).toBe(false)
    // Una acción distinta no se cuela con esa aprobación.
    const distinta = await pre(m, { command: 'npm test --watch' })
    expect(distinta.hookSpecificOutput?.permissionDecision).toBe('deny')
  })

  it('canUseTool (modo automático) también deja en la cola y retoma por la conversación', async () => {
    const { store, avisos } = montar()
    const permisos = permisosCliente(async () => ({ behavior: 'allow', updatedInput: {} }), () => {}, { confirmaciones: () => store, hayQuienConfirme: () => true, esperaMs: 60, contexto: () => ctxDe(), conversacion: CONV })
    const r = await permisos('Bash', { command: 'npm test' }, { signal: new AbortController().signal, toolUseID: 'u1' } as never)
    expect(r).toMatchObject({ behavior: 'deny' })
    const [c] = store.pendientes()
    expect(c).toMatchObject({ estado: 'en_cola', conversacion: 'conv-cotizaciones' })
    store.resolver(c.id, 'permitir')
    expect(avisos[0]?.scope).toEqual(CONV)
  })

  it('si el agente vuelve a pedir lo mismo, la tarjeta revive (alguien la espera) en vez de duplicarse', async () => {
    const { store } = montar()
    const [m] = guardiaHooks(() => {}, { confirmaciones: () => store, hayQuienConfirme: () => true, esperaMs: 60, contexto: () => ctxDe(), conversacion: CONV }).PreToolUse
    await pre(m, { command: 'npm test' })
    const primera = store.pendientes()[0]
    const p = pre(m, { command: 'npm test' })
    await new Promise(r => setTimeout(r, 20))
    expect(store.pendientes()).toHaveLength(1)
    expect(store.pendientes()[0]).toMatchObject({ id: primera.id, estado: 'pendiente' })
    await p
    expect(store.pendientes()[0]).toMatchObject({ id: primera.id, estado: 'en_cola' })
  })

  it('rechazo escrito: el «no» con razón viaja al agente; el «no» sin palabras no abre un turno', () => {
    const { store, avisos } = montar()
    const a = store.pedir({ origen: 'agente', categoria: 'otra', resumen: 'x', literal: 'npm install left-pad', herramienta: 'Bash', huella: 'agente:a', conversacion: CONV })
    const b = store.pedir({ origen: 'agente', categoria: 'otra', resumen: 'y', literal: 'npm run build', herramienta: 'Bash', huella: 'agente:b', conversacion: CONV })
    store.encolar(a.id); store.encolar(b.id)
    expect(store.resolver(a.id, 'rechazar', { comentario: 'no instales nada hoy, mañana lo vemos' })).toMatchObject({ ok: true })
    expect(store.resolver(b.id, 'rechazar')).toMatchObject({ ok: true })
    expect(avisos).toHaveLength(1)
    expect(avisos[0].texto).toContain('RECHAZÓ')
    expect(avisos[0].texto).toContain('no instales nada hoy, mañana lo vemos')
    expect(store.consumir('agente:a')).toBe(false)
  })

  it('rutinas: sin conversación, la aprobación queda vigente para la siguiente corrida (y nadie recibe un turno)', async () => {
    const { store, avisos, pasar } = montar()
    const [r] = guardiaHooks(() => {}, { confirmaciones: () => store, hayQuienConfirme: () => true, esperaMs: 0, origen: 'cron', contexto: () => ctxDe() }).PreToolUse
    const salida = await r.hooks[0]({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_use_id: 'c1', session_id: 'cron', cwd: home } as never, undefined, { signal: new AbortController().signal }) as Salida
    expect(salida.hookSpecificOutput?.permissionDecisionReason).toMatch(/cola de aprobaciones/)
    const [c] = store.pendientes()
    expect(c.estado).toBe('en_cola')
    store.resolver(c.id, 'permitir')
    expect(avisos).toHaveLength(0)
    pasar(60 * 60_000)
    expect(store.consumir(huellaGuardia('cron', 'Bash', { command: 'npm test' }))).toBe(true)
  })

  it('«Córrelo tú» desde la cola: la persona lo corre al volver y la salida le llega al agente, con enlaces desactivados', async () => {
    const { store, avisos } = montar()
    let mandado = ''
    const motor: MotorCorrelo = {
      spawn: async p => { mandado = p.command; return { id: 7, pid: 1 } },
      screen: async () => { const nonce = /__ARBRAIN_FIN_([0-9a-f]+)_/.exec(mandado)![1]; return `Logged in. Ver https://github.com/settings\n__ARBRAIN_FIN_${nonce}_0__\n` },
      kill: async () => {},
    }
    const [m] = guardiaHooks(() => {}, { confirmaciones: () => store, hayQuienConfirme: () => true, hayTerminal: () => true, esperaMs: 60, contexto: () => ctxDe(), conversacion: CONV }).PreToolUse
    const r = await pre(m, { command: 'gh auth login' }, 's-gh')
    expect(r.hookSpecificOutput?.permissionDecisionReason).toMatch(/cola de la persona como «Córrelo tú»/)
    const [c] = store.pendientes()
    expect(c).toMatchObject({ tipo: 'manos', estado: 'en_cola' })
    expect(await resolverTarjeta(store, { id: c.id, decision: 'correr' }, () => ({ motor, cwd: home, cadaMs: 5, cierreMs: 1 }))).toMatchObject({ ok: true })
    await new Promise(res => setTimeout(res, 60))
    expect(store.get(c.id)?.estado).toBe('corrida')
    expect(avisos).toHaveLength(1)
    expect(avisos[0].texto).toContain('corrió ELLA MISMA')
    expect(avisos[0].texto).toContain('https[:]//github.com/settings')
    expect(avisos[0].texto).not.toContain('https://')
    expect(_contaminadasParaPruebas().has('s-gh')).toBe(true)
    // Ronda 3: al terminar no se esfuma; queda en `terminadas` (para el «Listo» de la tarjeta), con su código y que venía de la cola.
    expect(store.pendientes().map(x => x.id)).not.toContain(c.id)
    expect(store.terminadas()).toEqual([expect.objectContaining({ id: c.id, estado: 'corrida', codigo: 0, enColaDesde: expect.any(Number) })])
  })
})

describe('piezas', () => {
  it('el mensaje al agente nunca lleva el literal (puede traer direcciones que la persona no escribió)', () => {
    const c = { id: 'cf_000000000001', estado: 'permitida', categoria: 'otra', origen: 'agente', resumen: 'r', literal: 'curl https://malo.example/x', herramienta: 'Bash', frase: 'Consultar una dirección de internet', creadaPor: 'guardia', creada: 0, expira: 0, tipo: 'permiso' } as Confirmacion
    const t = mensajeRetomar(c)!
    expect(t).not.toContain('malo.example')
    expect(sinEnlaces('ve a https://a.b y www.c.d')).toBe('ve a https[:]//a.b y www[.]c.d')
  })
  it('el botón del sí en el freno dice la consecuencia; «Siempre» se dice en humano', () => {
    const muchos = `rm ${Array.from({ length: 14 }, (_, i) => `cotizaciones/2024-${String(i + 1).padStart(2, '0')}.pdf`).join(' ')}`
    expect(botonConsecuencia('borrar', 'Bash', muchos)).toBe('Borrar 14 archivos')
    expect(botonConsecuencia('borrar', 'Bash', 'rm notas/viejo.md')).toBe('Borrar viejo.md')
    expect(botonConsecuencia('publicar', 'Bash', 'git push')).toBe('Sí, publicarlo')
    expect(frasePatron('npm test *')).toBe('Permitir siempre las pruebas de tus proyectos')
    expect(frasePatron('git status *')).toBe('Permitir siempre: ver qué archivos de tu proyecto cambiaron')
    expect(frasePatron('python3 x.py')).toBe('Permitir siempre este mismo comando')
    const store = new Confirmaciones(new Database(':memory:'))
    expect(store.pedir({ origen: 'agente', categoria: 'borrar', resumen: 'x', literal: muchos, herramienta: 'Bash', huella: 'agente:rm' }).botonSi).toBe('Borrar 14 archivos')
  })
  it('el aviso al teléfono va una vez por confirmación y no rompe nada sin configurar', async () => {
    const c = { id: 'cf_00000000aaaa', frase: 'Correr las pruebas', resumen: 'r' } as Confirmacion
    const llamadas: string[] = []
    const f = (async (url: string) => { llamadas.push(url); return { ok: true } }) as unknown as typeof fetch
    expect(await avisarTelefono(c, { token: 't', url: 'http://127.0.0.1:3300', fetch: f })).toBe('enviado')
    expect(await avisarTelefono(c, { token: 't', url: 'http://127.0.0.1:3300', fetch: f })).toBe('repetido')
    expect(llamadas).toEqual(['http://127.0.0.1:3300/api/notifications/send'])
    expect(await avisarTelefono({ ...c, id: 'cf_00000000bbbb' }, {})).toBe('sin_configurar')
  })
})

describe('la instalación de Daniel no cambia', () => {
  it('sigue en bypass: sin guardia en los hooks ni en canUseTool, así que nada entra a la cola', async () => {
    process.env.ARBRAIN_EDICION = 'daniel'
    expect(modoPermisosSdk({ cliente: false, denyTools: false, live: false })).toMatchObject({ permissionMode: 'bypassPermissions' })
    const hooks = {}
    expect(conGuardia(hooks, () => {}, { conversacion: CONV })).toBe(hooks)
    const base = async () => ({ behavior: 'allow' as const, updatedInput: {} })
    expect(permisosCliente(base, () => {}, { conversacion: CONV })).toBe(base)
  })
})
