import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { ordenarPorTurno } from '../../src/features/chat/lib/orden-turnos'
import { restoreTurnPair } from '../../src/features/chat/lib/durable-recovery'
import type { ChatMessage } from '../../src/features/chat/hooks/useChat'

// Hora UTC del 1 oct 2026 -> ms, para reproducir las filas reales de la conversación 0279bc6d.
const t = (hhmmss: string) => new Date(`2026-10-02T${hhmmss}Z`).getTime()

function msg(id: string, role: 'user' | 'assistant', cuando: number, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id, role, content: id, timestamp: new Date(cuando), ...extra }
}
const ids = (l: ChatMessage[]) => l.map(m => m.id)

test('filas reales de 0279bc6d: el par que el webhook guardó al terminar no se cuela después del turno siguiente', () => {
  // created_at reales (UTC): user 4901 00:14:56, user f77b 00:15:00, asst f77b 00:15:00, asst 4901 00:49:26.
  // Los turnos EMPEZARON: f77b 23:51:09 (día anterior, hora local 17:51), 4901 00:14:56.
  const f77bInicio = t('00:51:09') - 24 * 3600_000 // 17:51 local = 23:51Z del día anterior
  const mensajes = [
    msg('user-4901', 'user', t('00:14:56'), { metadata: { turnId: '4901' } }),
    msg('user-f77b', 'user', t('00:15:00'), { metadata: { turnId: 'f77b', startedAt: f77bInicio } }),
    msg('asst-f77b', 'assistant', t('00:15:00'), { metadata: { turnId: 'f77b', startedAt: f77bInicio } }),
    msg('asst-4901', 'assistant', t('00:49:26'), { metadata: { turnId: '4901', startedAt: t('00:14:56') } }),
  ]
  assert.deepEqual(ids(ordenarPorTurno(mensajes)), ['user-f77b', 'asst-f77b', 'user-4901', 'asst-4901'])
})

test('el turno que transmite queda SIEMPRE al final, aunque haya filas tardías con hora posterior', () => {
  const mensajes = [
    msg('u-vivo', 'user', t('00:20:00'), { metadata: { turnId: 'vivo' } }),
    msg('a-vivo', 'assistant', t('00:20:00'), { metadata: { turnId: 'vivo' }, streaming: true }),
    // Llegan después (realtime / reconciliación) con hora de su final, posterior al inicio del turno vivo.
    msg('u-B', 'user', t('00:25:00'), { metadata: { turnId: 'B' } }),
    msg('a-B', 'assistant', t('00:25:01'), { metadata: { turnId: 'B' } }),
  ]
  assert.deepEqual(ids(ordenarPorTurno(mensajes)), ['u-B', 'a-B', 'u-vivo', 'a-vivo'])
})

test('sin startedAt (datos anteriores) el turno se ubica por su fila más temprana y el user va antes', () => {
  const mensajes = [
    msg('a-1', 'assistant', t('00:10:00'), { metadata: { turnId: '1' } }),
    msg('u-1', 'user', t('00:10:00'), { metadata: { turnId: '1' } }),
    msg('u-2', 'user', t('00:11:00'), { metadata: { turnId: '2' } }),
    msg('a-2', 'assistant', t('00:12:00'), { metadata: { turnId: '2' } }),
  ]
  assert.deepEqual(ids(ordenarPorTurno(mensajes)), ['u-1', 'a-1', 'u-2', 'a-2'])
})

test('filas sin turnId (cron, historial viejo) se ordenan por su hora, como antes', () => {
  const mensajes = [
    msg('c', 'assistant', t('00:30:00')),
    msg('a', 'user', t('00:10:00')),
    msg('b', 'assistant', t('00:20:00')),
  ]
  assert.deepEqual(ids(ordenarPorTurno(mensajes)), ['a', 'b', 'c'])
})

test('bug 2: el transcript sin turnId se adopta al reenganchar y el mensaje del user no se duplica', () => {
  const turnId = '0d0d0d0d-4e4e-4f5f-8a6a-7b7b7b7b7b7b'
  const inicio = 1790901938864 // 00:45:38.864Z, created_at del journal
  const previos = [
    msg('transcript-user', 'user', 1790901939164, { content: 'hola Levy' }), // 39.164: el transcript lo trae sin turnId
    msg('transcript-pensando', 'assistant', 1790901945000, { content: '<!--thinking-->x<!--/thinking-->' }),
  ]
  const salida = restoreTurnPair(previos, { turnId, userMessage: 'hola Levy', startedAt: inicio, protocol: 'durable-v1' }, 'a-1', 'u-1')
  assert.equal(salida.filter(m => m.role === 'user').length, 1)
  const usuario = salida.find(m => m.role === 'user')!
  assert.equal(usuario.id, 'transcript-user')
  assert.equal(usuario.metadata?.turnId, turnId)
  assert.equal(usuario.metadata?.startedAt, inicio)
  const orden = ordenarPorTurno(salida)
  assert.equal(orden.at(-1)!.streaming, true)
  assert.equal(orden[0].id, 'transcript-user')
})

test('bug 2: con turnId en el transcript el par se reconoce por identidad (sin duplicar)', () => {
  const turnId = 'abc'
  const previos = [msg('uuid-abc', 'user', 1000, { content: 'ok', metadata: { turnId } })]
  const salida = restoreTurnPair(previos, { turnId, userMessage: 'ok', startedAt: 900, protocol: 'durable-v1' }, 'a-1', 'u-1')
  assert.equal(salida.filter(m => m.role === 'user').length, 1)
  assert.equal(salida.length, 2)
})

test('bug 2: dos «ok» seguidos no se confunden: el anterior ya tiene su turnId y no se adopta', () => {
  const previos = [msg('ok-anterior', 'user', 1000, { content: 'ok', metadata: { turnId: 'viejo' } })]
  const salida = restoreTurnPair(previos, { turnId: 'nuevo', userMessage: 'ok', startedAt: 1500, protocol: 'durable-v1' }, 'a-1', 'u-1')
  assert.equal(salida.filter(m => m.role === 'user').length, 2)
})

test('bug 2: un mensaje igual pero de hace mucho (>2 min) no se adopta', () => {
  const previos = [msg('viejo-sin-id', 'user', 1_000_000, { content: 'ok' })]
  const salida = restoreTurnPair(previos, { turnId: 'nuevo', userMessage: 'ok', startedAt: 1_000_000 + 10 * 60_000, protocol: 'durable-v1' }, 'a-1', 'u-1')
  assert.equal(salida.filter(m => m.role === 'user').length, 2)
})
