// Chat en el navegador por el teléfono (reporte de un fundador, 23 oct 2026, v0.2.9): fuera de loopback el navegador no le
// preguntaba al servidor por la sesión de la app, caía al cliente inerte de Supabase (rol 'member') y el RouteGuard
// tapaba /chat: marco y conversaciones, sin mensajes ni campo para escribir.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { preguntarSesionLocal } from '../../src/lib/sesion-local'

test('app de escritorio: nunca pregunta (ya es la sesión de la app)', () => {
  for (const loopback of [true, false]) for (const edicionCliente of [true, false]) {
    assert.equal(preguntarSesionLocal({ escritorio: true, loopback, edicionCliente }), false)
  }
})

test('navegador en loopback: pregunta, en las dos ediciones (como siempre)', () => {
  assert.equal(preguntarSesionLocal({ escritorio: false, loopback: true, edicionCliente: true }), true)
  assert.equal(preguntarSesionLocal({ escritorio: false, loopback: true, edicionCliente: false }), true)
})

test('edición cliente fuera de loopback (teléfono por *.ts.net): pregunta al servidor', () => {
  assert.equal(preguntarSesionLocal({ escritorio: false, loopback: false, edicionCliente: true }), true)
})

test('instalación de Daniel fuera de loopback (Vercel, Funnel): no pregunta, manda Supabase', () => {
  assert.equal(preguntarSesionLocal({ escritorio: false, loopback: false, edicionCliente: false }), false)
})

test('auth-context decide con preguntarSesionLocal (no con el atajo viejo de solo loopback)', () => {
  const fuente = readFileSync(join(__dirname, '../../src/shared/contexts/auth-context.tsx'), 'utf8')
  assert.match(fuente, /preguntarSesionLocal\(\{[\s\S]*?edicionCliente: esEdicionCliente\(\)/)
  assert.doesNotMatch(fuente, /\(isDesktopRuntime\(\) \|\| !isLocalhostRuntime\(\)\) \? false : null/)
})

test('pantallas de entrada: un 401 ahí no manda a /login (evita el bucle /sin-sesion ↔ /login por el teléfono)', async () => {
  const { esPantallaDeEntrada } = await import('../../src/lib/sesion-local')
  for (const r of ['/login', '/login/', '/sin-sesion', '/sin-sesion?e=contrasena']) assert.equal(esPantallaDeEntrada(r), true, r)
  for (const r of ['/', '/chat', '/loginx', '/sin-sesionx', '/settings']) assert.equal(esPantallaDeEntrada(r), false, r)
  const guard = readFileSync(join(__dirname, '../../src/components/AuthExpiryGuard.tsx'), 'utf8')
  assert.match(guard, /!esPantallaDeEntrada\(path\)/)
})
