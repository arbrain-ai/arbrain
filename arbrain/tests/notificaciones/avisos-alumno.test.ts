// Avisos de Levy en el teléfono del alumno (v0.2.18, 31 oct 2026; docs/builds/avisos-telefono-alumno-2026-10-31/REPORTE.md).
// Llaves por instalación, rutas (sesión vs token del daemon, nunca cruza instalaciones) y textos. Sin red: el envío es
// falso; las «instalaciones» son dos carpetas de base local en /tmp con su propio token.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import {
  avisoRespuestaLarga, bearerDelDaemon, crearTope, debeAvisarRespuesta, entregarAvisoAlumno, rutaPropia, rutaSendAlumno,
  TOPE_AVISOS, UMBRAL_RESPUESTA_LARGA_MS, validarAviso, vistaPrevia, VENTANA_REPETIDO_MS, VENTANA_TOPE_MS,
} from '../../src/features/notifications/lib/avisosAlumno'
import { altaSuscripcion, crearLimitador, estadoSuscripcion, payloadPrueba, type AlmacenPush } from '../../src/features/notifications/lib/pushServidor'
import { almacenAlumno, MAX_PUSH_LOG_LOCAL } from '../../src/features/notifications/lib/almacenSupabase'
import { estadoPush, resumenEstado, type EntornoPush } from '../../src/features/notifications/lib/soportePush'
import { clienteLocal } from '../../src/lib/base-local/consulta'
import { almacenArchivos } from '../../src/lib/base-local/archivos'
import { apiPermitidaEnCliente } from '../../src/lib/edicion'
import { decidirCliente } from '../../src/lib/proxy-cliente'
import { clavePublicaVapid, sujetoVapid, SUJETO_VAPID_CLIENTE } from '../../src/features/notifications/lib/vapid'
import { llavesVapidDe, llavesVapidNuevas, llavesVapidValidas, PROHIBIDAS, rutasDe } from '../../scripts/servidor/rutas.mjs'
import { PRELUDIO_WEB } from '../../scripts/servidor/preludio-web.mjs'

const raiz = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const webpush = createRequire(import.meta.url)('web-push') as { setVapidDetails(s: string, pub: string, priv: string): void; generateRequestDetails(sub: unknown, p: string): { headers: Record<string, string> } }
const DUENO = '00000000-0000-4000-8000-000000000001'
const sub = (n: string) => ({ endpoint: `https://web.push.apple.com/falso-${n}`, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } })
const T = 'a'.repeat(64)

/** Una instalación del alumno: su base local en su carpeta y su token. */
function instalacion(token: string) {
  const dir = mkdtempSync(join(tmpdir(), 'avisos-alumno-'))
  const db = clienteLocal(almacenArchivos(dir)) as never
  return { dir, token, almacen: almacenAlumno(db), db: db as unknown as { from(t: string): { select(c: string): Promise<{ data: unknown[] | null }> } } }
}

function enviador() {
  const enviados: { endpoint: string; payload: Record<string, unknown> }[] = []
  return { enviados, enviar: async (s: { endpoint: string }, p: string) => { enviados.push({ endpoint: s.endpoint, payload: JSON.parse(p) }) } }
}

const estadoNuevo = () => ({ repetidos: crearLimitador(VENTANA_REPETIDO_MS), tope: crearTope(TOPE_AVISOS, VENTANA_TOPE_MS) })
const aviso = (tag: string, extra: Record<string, unknown> = {}) => ({ title: 'Levy espera tu decisión', body: 'Correr las pruebas.', url: '/chat?session=c1', tag, kind: 'cola', ...extra })

// ── Llaves ───────────────────────────────────────────────────────────────────────────────────────────────────────

