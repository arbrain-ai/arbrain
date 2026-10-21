import test from 'node:test'
import assert from 'node:assert/strict'
import { cronologia, esOrden, horaDe, ordenarTareas, siguienteOrden, tareasDelDia, topTareas, vencida } from '../../src/features/planning/orden-tareas'
import type { PlanTask } from '../../src/features/planning/types'

const ZONA = 'America/Mexico_City'
const tarea = (id: string, due: string | null, priority = 4, projectId: string | null = 'cerebro', extra: Partial<PlanTask> = {}): PlanTask => ({
  id, externalId: id, kind: 'task', title: id, description: '', projectId, sectionId: null, parentId: null, priority, due, timeZone: null,
  recurring: false, recurrenceText: null, durationMinutes: null, completed: false, updatedAt: null, ...extra,
})
const ids = (g: { tareas: PlanTask[] }[]) => g.flatMap(x => x.tareas.map(t => t.id))
const proyectos = [{ id: 'cerebro', title: '🧠 Cerebro Artificial' }, { id: 'sistema', title: '⚙️ Sistema' }]

// Lunes 19 oct 2026 (CDMX = UTC-6): horas con zona (Z) y flotantes, como las devuelve Todoist.
const lunes = [
  tarea('sinHora', '2026-10-19', 2),
  tarea('t2030', '2026-10-20T02:30:00Z', 4),       // 20:30 CDMX
  tarea('t0730', '2026-10-19T13:30:00Z', 4),       // 07:30 CDMX
  tarea('t1000', '2026-10-19T10:00:00', 1, 'sistema'), // flotante 10:00
  tarea('vencida', '2026-10-17', 3, 'sistema'),
  tarea('sinHoraP1', '2026-10-19', 1),
]

test('la hora de pared: con zona se lee en CDMX; flotante tal cual', () => {
  assert.equal(horaDe('2026-10-19T13:30:00Z', ZONA), '07:30')
  assert.equal(horaDe('2026-10-20T02:30:00Z', ZONA), '20:30')
  assert.equal(horaDe('2026-10-19T10:00:00', ZONA), '10:00')
})

test('Hora: vencidas arriba, luego con hora por hora del día, luego solo fecha (por prioridad)', () => {
  assert.deepEqual(ids(ordenarTareas(lunes, 'hora', { zona: ZONA })), ['vencida', 't0730', 't1000', 't2030', 'sinHoraP1', 'sinHora'])
  assert.deepEqual([...lunes].sort(cronologia(ZONA)).map(t => t.id), ['vencida', 't0730', 't1000', 't2030', 'sinHoraP1', 'sinHora'])
})

test('Prioridad: P1 → P4 (1 = P1, ya invertida desde la API v1) y la cronología dentro', () => {
  assert.deepEqual(ids(ordenarTareas(lunes, 'prioridad', { zona: ZONA })), ['t1000', 'sinHoraP1', 'sinHora', 'vencida', 't0730', 't2030'])
})

test('Proyecto: grupos en el orden de Todoist con su emoji, cronología dentro; sin proyecto al final', () => {
  const g = ordenarTareas([...lunes, tarea('suelta', '2026-10-19', 4, null)], 'proyecto', { zona: ZONA, proyectos })
  assert.deepEqual(g.map(x => x.titulo), ['🧠 Cerebro Artificial', '⚙️ Sistema', 'Sin proyecto'])
  assert.deepEqual(g.map(x => x.tareas.map(t => t.id)), [['t0730', 't2030', 'sinHoraP1', 'sinHora'], ['vencida', 't1000'], ['suelta']])
})

test('la tarea-objetivo encabeza su grupo en cualquier orden', () => {
  assert.equal(ids(ordenarTareas(lunes, 'hora', { zona: ZONA, primero: 'sinHora' }))[0], 'sinHora')
  assert.equal(ordenarTareas(lunes, 'proyecto', { zona: ZONA, proyectos, primero: 't1000' })[1].tareas[0].id, 't1000')
})

test('Día: las del día y, solo si es hoy, también las vencidas; nunca las completadas', () => {
  const todas = [...lunes, tarea('martes', '2026-10-20T15:00:00Z'), tarea('hecha', '2026-10-19', 4, 'cerebro', { completed: true })]
  assert.deepEqual(tareasDelDia(todas, '2026-10-19', '2026-10-19', ZONA).map(t => t.id).sort(), ['sinHora', 'sinHoraP1', 't0730', 't1000', 't2030', 'vencida'])
  assert.deepEqual(tareasDelDia(todas, '2026-10-19', '2026-10-18', ZONA).map(t => t.id).sort(), ['sinHora', 'sinHoraP1', 't0730', 't1000', 't2030'], 'otro día: sin vencidas')
  assert.ok(vencida(lunes[4], '2026-10-19', ZONA))
  assert.ok(!vencida(lunes[2], '2026-10-19', ZONA))
})

test('el botón cicla Hora → Prioridad → Proyecto → Hora; valores ajenos no cuentan', () => {
  assert.equal(siguienteOrden('hora'), 'prioridad')
  assert.equal(siguienteOrden('prioridad'), 'proyecto')
  assert.equal(siguienteOrden('proyecto'), 'hora')
  assert.ok(esOrden('proyecto') && !esOrden('fecha') && !esOrden(null))
})

test('top 3: vencidas P1 primero, luego P1 → P4 y a igual prioridad por hora; el objetivo encabeza', () => {
  const conVencidaP1 = [...lunes, tarea('vencidaP1', '2026-10-16', 1)]
  assert.deepEqual(topTareas(conVencidaP1, { hoy: '2026-10-19', zona: ZONA }).map(t => t.id), ['vencidaP1', 't1000', 'sinHoraP1'])
  assert.deepEqual(topTareas(lunes, { hoy: '2026-10-19', zona: ZONA }).map(t => t.id), ['t1000', 'sinHoraP1', 'sinHora'])
  assert.deepEqual(topTareas(lunes, { hoy: '2026-10-19', zona: ZONA, primero: 't2030' }).map(t => t.id), ['t2030', 't1000', 'sinHoraP1'])
  assert.equal(topTareas(lunes.slice(0, 2), { hoy: '2026-10-19', zona: ZONA }).length, 2)
  assert.deepEqual(ordenarTareas([], 'hora', { zona: ZONA }), [])
})
