/**
 * Las manos en el modo Autónomo y los arreglos de fricción de 0.2.15 (docs/builds/autonomia-alumno-2026-10-29):
 *   A4  la huella de la confirmación I8 no lleva `ref` ni `pid`: un clic tardío vale para el reintento;
 *   A5  la cita sale del chat: lo que la persona escribió hace poco y nombra la acción desbloquea el freno sin que el
 *       modelo la copie; un sitio que nombró («WhatsApp») ya no pide el clic de «sitio nuevo»;
 *   Autónomo: lo que pidió corre sin I8; lo que no pidió va a tarjeta; dinero, lo que exige observar y las ventanas de la
 *       persona siguen bloqueados; R5 (grupo o lista) y R6 (destino que no salió de su mensaje tras leer la pantalla).
 * Nada toca la pantalla: adaptador y daemon falsos.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _politicaParaPruebas, citaDelChat, esDatoPropio, modoManos, registrarVoz, type ModoManos } from './politica.js'
import { datoEnVoz, datoSensible, envioMasivo, Freno, frenar } from './freno.js'
import { _dominiosNavegacionParaPruebas, frenarNavegacion, hostNombradoPorLaPersona, juzgarUrl } from './juicio-url.js'
import type { Adaptador, ContextoAccion, PedidoActuar } from './contrato.js'

const previo = { ...process.env }
let srv: Server
const pedidas: Array<{ herramienta: string; partes: unknown[]; motivo?: string }> = []
let responder: 'pendiente' | 'permitida' = 'pendiente'

beforeEach(async () => {
  srv = createServer(async (req, res) => {
    let cuerpo = ''; for await (const t of req) cuerpo += t
    const b = cuerpo ? JSON.parse(cuerpo) : {}
    const json = (x: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(x)) }
    if (req.url === '/confirmaciones/consumir') return json({ ok: responder === 'permitida' })
    if (req.url === '/confirmaciones/pedir') { pedidas.push({ herramienta: String(b.herramienta), partes: b.partes, motivo: b.motivo }); return json({ id: 'cf_0123456789ab', estado: responder }) }
    if (req.url?.startsWith('/confirmaciones/cf_')) return json({ estado: responder })
    res.writeHead(404); res.end()
  })
  await new Promise<void>(ok => srv.listen(0, '127.0.0.1', () => ok()))
  process.env.ARBRAIN_EDICION = 'cliente'
  process.env.ARBRAIN_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'arbrain-aut-manos-'))
  process.env.MC_SERVER_PORT = String((srv.address() as AddressInfo).port)
  process.env.ARBRAIN_PASE_AGENTE = 'pase-prueba'
  process.env.ARBRAIN_CONFIRMAR_ESPERA_S = '0.2'
  _dominiosNavegacionParaPruebas().clear()
  pedidas.length = 0
  responder = 'pendiente'
})
afterEach(async () => {
  await new Promise<void>(ok => srv.close(() => ok()))
  for (const k of Object.keys(process.env)) if (!(k in previo)) delete process.env[k]
  Object.assign(process.env, previo)
})

const modo = (m: ModoManos, voz: string[] = []) => { _politicaParaPruebas({ fuenteLocal: true, modo: m }); for (const v of voz) registrarVoz(v, { forzar: true }) }
const W = 42, PID = 7
const WA: ContextoAccion = { bundle: 'com.google.chrome', app: 'Google Chrome', url: 'https://web.whatsapp.com/', plataforma: 'macos', dentro_de: ['web'], elemento: { rol: 'AXTextArea', titulo: 'Escribe un mensaje', placeholder: 'Escribe un mensaje' } }
const enter: PedidoActuar = { app: 'com.google.chrome', pid: PID, ventana: W, accion: 'tecla', ref: 'e3', tecla: 'return' }

/** Chrome falso en WhatsApp Web: `contexto` devuelve el elemento del ref. */
function chrome(elementos: Record<string, ContextoAccion['elemento']>, extra: Partial<ContextoAccion> = {}): Adaptador & { actuo: PedidoActuar[] } {
  const actuo: PedidoActuar[] = []
  return {
    nombre: 'falso', actuo,
    async observar() { return { pid: PID, ventana: W, app: 'Google Chrome', url: 'https://web.whatsapp.com/', texto: 'WhatsApp · Chats · Fulano (Tú)', elementos: Object.entries(elementos).map(([ref, e]) => ({ ref, rol: e!.rol, etiqueta: e!.titulo })) } },
    async actuar(p: PedidoActuar) { actuo.push(p); return { ok: true, efecto: 'confirmado' as const } },
    async contexto(o: { ref?: string }) { return { ...WA, ...extra, ...(o.ref && elementos[o.ref] ? { elemento: elementos[o.ref] } : {}) } },
    async apps() { return [{ nombre: 'Google Chrome', bundle: 'com.google.chrome', pid: PID, activa: false }] },
    async ventanas() { return [{ id: W, pid: PID, app: 'Google Chrome', marco: { x: 0, y: 0, w: 1200, h: 800 }, en_pantalla: true }] },
    async abrir() { return { pid: PID, ventanas: [] } },
    async verificar() { return { ok: true } }, async cursor() { return null }, async salud() { return { ok: true } }, async cerrar() {},
  } as unknown as Adaptador & { actuo: PedidoActuar[] }
}
const ELEMENTOS = { e1: { rol: 'AXTextArea', titulo: 'Buscar un chat o iniciar uno nuevo', placeholder: 'Buscar un chat o iniciar uno nuevo' }, e3: { rol: 'AXTextArea', titulo: 'Escribe un mensaje', placeholder: 'Escribe un mensaje' }, e4: { rol: 'AXButton', titulo: 'Enviar' } }

