// Seguridad v0.2.2 (docs/builds/seguridad-v021-2026-10-21/REPORTE.md): A2, CSRF entre puertos de 127.0.0.1 en el modo
// servidor; Bajo 1, `Origin: null` en el freno de login; Bajo 2, la contraseña en la URL de /api/desktop/sesion.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { escrituraDeOtroOrigen, proxyCliente } from '../../src/lib/proxy-cliente'
import { origenDeEntrada } from '../../src/lib/modo-servidor'
import { GET as sesion } from '../../src/app/api/desktop/sesion/route'

const HOST = '127.0.0.1:4399'
const PROPIO = `http://${HOST}`
const SECRETO = 'a'.repeat(64)
const cab = (o: Partial<{ origin: string; secFetchSite: string; authorization: string; host: string }> = {}) => ({
  origin: o.origin ?? null, secFetchSite: o.secFetchSite ?? null, authorization: o.authorization ?? null, host: o.host ?? HOST,
})
const guarda = (metodo: string, ruta: string, c = cab()) => escrituraDeOtroOrigen(metodo, ruta, c, 'http:')

const previo = { ...process.env }
afterEach(() => {
  for (const k of ['MISSION_CONTROL_DESKTOP_EMBED', 'ARBRAIN_EDICION', 'ARBRAIN_DESKTOP_SECRET', 'ARBRAIN_MODO_SERVIDOR']) {
    if (previo[k] === undefined) delete process.env[k]; else process.env[k] = previo[k]
  }
})

test('guarda: un POST desde otro puerto de 127.0.0.1 se rechaza', () => {
  assert.equal(guarda('POST', '/api/chat/sessions', cab({ origin: 'http://127.0.0.1:8000', secFetchSite: 'same-site' })), true)
  assert.equal(guarda('POST', '/api/chat/sessions', cab({ origin: 'http://127.0.0.1:8000' })), true)
  assert.equal(guarda('PUT', '/api/canvas/pages', cab({ origin: 'http://localhost:4399' })), true, 'otro host, mismo puerto')
  assert.equal(guarda('DELETE', '/api/canvas/pages', cab({ origin: 'https://127.0.0.1:4399' })), true, 'otro protocolo')
})

test('guarda: Sec-Fetch-Site same-site o cross-site se rechaza aunque no venga Origin', () => {
  assert.equal(guarda('POST', '/api/chat/stream', cab({ secFetchSite: 'same-site' })), true)
  assert.equal(guarda('POST', '/api/chat/stream', cab({ secFetchSite: 'cross-site' })), true)
  assert.equal(guarda('POST', '/api/chat/stream', cab({ origin: PROPIO, secFetchSite: 'same-site' })), true)
})

test('guarda: Origin null se rechaza', () => {
  assert.equal(guarda('POST', '/api/chat/sessions', cab({ origin: 'null' })), true)
  assert.equal(guarda('POST', '/api/chat/sessions', cab({ origin: 'null', secFetchSite: 'none' })), true)
})

test('guarda: el mismo origen pasa', () => {
  assert.equal(guarda('POST', '/api/chat/sessions', cab({ origin: PROPIO, secFetchSite: 'same-origin' })), false)
  assert.equal(guarda('POST', '/api/chat/sessions', cab({ origin: PROPIO })), false)
  assert.equal(guarda('PATCH', '/api/chat/sessions', cab({ secFetchSite: 'none' })), false)
  assert.equal(guarda('POST', '/api/chat/sessions', cab({ origin: 'http://localhost:4399', host: 'localhost:4399' })), false)
  assert.equal(guarda('POST', '/api/chat/sessions'), false, 'procesos locales (daemon, supervisor) no mandan Origin')
})

test('guarda: con Bearer pasa (otra página no puede ponerlo sin preflight)', () => {
  assert.equal(guarda('POST', '/api/canvas/pages', cab({ origin: 'http://127.0.0.1:8000', authorization: 'Bearer x' })), false)
  assert.equal(guarda('POST', '/api/canvas/pages', cab({ origin: 'http://127.0.0.1:8000', authorization: 'Basic x' })), true)
})

test('guarda: GET, HEAD y OPTIONS pasan; fuera de /api no aplica', () => {
  for (const m of ['GET', 'HEAD', 'OPTIONS', 'get']) assert.equal(guarda(m, '/api/chat/sessions', cab({ origin: 'http://127.0.0.1:8000', secFetchSite: 'same-site' })), false, m)
  assert.equal(guarda('POST', '/chat', cab({ origin: 'http://127.0.0.1:8000' })), false)
})

const peticion = (metodo: string, ruta: string, headers: Record<string, string>) =>
  new NextRequest(`${PROPIO}${ruta}`, { method: metodo, headers: { host: HOST, cookie: `arbrain_escritorio=${SECRETO}`, ...headers } })

test('proxy en modo servidor: 403 JSON sin caché a otro puerto; el mismo origen sigue', async () => {
  process.env.ARBRAIN_EDICION = 'cliente'
  process.env.ARBRAIN_MODO_SERVIDOR = '1'
  process.env.MISSION_CONTROL_DESKTOP_EMBED = '1'
  process.env.ARBRAIN_DESKTOP_SECRET = SECRETO
  let r = proxyCliente(peticion('POST', '/api/chat/sessions', { origin: 'http://127.0.0.1:8000', 'sec-fetch-site': 'same-site' }))
  assert.equal(r.status, 403)
  assert.equal(r.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await r.json(), { error: 'Origen no autorizado.' })
  r = proxyCliente(peticion('POST', '/api/chat/sessions', { origin: PROPIO, 'sec-fetch-site': 'same-origin' }))
  assert.notEqual(r.status, 403)
})

test('proxy fuera del modo servidor (app de escritorio): la guarda no cambia nada', () => {
  process.env.ARBRAIN_EDICION = 'cliente'
  delete process.env.ARBRAIN_MODO_SERVIDOR
  process.env.MISSION_CONTROL_DESKTOP_EMBED = '1'
  process.env.ARBRAIN_DESKTOP_SECRET = SECRETO
  const r = proxyCliente(peticion('POST', '/api/chat/sessions', { origin: 'http://127.0.0.1:8000' }))
  assert.notEqual(r.status, 403)
})

test('entrar (Bajo 1): Origin null u otro origen no llegan al freno; el mismo origen o sin Origin sí', () => {
  assert.equal(origenDeEntrada('null', HOST), false)
  assert.equal(origenDeEntrada('http://127.0.0.1:8000', HOST), false)
  assert.equal(origenDeEntrada('no es url', HOST), false)
  assert.equal(origenDeEntrada(PROPIO, HOST), true)
  assert.equal(origenDeEntrada(null, HOST), true)
})

test('sesion?t= (Bajo 2): 404 en modo servidor; la app de escritorio la sigue usando', async () => {
  process.env.ARBRAIN_EDICION = 'cliente'
  process.env.MISSION_CONTROL_DESKTOP_EMBED = '1'
  process.env.ARBRAIN_DESKTOP_SECRET = SECRETO
  const url = `${PROPIO}/api/desktop/sesion?t=${SECRETO}&a=/chat`
  process.env.ARBRAIN_MODO_SERVIDOR = '1'
  assert.equal((await sesion(new Request(url, { headers: { host: HOST } }))).status, 404)
  delete process.env.ARBRAIN_MODO_SERVIDOR
  assert.equal((await sesion(new Request(url, { headers: { host: HOST } }))).status, 303)
})
