import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unirSinMensajes } from '../../src/features/chat/lib/orden-recientes'

const f = (id: string, last: string | null, upd: string) => ({ id, last_message_at: last, updated_at: upd })

test('una conversación nueva sin mensajes entra arriba aunque la lista ya esté en su tope', () => {
  const con = [f('a', '2026-11-16T12:24:00Z', '2026-11-16T12:24:00Z'), f('b', '2026-11-15T10:00:00Z', '2026-11-15T10:00:00Z')]
  const sin = [f('nueva', null, '2026-11-16T12:53:00Z')]
  assert.deepEqual(unirSinMensajes(con, sin, 2).map((x) => x.id), ['nueva', 'a'])
})

test('no duplica la que ya venía en la lista', () => {
  const con = [f('a', '2026-11-16T12:24:00Z', '2026-11-16T12:24:00Z'), f('x', null, '2026-11-10T00:00:00Z')]
  assert.deepEqual(unirSinMensajes(con, [f('x', null, '2026-11-10T00:00:00Z')], 40).map((y) => y.id), ['a', 'x'])
})

test('sin recientes sin mensajes la lista queda igual', () => {
  const con = [f('a', '2026-11-16T12:24:00Z', '2026-11-16T12:24:00Z')]
  assert.equal(unirSinMensajes(con, [], 40), con)
})
