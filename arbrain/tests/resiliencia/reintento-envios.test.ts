// Reintento automático de mensajes guardados (resiliencia, 12 oct 2026). Antes: con el servidor caído cada mensaje
// quedaba en «Mensaje guardado · Reintentar este envío» hasta que alguien lo tocaba.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deliverOfflineChat } from '../../src/features/chat/lib/offline-envelope'
import { esFallaTransitoria, esperaReintento, proximoReintento, reintentosVencidos, MARCA_TRANSITORIA } from '../../src/features/chat/lib/reintento-envios'
import { CHAT_RECEIPT_GRACE_MS } from '../../src/features/chat/lib/draft-visibility'
import type { SyncQueueItem } from '../../src/lib/local-first/types'

const OWNER = 'p1'
const T0 = Date.parse('2026-10-12T06:00:00.000Z')
const intent = { version: 1, owner: OWNER, account: 'default', conversationId: 'c1', model: 'claude-sonnet', effort: 'high', fast: false, ultracode: false, observedAt: '2026-10-12T05:59:00.000Z' }
const sobre = (extra: Record<string, unknown> = {}) => ({ version: 2, expectedOwnerId: OWNER, chatSessionId: 'c1', turnId: 't1', account: 'default', message: 'hola', source: 'desktop', intent, ...extra })
const fila = (o: Partial<SyncQueueItem> & { sobre?: Record<string, unknown> } = {}): SyncQueueItem => ({
  id: o.id ?? 'q1', entityType: 'chat_prompt', entityId: 'e', operation: 'create',
  payloadJson: JSON.stringify({ localContext: { chatEnvelope: o.sobre ?? sobre() } }),
  status: o.status ?? 'failed', attempts: o.attempts ?? 1, lastError: o.lastError ?? `Arbrain no está disponible ahora (503). ${MARCA_TRANSITORIA}`,
  createdAt: o.createdAt ?? new Date(T0).toISOString(), updatedAt: o.updatedAt ?? new Date(T0).toISOString(),
})

test('espera creciente con tope: 3, 6, 12, 24, 48 y 60 s', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(esperaReintento), [3000, 6000, 12000, 24000, 48000, 60000, 60000])
})

test('solo se reintenta solo lo confirmado y pasajero', () => {
  assert.equal(proximoReintento(fila({ attempts: 2 }), OWNER, null), T0 + 12_000)
  // Falla que pide decisión (4xx, conflicto): no se toca.
  assert.equal(proximoReintento(fila({ lastError: 'La conversación tiene otros ajustes.' }), OWNER, null), null)
  // Sin selección confirmada: NUNCA se despacha por la persona.
  assert.equal(proximoReintento(fila({ sobre: sobre({ intent: undefined }) }), OWNER, null), null)
  // Comandos y otra identidad: no.
  assert.equal(proximoReintento(fila({ sobre: sobre({ message: '/model x' }) }), OWNER, null), null)
  assert.equal(proximoReintento(fila(), 'otra', null), null)
  // Pendiente sin recibo: espera el plazo del recibo; el turno que se está enviando ahora no se toca.
  assert.equal(proximoReintento(fila({ status: 'pending', attempts: 0, lastError: null }), OWNER, null), T0 + CHAT_RECEIPT_GRACE_MS)
  assert.equal(proximoReintento(fila({ status: 'pending', attempts: 0, lastError: null }), OWNER, 't1'), null)
  assert.equal(proximoReintento(fila({ status: 'synced' }), OWNER, null), null)
  assert.equal(proximoReintento(fila({ status: 'cancelled' }), OWNER, null), null)
  assert.deepEqual(reintentosVencidos([fila({ attempts: 0 })], OWNER, null, T0 + 2_999), [])
  assert.deepEqual(reintentosVencidos([fila({ attempts: 0 })], OWNER, null, T0 + 3_000), ['q1'])
})