test('llaves: P-256 válidas para web-push, distintas en cada instalación', () => {
  const a = llavesVapidNuevas(), b = llavesVapidNuevas()
  assert.ok(llavesVapidValidas(a) && llavesVapidValidas(b))
  assert.notEqual(a.publica, b.publica)
  assert.notEqual(a.privada, b.privada)
  assert.equal(Buffer.from(a.publica, 'base64url').length, 65)
  webpush.setVapidDetails(SUJETO_VAPID_CLIENTE, a.publica, a.privada)
  const d = webpush.generateRequestDetails(sub('x'), '{}')
  assert.match(d.headers.Authorization, /^vapid t=.+, k=/)
  for (const malo of [null, {}, { publica: 'x', privada: 'y' }, { publica: a.publica, privada: 'corta' }, { publica: a.privada, privada: a.privada }]) {
    assert.equal(llavesVapidValidas(malo), false)
  }
})

test('llaves: se generan una vez en avisos.json (0600) de la config privada y luego se reusan; un archivo dañado se regenera', () => {
  const datos = mkdtempSync(join(tmpdir(), 'avisos-llaves-'))
  const R = rutasDe(datos, tmpdir())
  assert.equal(R.avisos, join(datos, 'daemon', 'config', 'avisos.json'))
  const escritos: string[] = []
  const leer = (r: string) => { try { return JSON.parse(readFileSync(r, 'utf8')) } catch { return null } }
  const escribir = (r: string, t: string) => { escritos.push(r); writeFileSync(r, t, { mode: 0o600 }) }
  const config = join(datos, 'daemon', 'config')
  mkdirSync(config, { recursive: true })
  const primera = llavesVapidDe(R.avisos, { leer, escribir })
  assert.equal(primera.nuevas, true)
  if (process.platform !== 'win32') assert.equal(statSync(R.avisos).mode & 0o777, 0o600)
  const segunda = llavesVapidDe(R.avisos, { leer, escribir })
  assert.equal(segunda.nuevas, false)
  assert.equal(segunda.publica, primera.publica)
  assert.equal(escritos.length, 1, 'no se reescribe si ya sirve')
  writeFileSync(R.avisos, '{roto')
  const tercera = llavesVapidDe(R.avisos, { leer, escribir })
  assert.equal(tercera.regeneradas, false, 'JSON ilegible = null: cuenta como primera vez')
  writeFileSync(R.avisos, JSON.stringify({ publica: 'x', privada: 'y' }))
  assert.equal(llavesVapidDe(R.avisos, { leer, escribir }).regeneradas, true)
})