describe('A5: la cita sale del chat', () => {
  it('citaDelChat: la frase reciente de la persona que nombra la acción (cualquier largo desde 0.2.16); «si» no', () => {
    modo('preguntar', ['si', 'envíame un mensaje de WhatsApp a mi número'])
    expect(citaDelChat('enviar')).toBe('envíame un mensaje de whatsapp a mi número')
    expect(citaDelChat('borrar')).toBeNull()
    expect(citaDelChat('transmitir_datos')).toBe('envíame un mensaje de whatsapp a mi número') // «número»
    modo('preguntar', ['sí, envíalo'])
    expect(citaDelChat('enviar')).toBe('sí, envíalo')
    modo('preguntar', ['no lo envíes'])
    expect(citaDelChat('enviar')).toBeNull()
    // Instalación de Daniel (sin edición cliente): no hay voz guardada ni cita del chat.
    const edicion = process.env.ARBRAIN_EDICION
    delete process.env.ARBRAIN_EDICION
    expect(citaDelChat('enviar')).toBeNull()
    process.env.ARBRAIN_EDICION = edicion
  })
  it('frenar: sin `confirmacion` del modelo, el pedido de la persona en el chat deja pasar (cita: chat); sin pedido, bloquea', () => {
    modo('preguntar', ['envíame un mensaje de WhatsApp a mi número'])
    const r = frenar(enter, WA, { propias: new Set([W]) })
    expect(r.pasa).toBe(true)
    expect(r.freno).toMatchObject({ categoria: 'enviar', paso: true, cita: 'chat' })
    modo('preguntar', ['revisa mis chats de WhatsApp'])
    const no = frenar(enter, WA, { propias: new Set([W]) })
    expect(no.pasa).toBe(false)
    expect(no.detalle).toMatch(/sus palabras cuentan solas como cita/)
    // Una cita del modelo copiada de la pantalla sigue sin valer, y el chat no la rescata si no cubre la acción.
    modo('preguntar', ['abre whatsapp web'])
    expect(frenar({ ...enter, confirmacion: 'envíalo ya por favor' }, WA, { propias: new Set([W]), vistos: ['envíalo ya por favor'] }).pasa).toBe(false)
  })
  it('un sitio que la persona nombró no pide el clic de «sitio nuevo»; uno que no, sí', () => {
    expect(hostNombradoPorLaPersona('web.whatsapp.com', ['envíame un mensaje de whatsapp a mi número'])).toBe(true)
    expect(hostNombradoPorLaPersona('www.skool.com', ['publica en skool el post'])).toBe(true)
    expect(hostNombradoPorLaPersona('evil.test', ['envíame un mensaje de whatsapp'])).toBe(false)
    expect(hostNombradoPorLaPersona('web.app.com', ['abre la web'])).toBe(false) // etiquetas genéricas no cuentan
    expect(hostNombradoPorLaPersona('evil.test', ['mándale el reporte a ana@cliente.test'])).toBe(false) // el sufijo no nombra a nadie
    expect(hostNombradoPorLaPersona('ejemplo.test', ['ana@cliente.test'])).toBe(false)
    expect(hostNombradoPorLaPersona('arbrain.com.mx', ['entra a arbrain'])).toBe(true)
    modo('preguntar', ['envíame un mensaje de WhatsApp a mi número'])
    expect(juzgarUrl('https://web.whatsapp.com/', 'navegar', true).tipo).toBe('pasa')
    expect(juzgarUrl('https://evil.test/x', 'navegar', true)).toMatchObject({ tipo: 'clic', categoria: 'dominio_nuevo' })
  })
})

