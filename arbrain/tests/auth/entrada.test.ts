import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { destinoSeguro, mensajeDeError, LENTA_MS } from '../../src/features/auth/entrada'

test('el destino solo acepta rutas propias; sin destino, el chat', () => {
  assert.equal(destinoSeguro('/cabina'), '/cabina')
  assert.equal(destinoSeguro(null), '/chat')
  assert.equal(destinoSeguro(''), '/chat')
  assert.equal(destinoSeguro('//evil.com'), '/chat')
  assert.equal(destinoSeguro('/\\evil.com'), '/chat')
  assert.equal(destinoSeguro('https://evil.com'), '/chat')
  // El navegador quita tabs/saltos: `/\t/evil.com` sería `//evil.com` (auditoría 5-STUDIO, 21 oct 2026).
  assert.equal(destinoSeguro('/\t/evil.com'), '/chat')
  assert.equal(destinoSeguro('/\n/evil.com'), '/chat')
  assert.equal(destinoSeguro('/chat?c=1#x'), '/chat?c=1#x')
})

test('credenciales malas: dice qué pasó en español y culpa a la contraseña', () => {
  assert.deepEqual(mensajeDeError('Invalid login credentials'), { texto: 'El correo o la contraseña no coinciden.', campo: 'password' })
})

test('correo sin acceso culpa al correo', () => {
  assert.equal(mensajeDeError('Access denied. This email is not authorized.').campo, 'email')
  assert.equal(mensajeDeError('unauthorized').campo, 'email')
})

test('una caída de red se distingue de unas credenciales malas y promete conservar lo escrito', () => {
  for (const crudo of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'fetch failed']) {
    const m = mensajeDeError(crudo)
    assert.equal(m.campo, null)
    assert.match(m.texto, /conexión/)
    assert.match(m.texto, /sigue aquí/)
  }
})

test('lo desconocido se muestra tal cual, sin inventar una causa', () => {
  assert.deepEqual(mensajeDeError('Demasiados intentos desde esta red.'), { texto: 'Demasiados intentos desde esta red.', campo: null })
  assert.equal(mensajeDeError('').texto, 'No se pudo entrar. Vuelve a intentarlo.')
})

test('la fase lenta llega antes de que el silencio parezca un cuelgue', () => {
  assert.ok(LENTA_MS >= 3000 && LENTA_MS <= 8000)
})