test('llaves: la privada viaja solo por stdin a la web, nunca por entorno, ni al daemon, ni a los hijos de la web', () => {
  const s = raiz('scripts/servidor.mjs')
  const web = s.slice(s.indexOf('function lanzarWeb()'), s.indexOf('function vigilar('))
  const daemon = s.slice(s.indexOf('function lanzarDaemon()'), s.indexOf('function lanzarWeb()'))
  const env = web.slice(web.indexOf('const env = {'), web.indexOf('const linea'))
  const linea = web.slice(web.indexOf('const linea'))
  assert.match(env, /ARBRAIN_VAPID_PUBLICA: avisos\.publica/)
  assert.doesNotMatch(env, /avisos\.privada|VAPID_PRIVATE_KEY:/)
  assert.match(linea, /VAPID_PRIVATE_KEY: avisos\.privada/)
  assert.doesNotMatch(daemon, /VAPID|avisos\./)
  // El preludio la pone en process.env de la web y la quita de todo hijo; heredada de la terminal, no pasa.
  assert.match(PRELUDIO_WEB, /const N=\[[^\]]*'VAPID_PRIVATE_KEY'/)
  for (const k of ['VAPID_PRIVATE_KEY', 'ARBRAIN_VAPID_PUBLICA', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY']) assert.ok(PROHIBIDAS.includes(k), k)
  // Nada la imprime: ni el supervisor ni las rutas.
  assert.doesNotMatch(s, /registrar\([^)]*privada/)
  for (const r of ['src/app/api/notifications/send/route.ts', 'src/app/api/notifications/prueba/route.ts', 'src/features/notifications/lib/vapid.ts']) {
    assert.doesNotMatch(raiz(r), /console\.[a-z]+\([^)]*(VAPID_PRIVATE_KEY|privateKey)/, r)
  }
  // Los agentes del daemon tampoco: si llegara heredada, se borra de su entorno.
  assert.match(raiz('server/src/cliente/cofre.ts'), /NUNCA_EN_ENTORNO = \[[^\]]*'VAPID_PRIVATE_KEY'/)
})

test('llaves: la web lee la pública en tiempo de ejecución; el remitente del alumno es la página pública del proyecto', () => {
  assert.equal(clavePublicaVapid({ ARBRAIN_VAPID_PUBLICA: ' BPub ' }), 'BPub')
  assert.equal(sujetoVapid(true, {}), SUJETO_VAPID_CLIENTE)
  assert.match(SUJETO_VAPID_CLIENTE, /^https:\/\//)
  assert.equal(sujetoVapid(false, { VAPID_EMAIL: 'a@b.c' }), 'mailto:a@b.c')
})

// ── Rutas: sesión vs token ───────────────────────────────────────────────────────────────────────────────────────

test('edición cliente: las tres rutas existen; send pasa el proxy sin cookie (la ruta exige el token), subscribe y prueba piden sesión', () => {
  for (const r of ['/api/notifications/subscribe', '/api/notifications/prueba', '/api/notifications/send']) assert.equal(apiPermitidaEnCliente(r), true, r)
  assert.equal(apiPermitidaEnCliente('/api/notifications/otra'), false)
  assert.deepEqual(decidirCliente('/api/notifications/send', false, true), { tipo: 'pasa' })
  assert.equal(decidirCliente('/api/notifications/subscribe', false, true).tipo, 'json')
  assert.equal(decidirCliente('/api/notifications/prueba', false, true).tipo, 'json')
  assert.deepEqual(decidirCliente('/api/notifications/subscribe', true, true), { tipo: 'pasa' })
})

test('send: solo el Bearer exacto del daemon; ni la sesión (sin cabecera), ni el pase de agente, ni un token corto', () => {
  assert.equal(bearerDelDaemon(`Bearer ${T}`, T), true)
  assert.equal(bearerDelDaemon(null, T), false, 'la cookie de sesión no trae Bearer')
  assert.equal(bearerDelDaemon(`Bearer ${'b'.repeat(64)}`, T), false, 'el pase de agente es otro secreto')
  assert.equal(bearerDelDaemon(`Bearer ${T}x`, T), false)
  assert.equal(bearerDelDaemon('Bearer corto', 'corto'), false)
  assert.equal(bearerDelDaemon(`Bearer ${T}`, ''), false)
  assert.equal(bearerDelDaemon(T, T), false, 'sin «Bearer » no vale')
  // La ruta lo aplica antes que nada y nunca consulta la sesión en la edición cliente.
  const ruta = raiz('src/app/api/notifications/send/route.ts')
  assert.match(ruta, /if \(esEdicionCliente\(\)\) return sendAlumno\(req\)/)
  const alumno = ruta.slice(ruta.indexOf('async function sendAlumno'), ruta.indexOf('export async function POST'))
  assert.doesNotMatch(alumno, /createClient\(|auth\.getUser|decidir\(|registrar\(supabase/)
  assert.match(alumno, /token: process\.env\.OPENCLAW_GATEWAY_TOKEN/)
})

test('send: 401 sin token y no envía; 400 con un aviso inválido; al dueño aunque el cuerpo pida otro userId', async () => {
  const A = instalacion(T)
  await altaSuscripcion(DUENO, { subscription: sub('tel') }, A.almacen)
  const { enviados, enviar } = enviador()
  const base = { token: T, usuario: DUENO, almacen: A.almacen, enviar, vapidLista: true, estado: estadoNuevo() }
  assert.equal((await rutaSendAlumno({ ...base, autorizacion: null, cuerpo: aviso('cola-1') })).status, 401)
  assert.equal((await rutaSendAlumno({ ...base, autorizacion: `Bearer ${'p'.repeat(64)}`, cuerpo: aviso('cola-1') })).status, 401)
  assert.equal(enviados.length, 0)
  assert.equal((await rutaSendAlumno({ ...base, autorizacion: `Bearer ${T}`, cuerpo: { title: '', tag: 'x' } })).status, 400)
  const r = await rutaSendAlumno({ ...base, autorizacion: `Bearer ${T}`, cuerpo: { ...aviso('cola-1'), userId: 'otra-persona' } })
  assert.equal(r.status, 200)
  assert.equal(r.json.sent, 1)
  assert.deepEqual(enviados.map((e) => e.endpoint), [sub('tel').endpoint])
  assert.deepEqual(Object.keys(enviados[0].payload).sort(), ['body', 'icon', 'tag', 'title', 'url'])
})

test('nunca cruza instalaciones: el token de una no abre la otra y cada una solo alcanza sus dispositivos', async () => {
  const A = instalacion('a'.repeat(64)), B = instalacion('b'.repeat(64))
  await altaSuscripcion(DUENO, { subscription: sub('tel-a') }, A.almacen)
  await altaSuscripcion(DUENO, { subscription: sub('tel-b') }, B.almacen)
  const ea = enviador(), eb = enviador()
  const enA = (autorizacion: string, cuerpo: unknown) => rutaSendAlumno({ token: A.token, usuario: DUENO, almacen: A.almacen, enviar: ea.enviar, vapidLista: true, estado: estadoNuevo(), autorizacion, cuerpo })
  const enB = (autorizacion: string, cuerpo: unknown) => rutaSendAlumno({ token: B.token, usuario: DUENO, almacen: B.almacen, enviar: eb.enviar, vapidLista: true, estado: estadoNuevo(), autorizacion, cuerpo })
  assert.equal((await enB(`Bearer ${A.token}`, aviso('cola-x'))).status, 401, 'el token de A no vale en B')
  assert.equal(eb.enviados.length, 0)
  assert.equal((await enA(`Bearer ${A.token}`, aviso('cola-x'))).status, 200)
  assert.deepEqual(ea.enviados.map((e) => e.endpoint), [sub('tel-a').endpoint])
  assert.deepEqual((await estadoSuscripcion(DUENO, sub('tel-a').endpoint, B.almacen)).json, { registrada: false, dispositivos: 1 })
  assert.notEqual(A.dir, B.dir)
})

test('una por evento: el mismo tag no suena dos veces; tope de 6 cada 10 min; sin llaves 503; sin dispositivos no falla', async () => {
  const A = instalacion(T)
  await altaSuscripcion(DUENO, { subscription: sub('tel') }, A.almacen)
  const { enviados, enviar } = enviador()
  const estado = estadoNuevo()
  const deps = { usuario: DUENO, almacen: A.almacen, enviar, vapidLista: true, estado }
  const t0 = Date.parse('2026-10-31T12:00:00Z')
  assert.equal((await entregarAvisoAlumno(validarAviso(aviso('cola-1'))!, { ...deps, ahora: t0 })).json.sent, 1)
  assert.equal((await entregarAvisoAlumno(validarAviso(aviso('cola-1'))!, { ...deps, ahora: t0 + 1000 })).json.motivo, 'repetido')
  for (let i = 2; i <= TOPE_AVISOS; i++) assert.equal((await entregarAvisoAlumno(validarAviso(aviso(`cola-${i}`))!, { ...deps, ahora: t0 + i })).json.sent, 1)
  const septimo = await entregarAvisoAlumno(validarAviso(aviso('cola-7'))!, { ...deps, ahora: t0 + 10 })
  assert.equal(septimo.status, 429)
  assert.equal(enviados.length, TOPE_AVISOS)
  assert.equal((await entregarAvisoAlumno(validarAviso(aviso('cola-8'))!, { ...deps, ahora: t0 + VENTANA_TOPE_MS + 1 })).json.sent, 1)
  assert.equal((await entregarAvisoAlumno(validarAviso(aviso('cola-9'))!, { ...deps, vapidLista: false })).status, 503)
  const vacia = instalacion(T)
  assert.equal((await entregarAvisoAlumno(validarAviso(aviso('cola-1'))!, { ...deps, almacen: vacia.almacen, estado: estadoNuevo() })).json.motivo, 'sin_dispositivos')
})

test('un dispositivo muerto (410) se borra; el acuse de push_log no guarda el endpoint y no crece sin fin', async () => {
  const A = instalacion(T)
  await altaSuscripcion(DUENO, { subscription: sub('viejo') }, A.almacen)
  await altaSuscripcion(DUENO, { subscription: sub('tel') }, A.almacen)
  const enviar = async (s: { endpoint: string }) => { if (s.endpoint.endsWith('viejo')) throw Object.assign(new Error('Gone'), { statusCode: 410 }) }
  const r = await entregarAvisoAlumno(validarAviso(aviso('cola-1'))!, { usuario: DUENO, almacen: A.almacen, enviar, vapidLista: true, estado: estadoNuevo() })
  assert.deepEqual(r.json, { sent: 1, fallidas: 1, limpiadas: 1 })
  assert.deepEqual((await (A.almacen as AlmacenPush).deUsuario(DUENO)).map((s) => s.endpoint), [sub('tel').endpoint])
  const log = (await A.db.from('push_log').select('*')).data as { endpoint_tail?: string; job_id: string }[]
  assert.ok(log.every((f) => !String(f.endpoint_tail ?? '').includes('https://')))
  assert.ok(log.every((f) => f.job_id === 'aviso:cola'))
  const dbChica = clienteLocal(almacenArchivos(mkdtempSync(join(tmpdir(), 'avisos-log-'))))
  const chico = almacenAlumno(dbChica as never, 5)
  for (let i = 0; i < 9; i++) await chico.registrar([{ job_id: 'x', status: 'no_subs', title: `t${i}` }])
  const quedan = ((await (dbChica as never as typeof A.db).from('push_log').select('*')).data ?? []) as unknown[]
  assert.equal(quedan.length, 5)
  assert.ok(MAX_PUSH_LOG_LOCAL >= 100)
})

// ── Textos ───────────────────────────────────────────────────────────────────────────────────────────────────────

test('textos: la respuesta larga dice que Levy terminó, sin Markdown, y abre su conversación', () => {
  const a = avisoRespuestaLarga({ sessionId: 'c-123', turnId: 't-9', assistantMessage: '## Listo\n\n**Tu cotización** quedó en [el documento](https://x.y/z) con `3` partidas.\n```js\nx()\n```' })
  assert.equal(a.title, 'Levy terminó tu respuesta')
  assert.equal(a.body, 'Listo Tu cotización quedó en el documento con 3 partidas.')
  assert.equal(a.url, '/chat?session=c-123')
  assert.equal(a.tag, 'respuesta-t-9')
  assert.equal(a.kind, 'respuesta')
  assert.equal(avisoRespuestaLarga({ sessionId: 'c', turnId: 't', assistantMessage: '' }).body, 'Ya está lista en tu conversación.')
  const f = avisoRespuestaLarga({ sessionId: null, turnId: 't', terminalStatus: 'failed' })
  assert.equal(f.title, 'Tu respuesta se detuvo')
  assert.equal(f.url, '/chat')
  assert.equal(avisoRespuestaLarga({ sessionId: '../../x', turnId: 't' }).url, '/chat')
  assert.ok(vistaPrevia('x'.repeat(500)).length <= 140)
  assert.ok(vistaPrevia('x'.repeat(500)).endsWith('…'))
})

test('textos: la prueba del alumno habla de los avisos de Levy (no de reportes)', () => {
  const p = payloadPrueba('Fulana Prueba', new Date(0), true)
  assert.equal(p.title, 'Tu Arbrain')
  assert.equal(p.body, 'Fulana, así te van a llegar los avisos de Levy.')
  assert.equal(payloadPrueba(null, new Date(0), true).body, 'Así te van a llegar los avisos de Levy.')
  assert.equal(payloadPrueba('Fulana', new Date(0)).body, 'Fulana, así te van a llegar tus reportes y avisos.', 'la original no cambia')
})

test('respuesta larga: solo sin ACK (app cerrada), de un minuto o más y no detenida por la persona', () => {
  const ahora = Date.parse('2026-10-31T12:00:00Z')
  const larga = { turnId: 't', startedAt: ahora - UMBRAL_RESPUESTA_LARGA_MS - 1, ahora }
  assert.equal(debeAvisarRespuesta(larga), true)
  assert.equal(debeAvisarRespuesta({ ...larga, clientAcked: true }), false, 'la está viendo')
  assert.equal(debeAvisarRespuesta({ ...larga, startedAt: ahora - 20_000 }), false, 'corta')
  assert.equal(debeAvisarRespuesta({ ...larga, terminalStatus: 'interrupted' }), false)
  assert.equal(debeAvisarRespuesta({ ...larga, turnId: null }), false)
  assert.equal(debeAvisarRespuesta({ turnId: 't', startedAt: null, durationMs: 90_000, ahora }), true, 'sin inicio, por la duración del uso')
  assert.equal(debeAvisarRespuesta({ turnId: 't', ahora }), false, 'sin duración medible, no')
  const ruta = raiz('src/app/api/chat/complete/route.ts')
  assert.match(ruta, /!cliente &&\s*source === 'mobile'/, 'el push de la original no corre en el alumno')
})

test('validación: solo rutas propias, tags seguros y textos acotados', () => {
  assert.equal(rutaPropia('https://evil.example/x'), '/chat')
  assert.equal(rutaPropia('//evil.example'), '/chat')
  assert.equal(rutaPropia('/\\evil'), '/chat')
  assert.equal(rutaPropia('/chat?panel=taller&taller=rutinas'), '/chat?panel=taller&taller=rutinas')
  assert.equal(validarAviso({ title: 'x', tag: 'mal tag' }), null)
  const v = validarAviso({ title: 'a\n\nb', body: 'c'.repeat(400), tag: 'rutina-x-1', kind: 'raro', url: 'javascript:alert(1)' })!
  assert.equal(v.title, 'a b')
  assert.ok(v.body.length <= 240)
  assert.equal(v.kind, 'otro')
  assert.equal(v.url, '/chat')
})

// ── Ajustes › Notificaciones en el alumno ────────────────────────────────────────────────────────────────────────

test('UI: en la computadora del alumno se activan en el teléfono; la sección explica iPhone y no monta la campana', () => {
  const e: EntornoPush = { userAgent: 'Mozilla/5.0 (Macintosh)', instalada: false, tieneNotification: true, tieneServiceWorker: true, tienePushManager: true, permiso: 'default', suscrito: false, vapidConfigurada: true }
  assert.equal(estadoPush({ ...e, enComputadora: true }), 'en-computadora')
  assert.equal(estadoPush(e), 'listo')
  assert.equal(resumenEstado('en-computadora'), 'Se activan en tu teléfono')
  const ui = raiz('src/features/notifications/components/SeccionNotificaciones.tsx')
  for (const frase of ['iOS 16.4 o más', 'pantalla de inicio', 'dirección de Tailscale', 'Levy espera tu decisión', 'Una rutina terminó', 'Levy terminó tu respuesta', 'Enviarme una prueba', 'Desactivar']) assert.ok(ui.includes(frase), frase)
  assert.match(raiz('src/shared/components/AccionesBarra.tsx'), /\{!esEdicionCliente\(\) && <NotificationBell/, 'la campana sigue oculta en el alumno')
})