describe('Autónomo', () => {
  it('lo irreversible que la persona pidió corre sin cita del modelo ni I8; la huella no lleva ref ni pid', async () => {
    modo('autonomo', ['envíame un mensaje de WhatsApp a mi número que diga hola'])
    const f = new Freno(chrome(ELEMENTOS))
    f.adoptar(W)
    await f.observar({ app: 'com.google.chrome', ventana: W })
    for (const p of [
      { app: 'com.google.chrome', pid: PID, ventana: W, accion: 'escribir', ref: 'e1', texto: 'Fulano' },
      { app: 'com.google.chrome', pid: PID, ventana: W, accion: 'escribir', ref: 'e3', texto: 'Hola' },
      enter,
      { app: 'com.google.chrome', pid: PID, ventana: W, accion: 'click', ref: 'e4' },
    ] as PedidoActuar[]) {
      const r = await f.actuar(p)
      expect(r.ok, JSON.stringify(p)).toBe(true)
    }
    expect(pedidas).toHaveLength(0)
    expect(f.interno.nombre).toBe('falso')
  })
  it('lo que no pidió va a tarjeta (I8 sin cita) y, con el clic, corre; la tarjeta dice que no lo pidió', async () => {
    modo('autonomo', ['revisa mis chats de WhatsApp y dime si hay algo urgente'])
    const f = new Freno(chrome(ELEMENTOS))
    f.adoptar(W)
    await f.observar({ app: 'com.google.chrome', ventana: W })
    const r = await f.actuar(enter)
    expect(r.ok).toBe(false)
    expect(r.detalle).toMatch(/CONFIRMACIÓN HUMANA/)
    expect(pedidas).toHaveLength(1)
    expect(pedidas[0].motivo).toMatch(/no lo pediste en el chat/)
    expect(pedidas[0].partes).toHaveLength(5) // A4: app, motivo, elemento, texto, teclas; sin ref ni pid
    expect(pedidas[0].partes).not.toContain('e3')
    expect(pedidas[0].partes).not.toContain(PID)
    responder = 'permitida'
    expect((await f.actuar(enter)).ok).toBe(true)
  })
  it('dinero, lo que exige observar y las pestañas de la persona siguen bloqueados, sin tarjeta', async () => {
    modo('autonomo', ['paga la factura de hoy'])
    const f = new Freno(chrome({ ...ELEMENTOS, e9: { rol: 'AXButton', titulo: 'Pagar ahora' } }))
    f.adoptar(W)
    const pagar = await f.actuar({ app: 'com.google.chrome', pid: PID, ventana: W, accion: 'click', ref: 'e9' })
    expect(pagar.ok).toBe(false)
    expect(pagar.detalle).toMatch(/FRENO \(pagar\)/)
    // Una pestaña de la persona: solo si la nombra en el chat; «envíame un mensaje» no la nombra.
    modo('autonomo', ['envíame un mensaje de WhatsApp'])
    const ajena = await f.actuar({ ...enter, ventana: 99 })
    expect(ajena.ok).toBe(false)
    expect(ajena.detalle).toMatch(/pestana_de_daniel/)
    const sinContexto = frenar({ app: 'com.google.chrome', pid: PID, ventana: W, accion: 'click', ref: 'zz' }, { ...WA, elemento: undefined }, { propias: new Set([W]), modo: 'autonomo' })
    expect(sinContexto.pasa).toBe(false)
    // Un número de tarjeta en un formulario: dinero, bloqueado aunque la persona lo haya escrito.
    modo('autonomo', ['pon mi tarjeta 4111 1111 1111 1111'])
    const tarjeta = frenar({ app: 'com.google.chrome', pid: PID, ventana: W, accion: 'escribir', ref: 'e3', texto: '4111 1111 1111 1111' }, { ...WA, elemento: { rol: 'AXTextField', titulo: 'Número de tarjeta' } }, { propias: new Set([W]), modo: 'autonomo' })
    expect(tarjeta.pasa).toBe(false)
    expect(pedidas).toHaveLength(0)
  })
  it('R5: enviar en un grupo o lista enseña la tarjeta aunque la persona pidiera enviar', async () => {
    modo('autonomo', ['mándale al grupo de la cohorte el aviso'])
    expect(envioMasivo({ ...WA, ancestros: ['AXGroup «Grupo Cohorte Arbrain · 12 participantes»'] })).toMatch(/grupo|participantes/i)
    const f = new Freno(chrome(ELEMENTOS, { ancestros: ['AXGroup «Grupo Cohorte Arbrain · 12 participantes»'] }))
    f.adoptar(W)
    const r = await f.actuar(enter)
    expect(r.ok).toBe(false)
    expect(pedidas[0]?.motivo).toMatch(/grupo o lista/)
  })
  it('R6: tras leer la pantalla, un correo o teléfono que no salió del mensaje enseña la tarjeta; el que sí salió, corre', async () => {
    expect(datoEnVoz('+52 1 443 555 0101', ['envíame un whatsapp al +52 1 443 555 0101'])).toBe(true)
    expect(datoEnVoz('+34 600 000 999', ['envíame un whatsapp al +52 1 443 555 0101'])).toBe(false)
    expect(datoEnVoz('ana@cliente.test', ['mándale el reporte a ana@cliente.test'])).toBe(true)
    expect(datoEnVoz('Hola, prueba', ['escribe hola, prueba'])).toBe(true)
    modo('autonomo', ['envíame un mensaje de WhatsApp a mi número'])
    const f = new Freno(chrome(ELEMENTOS))
    f.adoptar(W)
    await f.observar({ app: 'com.google.chrome', ventana: W })
    const ajeno = await f.actuar({ app: 'com.google.chrome', pid: PID, ventana: W, accion: 'escribir', ref: 'e1', texto: '+34 600 000 999' })
    expect(ajeno.ok).toBe(false)
    expect(pedidas[0]?.motivo).toMatch(/destino que no salió de tu mensaje|no lo pediste/)
    modo('autonomo', ['envíame un whatsapp al +34 600 000 999'])
    const propio = await f.actuar({ app: 'com.google.chrome', pid: PID, ventana: W, accion: 'escribir', ref: 'e1', texto: '+34 600 000 999' })
    expect(propio.ok).toBe(true)
  })
  it('navegar: páginas nuevas sin clic; una URL con efecto corre si la persona la pidió y si no, tarjeta', async () => {
    modo('autonomo', ['entra a mi cuenta y cierra sesión'])
    expect(await frenarNavegacion('https://sitio-nuevo.test/x', 'navegar', undefined)).toEqual({ ok: true })
    expect(pedidas).toHaveLength(0)
    expect(await frenarNavegacion('https://sitio-nuevo.test/logout', 'navegar', undefined)).toEqual({ ok: true })
    modo('autonomo', ['abre mi cuenta'])
    const r = await frenarNavegacion('https://sitio-nuevo.test/logout', 'navegar', undefined)
    expect(r.ok).toBe(false)
    expect(pedidas.at(-1)?.herramienta).toBe('manos:navegar')
    expect(modoManos()).toBe('autonomo')
  })
  it('A11: en Autónomo computer use queda como lo dejó la persona entre aperturas; en los demás modos nace apagado', async () => {
    const { fijarInterruptor, leerInterruptor, marcarFuenteLocal } = await import('./politica.js')
    _politicaParaPruebas({ fuenteLocal: true, modo: 'autonomo' })
    fijarInterruptor(true, 'app')
    // Nueva apertura del daemon: la memoria nace vacía y el archivo dice «encendido».
    _politicaParaPruebas({ fuenteLocal: true, modo: 'autonomo' })
    expect(leerInterruptor()?.encendido).toBe(true)
    _politicaParaPruebas({ fuenteLocal: true, modo: 'carpeta' })
    expect(leerInterruptor()).toBeNull()
    marcarFuenteLocal()
  })
  it('en «preguntar» y «carpeta» sigue el I8 de siempre, con la cita del chat', async () => {
    modo('carpeta', ['envíame un mensaje de WhatsApp a mi número'])
    const f = new Freno(chrome(ELEMENTOS))
    f.adoptar(W)
    const r = await f.actuar(enter)
    expect(r.ok).toBe(false)
    expect(r.detalle).toMatch(/quedó en su cola/)
    expect(pedidas).toHaveLength(1)
    responder = 'permitida'
    expect((await f.actuar(enter)).ok).toBe(true)
  })
})

