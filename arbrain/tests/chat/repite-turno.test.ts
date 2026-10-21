import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { repiteTurnoEnCurso } from '../../src/features/chat/lib/envio-chat'

// Caso real del 2 oct 2026 (conversación DeepSeek 071673ff): el mismo texto, 12 s después, con el primer turno sin ver.
const ahora = new Date('2026-10-03T01:42:26Z').getTime()
const texto = 'Cool way me encanta chingonísimo. A ver quiero hacer una prueba.'
const usuario = (turnId: string, hace = 12_000, content = texto) => ({ role: 'user' as const, content, timestamp: new Date(ahora - hace), metadata: { turnId } })
const respuesta = (turnId: string, extra: Record<string, unknown> = {}) => ({ role: 'assistant' as const, content: '', timestamp: new Date(ahora - 11_000), metadata: { turnId }, ...extra })

test('repetir el texto de un turno que sigue sin respuesta visible se detiene', () => {
  assert.equal(repiteTurnoEnCurso([usuario('8688'), respuesta('8688')], texto, ahora), true)
  assert.equal(repiteTurnoEnCurso([usuario('8688'), respuesta('8688', { streaming: true, content: 'Va.' })], `  ${texto}\n`, ahora), true)
  assert.equal(repiteTurnoEnCurso([usuario('8688')], texto, ahora), true)
})

test('un turno resuelto (respuesta completa, error o detenido) sí se puede repetir', () => {
  assert.equal(repiteTurnoEnCurso([usuario('a'), respuesta('a', { content: 'Hecho.' })], texto, ahora), false)
  assert.equal(repiteTurnoEnCurso([usuario('a'), respuesta('a', { error: true })], texto, ahora), false)
  assert.equal(repiteTurnoEnCurso([usuario('a'), respuesta('a', { terminalStatus: 'interrupted' })], texto, ahora), false)
})

test('otro texto, o el mismo hace más de 10 minutos, pasa', () => {
  assert.equal(repiteTurnoEnCurso([usuario('a'), respuesta('a')], 'otra cosa', ahora), false)
  assert.equal(repiteTurnoEnCurso([usuario('a', 11 * 60_000), respuesta('a')], texto, ahora), false)
  assert.equal(repiteTurnoEnCurso([], texto, ahora), false)
})

test('solo cuenta la aparición más reciente del texto', () => {
  const hilo = [usuario('viejo', 60_000), respuesta('viejo'), usuario('nuevo', 5_000), respuesta('nuevo', { content: 'Listo.' })]
  assert.equal(repiteTurnoEnCurso(hilo, texto, ahora), false)
})
