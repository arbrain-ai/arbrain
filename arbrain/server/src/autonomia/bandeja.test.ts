import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { createServer, type Server } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Confirmaciones, USOS_DECISION } from '../cliente/confirmaciones.js'
import { mensajeRetomar } from '../cliente/cola.js'
import { asegurarSecretoDecidir, avisoDeTarjeta, expiraDe, rutasBandeja, scopeDeSesion, ventanaDelDia, vistaBandeja } from './bandeja.js'
import { anotarHechoSolo, fijarPolitica, _politicaAutonomiaParaPruebas } from './politica.js'
import { _plataformaParaPruebas, responderSoporte, type PedidoSoporte, type ResultadoPublicar } from './soporte.js'
import { leerHechoSolo } from './bandeja.js'
import { diaCivil } from '../zona.js'
import { Freno } from '../manos/freno.js'
import { fijarContextoToque } from '../manos/confirmacion-humana.js'
import { frenarWeb } from '../manos/web/freno-web.js'
import type { Adaptador, ContextoAccion, PedidoActuar } from '../manos/contrato.js'

const TOKEN = 'token-de-prueba-bandeja'
let dir = '', db: Database.Database, store: Confirmaciones, servidor: Server, secreto = ''
const antes = { ...process.env }

/** El daemon de verdad, en pequeño: las mismas rutas de la bandeja sobre una tienda en memoria. */
beforeAll(async () => {
  servidor = createServer(async (req, res) => {
    let cuerpo = ''
    for await (const t of req) cuerpo += t
    if ((req.headers.authorization ?? '') !== `Bearer ${TOKEN}`) { res.writeHead(401).end('{}'); return }
    const ruta = new URL(req.url ?? '/', 'http://x').pathname
    const atendida = await rutasBandeja(req.method ?? 'GET', ruta, cuerpo ? JSON.parse(cuerpo) : {}, {
      store: () => store, conPase: false, db: () => db, puedeDecidir: () => req.headers['x-arbrain-decidir'] === secreto,
      enviar: (status, c) => { res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(c)) },
    })
    if (!atendida) res.writeHead(404).end('{}')
  })
  await new Promise<void>(r => servidor.listen(0, '127.0.0.1', () => r()))
})
afterAll(() => new Promise<void>(r => servidor.close(() => r())))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bandeja-'))
  process.env.ARBRAIN_POLITICA_AUTONOMIA = join(dir, 'politica.json')
  process.env.ARBRAIN_HECHO_SOLO_DIR = join(dir, 'hecho-solo')
  process.env.ARBRAIN_SECRETO_DECIDIR_ARCHIVO = join(dir, 'secreto')
  process.env.MC_SERVER_PORT = String((servidor.address() as { port: number }).port)
  process.env.OPENCLAW_GATEWAY_TOKEN = TOKEN
  process.env.ARBRAIN_CONFIRMAR_ESPERA_S = '3'
  process.env.CLAUDE_CODE_SESSION_ID = '11111111-2222-3333-4444-555555555555'
  _politicaAutonomiaParaPruebas()
  fijarContextoToque(null)
  db = new Database(':memory:')
  db.exec(`CREATE TABLE chat_runtime_turns (turn_id TEXT, owner TEXT, account TEXT, conversation_id TEXT, native_thread_id TEXT, updated_at INTEGER)`)
  db.prepare(`INSERT INTO chat_runtime_turns VALUES ('t1', 'dueno', 'default', 'conv-1', ?, 1)`).run(process.env.CLAUDE_CODE_SESSION_ID)
  store = new Confirmaciones(db)
  secreto = asegurarSecretoDecidir()
})
afterEach(() => { process.env = { ...antes }; _politicaAutonomiaParaPruebas(); fijarContextoToque(null) })

const base = () => `http://127.0.0.1:${process.env.MC_SERVER_PORT}`
const http = async (ruta: string, cuerpo?: unknown, decidir = false) => {
  const r = await fetch(`${base()}${ruta}`, { method: cuerpo === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(decidir ? { 'x-arbrain-decidir': secreto } : {}) }, ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }) })
  return { status: r.status, j: await r.json() as any }
}

