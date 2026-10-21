import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { fueAMano, marcarAMano, olvidarAMano } from '../../src/features/chat/lib/no-leida-a-mano'

test('la marca vale para ese último mensaje', () => {
  marcarAMano('c1', '2026-10-01T12:00:00.000Z')
  assert.equal(fueAMano('c1', '2026-10-01T12:00:00.000Z'), true)
})

test('llega otro mensaje: la marca deja de valer y la conversación vuelve a marcarse vista como siempre', () => {
  marcarAMano('c2', '2026-10-01T12:00:00.000Z')
  assert.equal(fueAMano('c2', '2026-10-01T12:05:00.000Z'), false)
})

test('abrirla de nuevo desde la lista (olvidar) anula la marca', () => {
  marcarAMano('c3', 'x')
  olvidarAMano('c3')
  assert.equal(fueAMano('c3', 'x'), false)
})

test('una conversación sin marca nunca cuenta como hecha a mano; null y vacío se tratan igual', () => {
  assert.equal(fueAMano('nunca', 'x'), false)
  marcarAMano('c4', null)
  assert.equal(fueAMano('c4', undefined), true)
  assert.equal(fueAMano('c4', ''), true)
})
