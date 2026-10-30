import test from 'node:test'
import assert from 'node:assert/strict'
import { esMensajeDeToque, rutaDeToque, toqueReciente, TOQUE_VIGENTE_MS } from '../../src/features/notifications/lib/toque-aviso'
import { esReapertura, REAPERTURA_MS } from '../../src/features/cabina/panel/telefono-logica'

// 18 oct 2026 (Daniel: «me llegó la noti pero no a la conversación»): el push se toca tras minutos fuera; la reapertura en
// chat nuevo del teléfono no puede pisar la conversación a la que lleva la notificación.
test('reapertura tras minutos fuera: con un toque reciente manda la notificación, sin toque abre chat nuevo', () => {
  const oculta = 1_000_000, vuelve = oculta + REAPERTURA_MS + 60_000
  assert.equal(esReapertura(oculta, vuelve), true)
  assert.equal(toqueReciente(0, vuelve), false, 'sin toque: chat nuevo como siempre')
  assert.equal(toqueReciente(vuelve - 50, vuelve), true, 'el mensaje del SW llegó justo antes del visibilitychange')
  assert.equal(toqueReciente(vuelve - TOQUE_VIGENTE_MS, vuelve), false, 'un toque viejo no frena reaperturas futuras')
})

test('mensajes del service worker que cuentan como toque', () => {
  assert.equal(esMensajeDeToque({ type: 'notificacion-tocada', url: '/chat' }), true)
  assert.equal(esMensajeDeToque({ type: 'open-chat-session', sessionId: 'x' }), true)
  assert.equal(esMensajeDeToque({ type: 'abrir-url', url: '/chat' }), true)
  assert.equal(esMensajeDeToque({ type: 'aviso-recibido' }), false, 'un push que llega no es un toque')
  assert.equal(esMensajeDeToque(null), false)
})

test('abrir-url: solo mismo origen y solo si no está ya ahí', () => {
  const o = 'https://arbrain.test'
  assert.equal(rutaDeToque({ type: 'abrir-url', url: '/chat?session=b' }, o, '/telefono'), '/chat?session=b')
  assert.equal(rutaDeToque({ type: 'abrir-url', url: '/chat?session=b' }, o, '/chat?session=b'), null)
  assert.equal(rutaDeToque({ type: 'abrir-url', url: 'https://malo.test/x' }, o, '/chat'), null)
  assert.equal(rutaDeToque({ type: 'notificacion-tocada', url: '/chat' }, o, '/telefono'), null)
})
