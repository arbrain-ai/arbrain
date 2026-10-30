import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { aplicarEspejo } from '../../src/lib/local-first/browser-store'

const vacio = () => ({ tasks: [], events: [], drawings: [], files: [], queue: [], snapshots: {} })
// Solo importan id y los campos que normaliza el espejo; el resto de la fila viaja igual.
const tarea = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, updatedAt: '', ...extra }) as never
const evento = (id: string) => ({ id, title: id, startsAt: '2026-10-05', updatedAt: '' }) as never

test('espejo: un lote equivale a las altas sueltas en orden (lo nuevo arriba, el último gana)', () => {
  const s = vacio() as never as Parameters<typeof aplicarEspejo>[0]
  s.tasks = [tarea('viejo'), tarea('b', { title: 'antes' })]
  aplicarEspejo(s, { tasks: [tarea('a'), tarea('b', { title: 'después' }), tarea('c'), tarea('a', { title: 'a2' })] }, 'SELLO')
  assert.deepEqual(s.tasks.map(t => t.id), ['c', 'a', 'viejo', 'b'])
  assert.equal(s.tasks.find(t => t.id === 'b')!.title, 'después')
  assert.equal(s.tasks.find(t => t.id === 'a')!.title, 'a2')
  assert.equal(s.tasks[0].syncStatus, 'queued')
  assert.equal(s.tasks[0].updatedAt, 'SELLO')
})

test('espejo: no encola nada (traer de la nube no se re-sube) y normaliza eventos', () => {
  const s = vacio() as never as Parameters<typeof aplicarEspejo>[0]
  aplicarEspejo(s, { events: [evento('e1'), evento('e2')] }, 'SELLO')
  assert.equal(s.queue.length, 0)
  assert.deepEqual(s.events.map(e => [e.id, e.status]), [['e2', 'queued'], ['e1', 'queued']])
})