/** Una app de chat de mentira: registra lo que las manos de verdad harían. */
function chat(hechas: PedidoActuar[], contexto: ContextoAccion): Adaptador {
  return {
    nombre: 'prueba', observar: async () => ({ app: contexto.app ?? 'X', pid: 7, ventana: 3, elementos: [], texto: '', total_elementos: 0 }),
    actuar: async (p: PedidoActuar) => { hechas.push(p); return { ok: true, efecto: 'sin_verificar' as const } },
    apps: async () => [], abrir: async () => ({ pid: 7, ventanas: [] }), ventanas: async () => [], verificar: async () => ({ cumple: true, detalle: '' }),
    cursor: async () => ({ x: 0, y: 0 }), salud: async () => ({ ok: true, detalle: '' }), cerrar: async () => {},
    contexto: async () => contexto,
  } as Adaptador
}
const WHATSAPP: ContextoAccion = { bundle: 'net.whatsapp.WhatsApp', app: 'WhatsApp', elemento: { rol: 'AXTextArea', descripcion: 'Escribe un mensaje' } }
const PAGAR: ContextoAccion = { bundle: 'com.apple.Safari.x', app: 'Tienda', elemento: { rol: 'AXButton', titulo: 'Pagar ahora' } }
/** La persona toca en la bandeja en cuanto aparece la tarjeta. */
function tocarCuandoLlegue(respuesta: 'si' | 'no' | 'otro', comentario?: string): Promise<string> {
  return new Promise(resolve => {
    const t = setInterval(async () => {
      const abiertas = store.pendientes().filter(c => c.estado === 'pendiente')
      if (!abiertas.length) return
      clearInterval(t)
      const r = await http('/decisiones/resolver', { id: abiertas[0].id, respuesta, comentario }, true)
      resolve(r.j.id)
    }, 50)
  })
}

describe('bandeja: la tienda', () => {
  it('una decisión de Levy nace en la cola, con recomendación, y no se apila al volver a subirla', () => {
    const p = { origen: 'agente' as const, tipo: 'decision' as const, categoria: 'enviar' as const, enCola: true, titulo: 'Mandarle a Juan el resumen', resumen: 'x', recomendacion: 'Ya lo pidió el lunes', recomienda: 'si' as const, huella: 'decision:a' }
    const c = store.pedir(p)
    expect(c).toMatchObject({ estado: 'en_cola', tipo: 'decision', recomienda: 'si', recomendacion: 'Ya lo pidió el lunes' })
    const otra = store.pedir({ ...p, recomendacion: 'Mejor mañana', recomienda: 'no' })
    expect(otra.id).toBe(c.id)
    expect(store.get(c.id)?.recomienda).toBe('no')
  })

  it('«Otro» exige texto y nunca aprueba; el Sí de una decisión autoriza su categoría con tope', () => {
    const c = store.pedir({ origen: 'agente', tipo: 'decision', categoria: 'enviar', enCola: true, titulo: 'x', resumen: 'x', huella: 'decision:b' })
    expect(store.resolver(c.id, 'otro', {}).ok).toBe(false)
    const d = store.pedir({ origen: 'agente', tipo: 'decision', categoria: 'enviar', enCola: true, titulo: 'y', resumen: 'y', huella: 'decision:c' })
    expect(store.resolver(d.id, 'permitir').ok).toBe(true)
    expect(store.usarDecision(d.id, 'pagar')).toBeNull()      // un Sí de enviar no paga
    for (let i = 0; i < USOS_DECISION; i++) expect(store.usarDecision(d.id, 'enviar')).not.toBeNull()
    expect(store.usarDecision(d.id, 'enviar')).toBeNull()     // tope de usos
    const o = store.resolver(c.id, 'otro', { comentario: 'mándaselo a Mengano' })
    expect(o.ok && o.confirmacion).toMatchObject({ estado: 'rechazada', respuesta: 'otro', comentario: 'mándaselo a Mengano' })
  })

  it('minutos que el sistema esperó: suma lo que cada tarjeta estuvo abierta dentro del día', () => {
    let ahora = Date.parse('2026-11-03T15:00:00Z')
    const s = new Confirmaciones(new Database(':memory:'), () => ahora)
    const a = s.pedir({ origen: 'manos', categoria: 'enviar', resumen: 'a', huella: 'h1' })
    ahora += 12 * 60_000
    s.resolver(a.id, 'permitir')
    s.pedir({ origen: 'agente', tipo: 'decision', categoria: 'pagar', enCola: true, resumen: 'b', huella: 'h2' })
    ahora += 30 * 60_000
    const v = ventanaDelDia('2026-11-03')
    expect(s.esperaEntre(v.desde, ahora)).toEqual({ minutos: 42, tarjetas: 2, abiertas: 1 })
  })

  it('el mensaje que vuelve a la conversación dice Sí, No u Otro con lo que hay que hacer', () => {
    const c = store.pedir({ origen: 'agente', tipo: 'decision', categoria: 'enviar', enCola: true, titulo: 'Mandarle a Juan el resumen', resumen: 'x', huella: 'decision:d' })
    const si = store.resolver(c.id, 'permitir')
    expect(si.ok && mensajeRetomar(si.confirmacion)).toMatch(new RegExp(`dijo SÍ.*decision: "${c.id}"`, 's'))
    const e = store.pedir({ origen: 'agente', tipo: 'decision', categoria: 'enviar', enCola: true, titulo: 'z', resumen: 'z', huella: 'decision:e' })
    const otro = store.resolver(e.id, 'otro', { comentario: 'mejor por correo' })
    expect(otro.ok && mensajeRetomar(otro.confirmacion)).toMatch(/eligió OTRO.*mejor por correo/)
    expect(avisoDeTarjeta(c).body).toMatch(/Sin tu toque no sale/)
  })
})