describe('A3: una pendiente de manos que nadie contesta pasa a la cola', () => {
  it('al dejar de esperar, el proceso de manos la encola por HTTP (el daemon la muestra en «Mientras no estabas»)', async () => {
    const { confirmacionHumana } = await import('./confirmacion-humana.js')
    const llamadas: string[] = []
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url); llamadas.push(u.replace(/^http:\/\/[^/]+/, ''))
      const json = (x: unknown) => new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json' } })
      if (u.endsWith('/confirmaciones/consumir')) return json({ ok: false })
      if (u.endsWith('/confirmaciones/pedir')) return json({ id: 'cf_0123456789ab', estado: 'pendiente' })
      if (u.endsWith('/confirmaciones/encolar')) return json({ id: JSON.parse(String(init?.body)).id, estado: 'en_cola' })
      return json({ estado: 'pendiente' })
    }) as typeof fetch
    const r = await confirmacionHumana({ categoria: 'enviar', resumen: 'Enviar', herramienta: 'manos:click', partes: ['Chrome', 'enviar', 'Enviar', null, null] }, { esperaMs: 30, cadaMs: 10, fetcher, cliente: true })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.detalle).toMatch(/quedó en su cola/)
    expect(llamadas.at(-1)).toBe('/confirmaciones/encolar')
  })
})

