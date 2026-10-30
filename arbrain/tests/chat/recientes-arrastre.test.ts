import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { sueltaCambia } from '../../src/features/chat/lib/recientes-lista'

// Arrastrar entre Fijadas y los días (Daniel, 3 oct 2026): solo cruzar cambia algo.
test('una conversación suelta se fija al soltarla en Fijadas', () => {
  assert.equal(sueltaCambia({ is_favorite: false }, 'fijadas'), true)
  assert.equal(sueltaCambia({ is_favorite: false }, 'dias'), false)
})
test('una fijada se desfija al soltarla en los días', () => {
  assert.equal(sueltaCambia({ is_favorite: true }, 'dias'), true)
  assert.equal(sueltaCambia({ is_favorite: true }, 'fijadas'), false)
})
test('sin arrastre no hay destino', () => {
  assert.equal(sueltaCambia(null, 'fijadas'), false)
})

// Reacomodar dentro de Fijadas (Daniel, 4 oct 2026): orden manual que se guarda en la base.
import { huecoEn, ordenarFijadas, reacomodar } from '../../src/features/chat/lib/recientes-lista'
import type { ChatSession } from '../../src/features/chat/hooks/useChatHistory'

const ses = (id: string, pinned_position: number | null, last: string): ChatSession => ({
  id, title: id, is_favorite: true, pinned_position, profile_id: null,
  created_at: last, updated_at: last, last_message_at: last,
} as ChatSession)

test('las fijadas sin posición van arriba por fecha; las acomodadas, por su posición', () => {
  const lista = [
    ses('b', 1, '2026-10-01T10:00:00Z'),
    ses('nueva', null, '2026-09-01T10:00:00Z'),
    ses('a', 0, '2026-09-20T10:00:00Z'),
    ses('reciente', null, '2026-10-03T10:00:00Z'),
  ]
  assert.deepEqual(ordenarFijadas(lista).map((s) => s.id), ['reciente', 'nueva', 'a', 'b'])
})
test('el hueco sale de la mitad de cada fila', () => {
  const mitades = [10, 30, 50]
  assert.equal(huecoEn(mitades, 0), 0)
  assert.equal(huecoEn(mitades, 11), 1)
  assert.equal(huecoEn(mitades, 49), 2)
  assert.equal(huecoEn(mitades, 99), 3)
  assert.equal(huecoEn([], 5), 0)
})
test('reacomodar hacia abajo y hacia arriba', () => {
  assert.deepEqual(reacomodar(['a', 'b', 'c', 'd'], 'a', 3), ['b', 'c', 'a', 'd'])
  assert.deepEqual(reacomodar(['a', 'b', 'c', 'd'], 'a', 4), ['b', 'c', 'd', 'a'])
  assert.deepEqual(reacomodar(['a', 'b', 'c', 'd'], 'd', 0), ['d', 'a', 'b', 'c'])
  assert.deepEqual(reacomodar(['a', 'b', 'c', 'd'], 'c', 1), ['a', 'c', 'b', 'd'])
})
test('soltarla junto a sí misma no mueve nada', () => {
  assert.equal(reacomodar(['a', 'b', 'c'], 'b', 1), null)
  assert.equal(reacomodar(['a', 'b', 'c'], 'b', 2), null)
})
test('una conversación que entra a Fijadas queda donde se suelta', () => {
  assert.deepEqual(reacomodar(['a', 'b'], 'x', 1), ['a', 'x', 'b'])
  assert.deepEqual(reacomodar(['a', 'b'], 'x', 0), ['x', 'a', 'b'])
  assert.deepEqual(reacomodar([], 'x', 0), ['x'])
})