describe('bandeja: decisiones atadas a una hora (3 nov 2026)', () => {
  const ZONA = 'America/Mexico_City'
  const ahora = Date.parse('2026-11-04T15:14:00Z') // 09:14 en CDMX

  it('expira entiende «13:00» de hoy, la fecha civil y la ISO con zona; lo pasado o ilegible no vale', () => {
    expect(expiraDe('13:00', ahora, ZONA)).toBe(Date.parse('2026-11-04T19:00:00Z'))
    expect(expiraDe('2026-11-04T13:00', ahora, ZONA)).toBe(Date.parse('2026-11-04T19:00:00Z'))
    expect(expiraDe('2026-11-04T19:00:00Z', ahora, ZONA)).toBe(Date.parse('2026-11-04T19:00:00Z'))
    expect(expiraDe(ahora + 60_000, ahora, ZONA)).toBe(ahora + 60_000)
    expect(expiraDe('08:00', ahora, ZONA)).toBeUndefined()
    expect(expiraDe('mañana', ahora, ZONA)).toBeUndefined()
  })

  it('vence sola al pasar su hora: sale de pendientes, queda en el historial como vencida y ya no se puede aprobar ni usar', () => {
    let t = ahora
    const s = new Confirmaciones(new Database(':memory:'), () => t)
    const c = s.pedir({ origen: 'agente', tipo: 'decision', categoria: 'enviar', enCola: true, titulo: 'Confirmarle a Fulano la llamada de la 1 pm', resumen: 'x', huella: 'decision:hora', expira: t + 3_600_000 })
    expect(c.expira).toBe(t + 3_600_000)
    t += 3_600_000 + 1
    expect(s.pendientes().map(x => x.id)).not.toContain(c.id)
    expect(s.get(c.id)?.estado).toBe('vencida')
    expect(s.resolver(c.id, 'permitir').ok).toBe(false)
    expect(s.usarDecision(c.id, 'enviar')).toBeNull()
    expect(s.resueltasDesde(ahora).map(x => x.id)).toContain(c.id)
  })

  it('un Sí no estira su hora: la aprobación dura hasta la hora límite, no 30 min más', () => {
    let t = ahora
    const s = new Confirmaciones(new Database(':memory:'), () => t)
    const c = s.pedir({ origen: 'agente', tipo: 'decision', categoria: 'enviar', enCola: true, titulo: 'x', resumen: 'x', huella: 'decision:si', expira: t + 5 * 60_000 })
    const r = s.resolver(c.id, 'permitir')
    expect(r.ok && r.confirmacion.expira).toBe(ahora + 5 * 60_000)
    t += 6 * 60_000
    expect(s.usarDecision(c.id, 'enviar')).toBeNull()
  })

  it('por la ruta: --expira llega, la tarjeta dice cuándo vence y la vista lista las vencidas de hoy', async () => {
    const p = await http('/decisiones/pedir', { titulo: 'Llamar a Zutano a la 1 pm', categoria: 'enviar', expira: Date.now() + 60_000 })
    expect(p.status).toBe(200)
    expect(p.j.vence).toBeGreaterThan(Date.now())
    expect((await http('/decisiones')).j.pendientes[0]).toMatchObject({ id: p.j.id, vence: p.j.vence, unaPorUna: true })
    expect((await http('/decisiones/pedir', { titulo: 'x', expira: 'ayer' })).status).toBe(400)
    db.prepare('UPDATE confirmaciones SET expira = ? WHERE id = ?').run(Date.now() - 1, p.j.id)
    const v = (await http('/decisiones')).j
    expect(v.pendientes.map((x: { id: string }) => x.id)).not.toContain(p.j.id)
    expect(v.vencidasHoy.map((x: { id: string }) => x.id)).toContain(p.j.id)
  })

  it('«Sí a todas» nunca contacta personas ni paga: esas van una por una', async () => {
    const ids = await Promise.all([['a', 'otra'], ['b', 'enviar'], ['c', 'pagar'], ['d', 'borrar']].map(async ([t, categoria]) => (await http('/decisiones/pedir', { titulo: `Lote ${t}`, categoria })).j.id))
    const r = await http('/decisiones/lote', { ids, respuesta: 'si' }, true)
    expect(r.j.hechas.map((x: { titulo: string }) => x.titulo).sort()).toEqual(['Lote a', 'Lote d'])
    expect(r.j.errores.map((x: { error: string }) => x.error)).toEqual(['Contactar y pagar van una por una.', 'Contactar y pagar van una por una.'])
    expect((await http('/decisiones/resolver', { id: ids[1], respuesta: 'si' }, true)).j.respuesta).toBe('si')
  })
})

