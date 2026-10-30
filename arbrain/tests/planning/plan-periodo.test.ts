import test from 'node:test'
import assert from 'node:assert/strict'
import { objetivosDelPeriodo, tareasDelPeriodo, ventanaDelPeriodo } from '../../src/features/planning/plan-periodo'
import type { Goal } from '../../src/features/goals/model'
import type { PlanTask } from '../../src/features/planning/types'

const tarea = (id: string, due: string | null, priority = 3, completed = false): PlanTask => ({ id, externalId: id, kind: 'task', title: id, description: '', projectId: null, sectionId: null, parentId: null, priority, due, timeZone: null, recurring: false, recurrenceText: null, durationMinutes: null, completed, updatedAt: null })
const meta = (id: string, scope: Goal['scope'], start: string, end: string): Goal => ({ id, scope, start, end, title: id, success: '', notes: '', status: 'agreed', parentId: null, taskIds: [], eventIds: [], completionNote: '' })

test('el mes cubre su mes civil; día y semana siguen el rango que pinta el calendario', () => {
  assert.deepEqual(ventanaDelPeriodo('mes', '2026-10-01', { from: '', to: '' }), { desde: '2026-10-01', hasta: '2026-11-01' })
  const lunes = new Date(2026, 9, 5), domingo = new Date(2026, 9, 12)
  assert.deepEqual(ventanaDelPeriodo('semana', '2026-10-05', { from: lunes.toISOString(), to: domingo.toISOString() }), { desde: '2026-10-05', hasta: '2026-10-12' })
  assert.deepEqual(ventanaDelPeriodo('dia', '2026-10-04', { from: new Date(2026, 9, 4).toISOString(), to: new Date(2026, 9, 5).toISOString() }), { desde: '2026-10-04', hasta: '2026-10-05' })
})

test('sin rango leído, el día cae al ancla', () => {
  assert.deepEqual(ventanaDelPeriodo('dia', '2026-10-04', { from: '2026-10-04T06:00:00.000Z', to: '2026-10-04T06:00:00.000Z' }), { desde: '2026-10-04', hasta: '2026-10-05' })
})

test('las tareas del periodo: abiertas, con fecha dentro, por hora y luego prioridad', () => {
  const lista = [tarea('b', '2026-10-05', 3), tarea('a', '2026-10-05', 1), tarea('fuera', '2026-10-12'), tarea('sin', null), tarea('hecha', '2026-10-06', 1, true), tarea('c', '2026-10-06')]
  assert.deepEqual(tareasDelPeriodo(lista, '2026-10-05', '2026-10-12', 'America/Mexico_City').map(t => t.id), ['a', 'b', 'c'])
})

test('el objetivo del periodo es el del registro, con el mismo criterio de la vista Objetivos', () => {
  const metas = [meta('mes', 'month', '2026-10-01', '2026-11-01'), meta('s1', 'week', '2026-09-28', '2026-10-05'), meta('s2', 'week', '2026-10-05', '2026-10-12'), meta('d', 'day', '2026-10-05', '2026-10-06')]
  assert.deepEqual(objetivosDelPeriodo(metas, 'mes', '2026-10-14').map(g => g.id), ['mes'])
  assert.deepEqual(objetivosDelPeriodo(metas, 'semana', '2026-10-08').map(g => g.id), ['s2'])
  assert.deepEqual(objetivosDelPeriodo(metas, 'semana', '2026-10-04').map(g => g.id), ['s1'])
  assert.deepEqual(objetivosDelPeriodo(metas, 'dia', '2026-10-05').map(g => g.id), ['d'])
  assert.deepEqual(objetivosDelPeriodo(metas, 'dia', '2026-10-06'), [])
})