describe('A13: su propio número o correo (Ajustes › Tus datos) no es «transmitir datos»', () => {
  const propios = ['+524435550101', 'yo@correo.test']
  it('compara teléfonos por sus últimos 10 dígitos y correos tal cual; un dato ajeno no cuenta', () => {
    expect(esDatoPropio('+52 1 443 555 0101', propios)).toBe(true)
    expect(esDatoPropio('443 555 0101', propios)).toBe(true)
    expect(esDatoPropio('YO@correo.test', propios)).toBe(true)
    expect(esDatoPropio('+34 600 000 999', propios)).toBe(false)
    expect(esDatoPropio('443 555 0101 y +34 600 000 999', propios)).toBe(false)
    expect(esDatoPropio('hola', propios)).toBe(false)
    expect(esDatoPropio('443 555 0101', [])).toBe(false)
  })
  it('«mándame un WhatsApp a mi número» sin decir el número: el suyo corre en Autónomo sin tarjeta; uno ajeno sigue en R6', async () => {
    _politicaParaPruebas({ fuenteLocal: true, modo: 'autonomo', propios })
    registrarVoz('envíame un mensaje de WhatsApp a mi número', { forzar: true })
    expect(datoSensible('+52 443 555 0101', WA)).toBeUndefined()
    expect(datoSensible('+34 600 000 999', WA)).toMatch(/teléfono/)
    const f = new Freno(chrome(ELEMENTOS))
    f.adoptar(W)
    await f.observar({ app: 'com.google.chrome', ventana: W })
    expect((await f.actuar({ app: 'com.google.chrome', pid: PID, ventana: W, accion: 'escribir', ref: 'e1', texto: '+52 443 555 0101' })).ok).toBe(true)
    expect(pedidas).toHaveLength(0)
    expect((await f.actuar({ app: 'com.google.chrome', pid: PID, ventana: W, accion: 'escribir', ref: 'e1', texto: '+34 600 000 999' })).ok).toBe(false)
    expect(pedidas[0]?.motivo).toMatch(/destino que no salió de tu mensaje|no lo pediste/)
  })
  it('la instalación de Daniel no cambia: fuera de la edición cliente no hay datos propios', () => {
    delete process.env.ARBRAIN_EDICION
    _politicaParaPruebas({ fuenteLocal: true, modo: 'autonomo', propios })
    expect(datoSensible('+52 443 555 0101', WA)).toMatch(/teléfono/)
  })
})