describe('bandeja: las rutas', () => {
  it('la vista previa viaja con la tarjeta (cola de publicación, 7 nov); lo que no es imagen se ignora', async () => {
    const p = await http('/decisiones/pedir', { titulo: 'Publicar en @canal: «Un video» (video largo)', categoria: 'publicar', imagen: '/tmp/miniatura-a.png' })
    expect((await http(`/decisiones/${p.j.id}`)).j).toMatchObject({ categoria: 'publicar', imagen: '/tmp/miniatura-a.png' })
    for (const imagen of ['/tmp/video.mp4', 'relativa.png', '/tmp/../etc/x.png', 42]) {
      const q = await http('/decisiones/pedir', { titulo: `Publicar otra (${String(imagen)})`, categoria: 'publicar', imagen })
      expect((await http(`/decisiones/${q.j.id}`)).j.imagen).toBeUndefined()
    }
  })

  it('pedir con el token; decidir solo con el secreto de la web', async () => {
    const p = await http('/decisiones/pedir', { titulo: 'Pagar el VPS de la beta (6 USD)', recomienda: 'si', recomendacion: 'Lo pediste para hoy', categoria: 'pagar', sesion: process.env.CLAUDE_CODE_SESSION_ID })
    expect(p.status).toBe(200)
    expect(p.j.conversacion).toBe(true)   // la sesión de Claude se ligó a su conversación
    expect((await http('/decisiones/resolver', { id: p.j.id, respuesta: 'si' })).status).toBe(403)
    expect((await http('/autonomia/politica', { preset: 'cauteloso' })).status).toBe(403)
    const v = await http('/decisiones')
    expect(v.j.pendientes[0]).toMatchObject({ id: p.j.id, titulo: 'Pagar el VPS de la beta (6 USD)', recomienda: 'si' })
    expect((await http('/decisiones/resolver', { id: p.j.id, respuesta: 'si' }, true)).j.respuesta).toBe('si')
    expect((await http('/decisiones')).j.pendientes).toHaveLength(0)
  })

  it('en lote: Sí a varias de un toque; «Otro» va de una en una', async () => {
    const ids = await Promise.all(['a', 'b', 'c'].map(async t => (await http('/decisiones/pedir', { titulo: `Decisión ${t}`, categoria: 'otra' })).j.id))
    expect((await http('/decisiones/lote', { ids, respuesta: 'otro' }, true)).status).toBe(400)
    const r = await http('/decisiones/lote', { ids, respuesta: 'si' }, true)
    expect(r.j.hechas).toHaveLength(3)
  })

  it('la vista trae la métrica de espera, «Lo que hice solo» y la política', async () => {
    anotarHechoSolo({ clase: 'configurar', que: '«Create key» en abliteration.ai', donde: 'abliteration.ai' })
    const v = vistaBandeja(store)
    expect(v.hechoSolo.hoy[0].que).toMatch(/Create key/)
    expect(v.espera.hoy).toMatchObject({ minutos: 0 })
    expect(v.politica.preset).toBe('piloto')
  })

  it('la sesión de Claude lleva a la conversación de la app', () => {
    expect(scopeDeSesion(db, process.env.CLAUDE_CODE_SESSION_ID)).toEqual({ owner: 'dueno', account: 'default', conversationId: 'conv-1' })
    expect(scopeDeSesion(db, 'no-es-uuid')).toBeNull()
  })
})

