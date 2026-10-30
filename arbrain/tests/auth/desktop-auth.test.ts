// «Es la app» no puede depender del Host (AUDITORIA I5, 10 oct 2026). En la edición cliente hace falta la cookie del
// secreto por instalación; en la instalación de Daniel el criterio de siempre sigue igual.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { cookieFromHeader, isDesktopAuthBypassRequest, isDesktopSecret, sameSecret, DESKTOP_SESSION_COOKIE } from '../../src/lib/desktop-auth'
import { GET as sesion } from '../../src/app/api/desktop/sesion/route'

const SECRETO = 'a'.repeat(64)
const previo = { ...process.env }
afterEach(() => {
  for (const k of ['MISSION_CONTROL_DESKTOP_EMBED', 'ARBRAIN_EDICION', 'ARBRAIN_DESKTOP_SECRET']) {
    if (previo[k] === undefined) delete process.env[k]; else process.env[k] = previo[k]
  }
})

const pedir = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers })

test('instalación de Daniel: el criterio no cambia (embebido + host local)', () => {
  process.env.MISSION_CONTROL_DESKTOP_EMBED = '1'
  delete process.env.ARBRAIN_EDICION
  assert.equal(isDesktopAuthBypassRequest(pedir('http://127.0.0.1:3218/api/x')), true)
  assert.equal(isDesktopAuthBypassRequest(pedir('http://192.168.1.20:3218/api/x')), false)
  delete process.env.MISSION_CONTROL_DESKTOP_EMBED
  assert.equal(isDesktopAuthBypassRequest(pedir('http://127.0.0.1:3218/api/x')), false)
})

test('edición cliente: Host local sin cookie no es la app; con la cookie del secreto sí', () => {
  process.env.MISSION_CONTROL_DESKTOP_EMBED = '1'
  process.env.ARBRAIN_EDICION = 'cliente'
  process.env.ARBRAIN_DESKTOP_SECRET = SECRETO
  assert.equal(isDesktopAuthBypassRequest(pedir('http://localhost:3218/api/cabina/panel-terminal')), false)
  assert.equal(isDesktopAuthBypassRequest(pedir('http://localhost:3218/api/x', { cookie: `${DESKTOP_SESSION_COOKIE}=${'b'.repeat(64)}` })), false)
  assert.equal(isDesktopAuthBypassRequest(pedir('http://localhost:3218/api/x', { cookie: `otra=1; ${DESKTOP_SESSION_COOKIE}=${SECRETO}` })), true)
})

test('edición cliente sin secreto configurado: nadie es la app (falla cerrado)', () => {
  process.env.MISSION_CONTROL_DESKTOP_EMBED = '1'
  process.env.ARBRAIN_EDICION = 'cliente'
  delete process.env.ARBRAIN_DESKTOP_SECRET
  assert.equal(isDesktopSecret(''), false)
  assert.equal(isDesktopAuthBypassRequest(pedir('http://127.0.0.1:3218/x', { cookie: `${DESKTOP_SESSION_COOKIE}=` })), false)
})

test('comparación y lectura de cookies', () => {
  assert.equal(sameSecret('abc', 'abc'), true)
  assert.equal(sameSecret('abc', 'abd'), false)
  assert.equal(sameSecret('abc', 'abcd'), false)
  assert.equal(cookieFromHeader('a=1; b=2', 'b'), '2')
  assert.equal(cookieFromHeader(null, 'b'), undefined)
})

test('/api/desktop/sesion: cambia el secreto por una cookie HttpOnly y solo redirige a rutas propias', async () => {
  process.env.MISSION_CONTROL_DESKTOP_EMBED = '1'
  process.env.ARBRAIN_EDICION = 'cliente'
  process.env.ARBRAIN_DESKTOP_SECRET = SECRETO
  let r = await sesion(pedir(`http://127.0.0.1:3218/api/desktop/sesion?t=${SECRETO}&a=/chat`, { host: '127.0.0.1:3218' }))
  assert.equal(r.status, 303)
  assert.equal(r.headers.get('location'), '/chat')
  assert.match(r.headers.get('set-cookie') ?? '', /HttpOnly; SameSite=Strict$/)
  // Cookie de sesión (contrato v2): sin Max-Age, el webview no la escribe en disco.
  assert.doesNotMatch(r.headers.get('set-cookie') ?? '', /Max-Age|Expires/i)
  r = await sesion(pedir(`http://127.0.0.1:3218/api/desktop/sesion?t=${SECRETO}&a=//evil.example`, { host: '127.0.0.1:3218' }))
  assert.equal(r.headers.get('location'), '/chat')
  r = await sesion(pedir(`http://127.0.0.1:3218/api/desktop/sesion?t=${'c'.repeat(64)}`, { host: '127.0.0.1:3218' }))
  assert.equal(r.status, 403)
  r = await sesion(pedir(`http://192.168.1.20:3218/api/desktop/sesion?t=${SECRETO}`, { host: '192.168.1.20:3218' }))
  assert.equal(r.status, 403)
})

test('/api/desktop/sesion no existe en la instalación del autor', async () => {
  process.env.MISSION_CONTROL_DESKTOP_EMBED = '1'
  delete process.env.ARBRAIN_EDICION
  const r = await sesion(pedir(`http://127.0.0.1:3218/api/desktop/sesion?t=${SECRETO}`, { host: '127.0.0.1:3218' }))
  assert.equal(r.status, 404)
})

test('el servidor de desarrollo escucha solo en loopback salvo que se pida otra cosa', async () => {
  const { readFileSync } = await import('node:fs')
  const fuente = readFileSync(new URL('../../scripts/desktop-dev-server.mjs', `file://${__filename}`), 'utf8')
  assert.match(fuente, /ARBRAIN_DEV_HOST \|\| '127\.0\.0\.1'/)
  assert.match(fuente, /'--hostname', DEV_HOST/)
})
