import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { aceptaCuenta, mezclarSesionesSdk, sesionDeSdk, type SdkConversacionDto } from '../../src/features/chat/lib/sesiones-sdk'

const ms = (iso: string) => Date.parse(iso)
const dto = (id: string, ultimo: string, extra: Partial<SdkConversacionDto> = {}): SdkConversacionDto => ({
  account: 'default', conversationId: `sdk:${id}`, firstPrompt: `mensaje de ${id}`, turns: 3, firstTurnAt: ms('2026-10-01T10:00:00Z'), lastActivityAt: ms(ultimo), ...extra,
})
const fila = (id: string, ultimo: string | null, actualizada = ultimo ?? '2026-09-01T00:00:00Z') => ({ id, updated_at: actualizada, last_message_at: ultimo })

test('la fila SDK tiene la forma de la lista: id sdk:, cuenta null para Daniel, título del primer mensaje', () => {
  const s = sesionDeSdk(dto('18585294', '2026-10-02T00:50:00Z', { firstPrompt: '  Recuérdame\n qué significa   esto de lazo sin feedback negativo, qué es lo que tú ves si usamos cibernética  ' }))
  assert.equal(s.id, 'sdk:18585294')
  assert.equal(s.sdkSessionId, '18585294')
  assert.equal(s.account, null)
  assert.equal(s.isSDKOnly, true)
  assert.equal(s.conTurnosArbrain, true)
  assert.equal(s.title.length, 56)
  assert.ok(s.title.startsWith('Recuérdame qué significa esto'))
  assert.ok(s.title.endsWith('…'))
  assert.equal(s.last_message_at, '2026-10-02T00:50:00.000Z')
  assert.equal(sesionDeSdk(dto('x', '2026-10-01T10:00:00Z', { account: 'bro', firstPrompt: null })).account, 'bro')
  assert.equal(sesionDeSdk(dto('x', '2026-10-01T10:00:00Z', { firstPrompt: null })).title, 'Conversación')
})

test('cuentas: sin filtro entran todas; con filtro, solo las pedidas', () => {
  assert.equal(aceptaCuenta(null, 'bro'), true)
  assert.equal(aceptaCuenta('default', 'default'), true)
  assert.equal(aceptaCuenta('default', 'bro'), false)
  assert.equal(aceptaCuenta('bro', 'default'), false)
  assert.equal(aceptaCuenta('default,bro,codex', 'bro'), true)
  assert.equal(aceptaCuenta('basura', 'bro'), true, 'filtro inválido = sin filtro, como filtroCuentas')
})

test('mezcla: por último mensaje, lo más nuevo primero, recortada al límite', () => {
  const filas = [fila('a', '2026-10-01T20:00:00Z'), fila('b', '2026-10-01T08:00:00Z'), fila('c', null, '2026-09-20T00:00:00Z')]
  const sdk = [dto('s1', '2026-10-01T22:00:00Z'), dto('s2', '2026-10-01T12:00:00Z')]
  const lista = mezclarSesionesSdk(filas, sdk, { cuentas: null, porUltimoMensaje: true, limite: 4 })
  assert.deepEqual(lista.map((s) => (s as { id: string }).id), ['sdk:s1', 'a', 'sdk:s2', 'b'])
})

test('mezcla: sin sesiones SDK devuelve las filas tal cual (mismo orden de la base)', () => {
  const filas = [fila('a', '2026-10-01T20:00:00Z'), fila('b', '2026-10-01T22:00:00Z')]
  assert.equal(mezclarSesionesSdk(filas, [], { cuentas: null, porUltimoMensaje: true, limite: 30 }), filas)
})

test('mezcla: respeta el filtro de cuentas y descarta lo que no es sdk:', () => {
  const sdk = [dto('d', '2026-10-01T22:00:00Z'), dto('b', '2026-10-01T21:00:00Z', { account: 'bro' }), { ...dto('m', '2026-10-01T23:00:00Z'), conversationId: '1111-mc' }]
  const soloBro = mezclarSesionesSdk([], sdk, { cuentas: 'bro', porUltimoMensaje: false, limite: 30 })
  assert.deepEqual(soloBro.map((s) => (s as { id: string }).id), ['sdk:b'])
  const todas = mezclarSesionesSdk([fila('x', '2026-10-01T09:00:00Z')], sdk, { cuentas: null, porUltimoMensaje: false, limite: 30 })
  assert.deepEqual(todas.map((s) => (s as { id: string }).id), ['sdk:d', 'sdk:b', 'x'])
})

test('mezcla: el mismo sdk:<id> en dos cuentas sale una vez, el de actividad más reciente', () => {
  const sdk = [dto('a1e0', '2026-09-30T20:00:00Z'), dto('a1e0', '2026-09-25T01:00:00Z', { account: 'bro' })]
  const lista = mezclarSesionesSdk([], sdk, { cuentas: null, porUltimoMensaje: true, limite: 30 }) as Array<{ id: string; account: string | null }>
  assert.deepEqual(lista.map((s) => [s.id, s.account]), [['sdk:a1e0', null]])
  // Con el filtro de la otra cuenta, solo existe el de esa cuenta.
  const soloBro = mezclarSesionesSdk([], sdk, { cuentas: 'bro', porUltimoMensaje: true, limite: 30 }) as Array<{ id: string; account: string | null }>
  assert.deepEqual(soloBro.map((s) => [s.id, s.account]), [['sdk:a1e0', 'bro']])
})
