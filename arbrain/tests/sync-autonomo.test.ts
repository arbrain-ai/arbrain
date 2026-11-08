import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { conflictosPorResolver, esperaSync, fraseIrresoluble, INTENTOS_PARA_SUBIR, irresolubles, syncVencidos, toca } from '../src/lib/local-first/sync-autonomo'
import type { SyncQueueItem } from '../src/lib/local-first/types'

const AHORA = Date.parse('2026-11-04T19:00:00Z')
const item = (o: Partial<SyncQueueItem>): SyncQueueItem => ({ id: 'q1', entityType: 'task', entityId: 't1', operation: 'upsert', payloadJson: '{}', status: 'pending', attempts: 0, lastError: null, createdAt: new Date(AHORA - 60_000).toISOString(), updatedAt: new Date(AHORA - 60_000).toISOString(), ...o } as SyncQueueItem)

test('espera creciente: 5 s, 10 s, 20 s… hasta 10 min', () => {
  assert.equal(esperaSync(0), 5_000)
  assert.equal(esperaSync(1), 10_000)
  assert.equal(esperaSync(3), 40_000)
  assert.equal(esperaSync(30), 10 * 60_000)
})

test('lo pendiente sube ya; fallas y conflictos esperan su turno; el chat no es de aquí', () => {
  const recien = new Date(AHORA - 2_000).toISOString()
  const cola = [
    item({ id: 'nuevo' }),
    item({ id: 'falla-reciente', status: 'failed', attempts: 2, updatedAt: recien }),
    item({ id: 'falla-vieja', status: 'failed', attempts: 2 }),
    item({ id: 'conflicto', status: 'conflict', attempts: 1 }),
    item({ id: 'chat', entityType: 'chat_prompt' }),
    item({ id: 'listo', status: 'synced' }),
  ]
  assert.deepEqual(syncVencidos(cola, AHORA), ['nuevo', 'falla-vieja', 'conflicto'])
  assert.deepEqual(conflictosPorResolver(cola, AHORA).map(i => i.id), ['conflicto'])
})

test('solo lo que no se resolvió en N intentos sube a la campana, con una frase para la persona', () => {
  const cola = [item({ id: 'a', status: 'failed', attempts: INTENTOS_PARA_SUBIR - 1 }), item({ id: 'b', status: 'conflict', attempts: INTENTOS_PARA_SUBIR, lastError: '409 version', entityType: 'drawing' }), item({ id: 'c', entityType: 'chat_prompt', status: 'failed', attempts: 99 })]
  assert.deepEqual(irresolubles(cola).map(i => i.id), ['b'])
  const f = fraseIrresoluble(cola[1])
  assert.equal(f.titulo, 'No pude sincronizar un lienzo')
  assert.match(f.cuerpo, /8 veces.*409 version.*sigue guardado/)
})

test('espejo y paquete: tocan por tiempo transcurrido', () => {
  assert.equal(toca(NaN, 1000, AHORA), true)
  assert.equal(toca(AHORA - 999, 1000, AHORA), false)
  assert.equal(toca(AHORA - 1000, 1000, AHORA), true)
})

test('el punto verde ya no está en la barra; el sincronizador sí, y lo manual vive en Ajustes', () => {
  const shell = readFileSync('src/app/(main)/dashboard-shell.tsx', 'utf8')
  assert.doesNotMatch(shell, /RuntimeStatusPill/)
  assert.match(shell, /<SyncAutonomo \/>/)
  assert.match(readFileSync('src/features/configuracion/components/Secciones.tsx', 'utf8'), /<SincronizacionAvanzada \/>/)
})