describe('el toque reemplaza a la cita (instalación original)', () => {
  it('mandar un WhatsApp pide toque: llega la tarjeta, Sí, y el mensaje sale', async () => {
    const hechas: PedidoActuar[] = []
    const f = new Freno(chat(hechas, WHATSAPP))
    await f.actuar({ app: 'WhatsApp', accion: 'escribir', texto: 'Hola Juan, te mando el resumen' })
    const tocado = tocarCuandoLlegue('si')
    const r = await f.actuar({ app: 'WhatsApp', accion: 'tecla', tecla: 'return' })
    const id = await tocado
    expect(r.ok).toBe(true)
    expect(r.freno?.tarjeta).toBe(true)
    expect(hechas.map(h => h.accion)).toEqual(['escribir', 'tecla'])
    const c = store.get(id)!
    expect(c.titulo).toMatch(/WhatsApp.*Hola Juan/)              // la tarjeta muestra qué se envía
    expect(c.conversacion).toBe('conv-1')                       // y sabe a qué conversación volver
  })

  it('si Daniel dice No, no sale; si no contesta, tampoco (queda en su bandeja)', async () => {
    const hechas: PedidoActuar[] = []
    const f = new Freno(chat(hechas, WHATSAPP))
    const no = tocarCuandoLlegue('no')
    const r1 = await f.actuar({ app: 'WhatsApp', accion: 'tecla', tecla: 'return' })
    await no
    expect(r1.efecto).toBe('bloqueado')
    process.env.ARBRAIN_CONFIRMAR_ESPERA_S = '1'
    const r2 = await f.actuar({ app: 'WhatsApp', accion: 'tecla', tecla: 'return', modificadores: ['cmd'] })
    expect(r2.efecto).toBe('bloqueado')
    expect(r2.detalle).toMatch(/cola|espera/)
    expect(hechas).toHaveLength(0)
    expect(store.pendientes().some(c => c.estado === 'en_cola')).toBe(true)
  }, 15_000)

  it('pagar pide toque (y con «Otro» no se paga)', async () => {
    const hechas: PedidoActuar[] = []
    const f = new Freno(chat(hechas, PAGAR))
    const otro = tocarCuandoLlegue('otro', 'espera a que llegue la factura')
    const r = await f.actuar({ app: 'Tienda', accion: 'click', ref: 'e1' })
    await otro
    expect(r.efecto).toBe('bloqueado')
    expect(r.detalle).toMatch(/OTRO.*factura/)
    expect(hechas).toHaveLength(0)
  })

  it('el Sí a una decisión que Levy subió cubre el envío del encargo, sin otra tarjeta', async () => {
    const p = await http('/decisiones/pedir', { titulo: 'Mandarle a Juan el resumen', categoria: 'enviar', recomienda: 'si' })
    await http('/decisiones/resolver', { id: p.j.id, respuesta: 'si' }, true)
    fijarContextoToque({ pedido: 'mándale el resumen a Juan', decisiones: [p.j.id] })
    const hechas: PedidoActuar[] = []
    const r = await new Freno(chat(hechas, WHATSAPP)).actuar({ app: 'WhatsApp', accion: 'tecla', tecla: 'return' })
    expect(r.ok).toBe(true)
    expect(r.detalle).toMatch(new RegExp(p.j.id))
    expect(store.pendientes()).toHaveLength(0)
  })

  it('con la política en «nunca» para pagar, ni tarjeta: no se hace', async () => {
    fijarPolitica('piloto', { pagar: 'nunca' })
    const hechas: PedidoActuar[] = []
    const r = await new Freno(chat(hechas, PAGAR)).actuar({ app: 'Tienda', accion: 'click', ref: 'e1' })
    expect(r.efecto).toBe('bloqueado')
    expect(r.detalle).toMatch(/política/)
    expect(store.pendientes()).toHaveLength(0)
  })

  it('crear la llave API sigue pasando sin cita ni tarjeta', () => {
    const v = frenarWeb({ accion: 'click' }, { tag: 'button', boton_tipo: 'submit', nombre: 'Create key', en_formulario: true, formulario: { busqueda: false, etiqueta: 'Create API key' }, url: 'https://abliteration.ai/console/api-keys' })
    expect(v.pasa).toBe(true)
    expect(store.pendientes()).toHaveLength(0)
  })
})