test('entrega: red caída, plazo y 5xx/429 son pasajeros; 4xx no', async () => {
  const con = (r: () => Promise<Response>) => (async () => r()) as unknown as typeof fetch
  const falla = async (f: typeof fetch) => { try { await deliverOfflineChat(sobre(), f); return null } catch (e) { return (e as Error).message } }
  assert.ok(esFallaTransitoria(await falla(con(async () => { throw new TypeError('fetch failed') }))))
  assert.ok(esFallaTransitoria(await falla(con(async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }) }))))
  const m503 = await falla(con(async () => Response.json({ error: 'La base de Arbrain no responde ahora.' }, { status: 503 })))
  assert.equal(m503, `La base de Arbrain no responde ahora. ${MARCA_TRANSITORIA}`)
  assert.ok(esFallaTransitoria(await falla(con(async () => new Response('<html>', { status: 502 })))))
  assert.ok(esFallaTransitoria(await falla(con(async () => new Response('', { status: 429 })))))
  assert.equal(esFallaTransitoria(await falla(con(async () => Response.json({ error: 'Falta tu llave' }, { status: 412 })))), false)
  assert.equal(esFallaTransitoria(await falla(con(async () => Response.json({ error: 'Turn conflict' }, { status: 409 })))), false)
})

test('exactamente una vez: caída, recibo perdido y reintentos producen UN turno', async () => {
  // Servidor falso con la semántica del journal del daemon: accept idempotente por turnId.
  const turnos = new Map<string, number>()
  let fase: 'caido' | 'recibo-perdido' | 'arriba' = 'caido'
  const servidor = (async (_url: string, init: RequestInit) => {
    if (fase === 'caido') throw new TypeError('fetch failed')
    const body = JSON.parse(String(init.body)) as { turnId: string }
    turnos.set(body.turnId, (turnos.get(body.turnId) ?? 0) + 1)
    if (fase === 'recibo-perdido') return new Response('upstream', { status: 504 })
    return Response.json({ accepted: true, turnId: body.turnId, status: 'queued' }, { status: 202 })
  }) as unknown as typeof fetch
  const intentos: string[] = []
  for (const f of ['caido', 'caido', 'recibo-perdido', 'arriba', 'arriba'] as const) {
    fase = f
    try { intentos.push(await deliverOfflineChat(sobre(), servidor)); break } catch (e) {
      assert.ok(esFallaTransitoria((e as Error).message), `${f}: ${(e as Error).message}`)
      intentos.push('falla')
    }
  }
  assert.deepEqual(intentos, ['falla', 'falla', 'falla', 't1'])
  // El servidor vio el mismo turnId dos veces (recibo perdido + reintento): el journal lo deduplica a un turno.
  assert.deepEqual([...turnos.keys()], ['t1'])
})

test('el daemon deduplica por turn_id + huella y congela el contexto del primer intento', () => {
  const j = readFileSync(new URL('../../server/src/chat-runtime/journal.ts', import.meta.url), 'utf8')
  assert.match(j, /turn_id TEXT PRIMARY KEY/)
  assert.match(j, /if \(existing\) \{[\s\S]{0,400}return \{ created: false, turn: this\.decode\(existing\) \}/)
  const s = readFileSync(new URL('../../server/src/server.ts', import.meta.url), 'utf8')
  assert.match(s, /freezeChatContext\(parsed, previouslyAccepted\?\.input/)
})

test('useChat revisa la cola sola y la tarjeta dice que el mensaje sale solo', () => {
  const u = readFileSync(new URL('../../src/features/chat/hooks/useChat.ts', import.meta.url), 'utf8')
  assert.match(u, /reintentosVencidos\(await listSyncQueue\(\), owner, pendingSubmissionRef\.current\?\.turnId\)/)
  assert.match(u, /if \(vencidos\.length\) await syncChatQueue\(owner, vencidos\)/)
  const d = readFileSync(new URL('../../src/features/chat/components/ChatDraftStatus.tsx', import.meta.url), 'utf8')
  assert.match(d, /Mensaje guardado · se envía solo/)
  assert.match(d, /No hace falta que hagas nada/)
})
