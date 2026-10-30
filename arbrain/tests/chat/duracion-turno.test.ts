import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { duracionLegible, etiquetaTrabajo, inicioTurno, reloj } from '../../src/features/chat/lib/duracion-turno'

test('reloj vivo compacto', () => {
  assert.equal(reloj(0), '0:00')
  assert.equal(reloj(42_400), '0:42')
  assert.equal(reloj(134_000), '2:14')
  assert.equal(reloj(3_725_000), '1:02:05')
})

test('duración final en palabras', () => {
  assert.equal(duracionLegible(42_000), '42 s')
  assert.equal(duracionLegible(252_000), '4 min 12 s')
  assert.equal(duracionLegible(240_000), '4 min')
  assert.equal(duracionLegible(3_780_000), '1 h 3 min')
})

test('el inicio del servidor manda sobre la hora local del mensaje', () => {
  const timestamp = new Date(2_000_000)
  assert.equal(inicioTurno({ timestamp, metadata: { startedAt: 1_000_000 } }), 1_000_000)
  assert.equal(inicioTurno({ timestamp }), 2_000_000)
  assert.equal(inicioTurno({ timestamp, metadata: { startedAt: 0 } }), 2_000_000)
})

test('lo rápido o sin dato no pinta etiqueta', () => {
  const timestamp = new Date()
  assert.equal(etiquetaTrabajo({ timestamp, usage: { durationMs: 9_000 } }), null)
  assert.equal(etiquetaTrabajo({ timestamp }), null)
  assert.equal(etiquetaTrabajo({ timestamp, usage: { durationMs: 252_000 } }), 'Trabajó 4 min 12 s')
})
