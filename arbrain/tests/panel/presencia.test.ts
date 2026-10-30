import { test } from 'node:test'
import assert from 'node:assert/strict'

const casa = (): Storage => { const m = new Map<string, string>(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) }, removeItem: k => { m.delete(k) }, clear: () => m.clear(), key: () => null, length: 0 } }
const g = globalThis as unknown as Record<string, unknown>
g.localStorage = casa()
g.sessionStorage = casa()

test('el dispositivo es estable (sobrevive a recargar) y lo escrito es de esta ventana', async () => {
  const { anotarEscritura, dispositivoId, escrituras, sinSdk } = await import('../../src/features/cabina/panel/presencia')
  const d = dispositivoId()
  assert.match(d, /^d-/)
  assert.equal(dispositivoId(), d)
  assert.deepEqual(escrituras(), {})
  anotarEscritura('sdk:abc', new Date('2026-10-08T01:00:00Z'))
  anotarEscritura('xyz', new Date('2026-10-08T02:00:00Z'))
  anotarEscritura(null)
  assert.deepEqual(escrituras(), { abc: '2026-10-08T01:00:00.000Z', xyz: '2026-10-08T02:00:00.000Z' })
  assert.equal(sinSdk('sdk:abc'), 'abc')
})

test('guarda solo las 20 conversaciones más recientes', async () => {
  const { anotarEscritura, escrituras } = await import('../../src/features/cabina/panel/presencia')
  for (let i = 0; i < 30; i++) anotarEscritura(`c${i}`, new Date(Date.UTC(2026, 9, 8, 3, i)))
  const e = escrituras()
  assert.equal(Object.keys(e).length, 20)
  assert.ok(e.c29 && !e.c0)
})