// 4 nov 2026: «Dudas técnicas o de uso (instalar, actualizar, permisos, teléfono, cómo funciona) en la plataforma: 100 % de
// Levy» (el dueño, 24 oct). El caso real: un alumno trabado 32 h porque su respuesta subió como «contactar».
describe('soporte técnico a la cohorte: el flujo', () => {
  const HILO = 'https://miplataforma.com/community?post=0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a'
  const PERENGANO: PedidoSoporte = {
    url: HILO, persona: 'Perengano', pregunta: 'Ya pegué mi llave de OpenRouter y Levy me dice que espere a que se renueve mi ventana',
    texto: 'Perengano, se resuelve con un clic. Tu Arbrain está en modo «Mi Claude Code»: usa solo tu suscripción y deja tus llaves sin usar a propósito. Para cambiarlo: Ajustes › Llaves → «Usar una llave en su lugar». Levy se reinicia en unos segundos y ya responde con tu llave.',
  }
  const deps = (publicadas: PedidoSoporte[], resultado: ResultadoPublicar = { ok: true, comentario: 'c-nuevo' }) => ({
    pedir: (cuerpo: Record<string, unknown>) => http('/decisiones/pedir', cuerpo),
    publicar: async (p: PedidoSoporte) => { publicadas.push(p); return resultado },
  })
  const hoy = () => leerHechoSolo(diaCivil(Date.now()))
  beforeEach(() => _plataformaParaPruebas({ dominio: 'miplataforma.com', repo: 'github.com/mi-org/', firmado: 'Lo firmaste el 24 oct: «… 100 % de Levy».' }))
  afterEach(() => _plataformaParaPruebas(undefined))

  it('nace en «tocar»: la respuesta técnica sube su tarjeta de contactar, como antes, y no se publica', async () => {
    const publicadas: PedidoSoporte[] = []
    const r = await responderSoporte(PERENGANO, deps(publicadas))
    expect(r.tarjeta).toMatch(/^cf_/)
    expect(r.text).toMatch(/Ajustes › Autonomía/)
    expect(publicadas).toHaveLength(0)
    const [t] = store.pendientes()
    expect(t).toMatchObject({ categoria: 'enviar', persona: 'Perengano', detalle: PERENGANO.texto })
    expect(hoy()).toHaveLength(0)
  })

  it('encendida por la persona: sale sola, sin tarjeta, y queda en «Lo que hice solo» con su enlace', async () => {
    fijarPolitica('piloto', { soporte: 'hacer' }, 'app')
    const publicadas: PedidoSoporte[] = []
    const r = await responderSoporte(PERENGANO, deps(publicadas))
    expect(r.publicada).toBe(true)
    expect(publicadas).toEqual([PERENGANO])
    expect(store.pendientes()).toHaveLength(0)
    const [h] = hoy()
    expect(h).toMatchObject({ clase: 'soporte', donde: 'miplataforma.com', enlace: HILO, origen: 'levy', ref: 'c-nuevo' })
    expect(h.que).toMatch(/^Respondí a Perengano en miplataforma\.com/)
    expect(h.sesion).toBeUndefined()
    // La vista de la app lo trae (hoy) y la política dice que está encendida.
    const v = await http('/decisiones')
    expect(v.j.hechoSolo.hoy[0].enlace).toBe(HILO)
    expect(v.j.politica.vigente.soporte).toBe('hacer')
  })

  it('encendida, pero toca precio, cobranza, una promesa o sale a WhatsApp: tarjeta de contactar, nunca sola', async () => {
    fijarPolitica('piloto', { soporte: 'hacer' }, 'app')
    const publicadas: PedidoSoporte[] = []
    const casos: [string, Partial<PedidoSoporte>][] = [
      ['precio', { pregunta: '¿Cuánto cuesta la siguiente cohorte?', texto: 'Zutano, en Ajustes › Llaves lo ves' }],
      ['cobranza', { texto: 'Zutano, tu segunda parcialidad se cobra el lunes; mientras, reinicia Arbrain' }],
      ['promesa', { texto: 'Zutano, el fundador te llama mañana para instalarlo contigo' }],
      ['WhatsApp', { texto: 'Zutano, mándame tu error por WhatsApp y lo vemos en Arbrain' }],
      ['fuera', { url: 'https://web.whatsapp.com/', texto: 'Zutano, reinicia Arbrain y vuelve a pegar tu llave' }],
    ]
    for (const [nombre, c] of casos) {
      const r = await responderSoporte({ ...PERENGANO, persona: 'Zutano', pregunta: undefined, ...c }, deps(publicadas))
      expect(r.tarjeta, nombre).toMatch(/^cf_/)
      expect(r.text, nombre).toMatch(/es contactar/)
    }
    expect(publicadas).toHaveLength(0)
    expect(hoy()).toHaveLength(0)
  })

  it('si miplataforma.com no la publica, sube la tarjeta con el motivo; si el hilo ya tiene decisión abierta, no apila otra', async () => {
    fijarPolitica('piloto', { soporte: 'hacer' }, 'app')
    const r = await responderSoporte(PERENGANO, deps([], { ok: false, motivo: 'comunidad-publicar-auto: HTTP 500' }))
    expect(r.tarjeta).toMatch(/^cf_/)
    expect(store.get(r.tarjeta!)?.recomendacion).toMatch(/No se publicó sola: comunidad-publicar-auto: HTTP 500/)
    const r2 = await responderSoporte({ ...PERENGANO, url: `${HILO.slice(0, -1)}0` }, deps([], { ok: false, conflicto: true, motivo: 'HTTP 409' }))
    expect(r2.tarjeta).toBeUndefined()
    expect(r2.text).toMatch(/decisión abierta/)
    expect(store.pendientes()).toHaveLength(1)
    expect(hoy()).toHaveLength(0)
  })

  it('un agente no se enciende el soporte: cambiar la política exige el secreto de la web', async () => {
    const r = await http('/autonomia/politica', { preset: 'piloto', ajustes: { soporte: 'hacer' } })
    expect(r.status).toBe(403)
    expect((await http('/autonomia/politica')).j.vigente.soporte).toBe('tocar')
    const ok = await http('/autonomia/politica', { preset: 'piloto', ajustes: { soporte: 'hacer' } }, true)
    expect(ok.j.vigente.soporte).toBe('hacer')
    expect(ok.j.clases.find((c: { id: string }) => c.id === 'soporte').firmado).toMatch(/24 oct/)
  })

  it('sin la marca de soporte, una decisión a una persona sigue siendo tarjeta aunque la clase esté encendida', async () => {
    fijarPolitica('piloto', { soporte: 'hacer' }, 'app')
    const p = await http('/decisiones/pedir', { titulo: 'Responderle a Perengano', categoria: 'enviar', detalle: PERENGANO.texto })
    expect(p.j.id).toMatch(/^cf_/)
    expect(p.j.hazlo).toBeUndefined()
  })
})
