import test from 'node:test'
import assert from 'node:assert/strict'
import { agrupar, buscar, contar, diaDe, fechaMovida, instanteCivil, normalizar, rotuloFecha, segmentoDe } from '../../src/features/cabina/panel/todoist-lista'
import type { PlanTask } from '../../src/features/planning/types'

const Z = 'America/Mexico_City', HOY = '2026-10-05'
const t = (id: string, due: string | null, extra: Partial<PlanTask> = {}): PlanTask => ({ id, externalId: id, kind: 'task', title: id, description: '', projectId: 'p1', sectionId: null, parentId: null,
  priority: 4, due, timeZone: null, recurring: false, recurrenceText: null, durationMinutes: null, completed: false, updatedAt: null, ...extra })
const proyectos = [{ id: 'p1', title: '⚙️ Sistema' }, { id: 'p2', title: '🎬 YouTube' }]

test('cada tarea cae en un segmento: vencidas y de hoy en Hoy, futuras en Próximas, sin fecha aparte', () => {
  assert.equal(segmentoDe(t('a', '2026-10-01'), HOY, Z), 'hoy')
  assert.equal(segmentoDe(t('b', '2026-10-05'), HOY, Z), 'hoy')
  assert.equal(segmentoDe(t('c', '2026-10-06'), HOY, Z), 'proximas')
  assert.equal(segmentoDe(t('d', null), HOY, Z), 'sinFecha')
  // 23:30 del 5 en CDMX es el 6 en UTC: manda la zona de Daniel.
  assert.equal(diaDe('2026-10-06T05:30:00Z', Z), '2026-10-05')
})

test('Hoy pone las vencidas arriba en oro y deja lo de hoy con hora primero', () => {
  const g = agrupar('hoy', [t('hoy-sin-hora', '2026-10-05'), t('vieja', '2026-10-01'), t('hoy-10', '2026-10-05T16:00:00Z')], [], HOY, Z, proyectos)
  assert.deepEqual(g.map(x => [x.titulo, x.tono, x.tareas.map(y => y.id)]), [['Vencidas', 'oro', ['vieja']], ['Hoy', undefined, ['hoy-10', 'hoy-sin-hora']]])
})

test('Próximas: mañana, esta semana y después', () => {
  const g = agrupar('proximas', [t('m', '2026-10-06'), t('s', '2026-10-10'), t('d', '2026-10-30')], [], HOY, Z, proyectos)
  assert.deepEqual(g.map(x => x.titulo), ['Mañana', 'Esta semana', 'Después'])
})

test('Sin fecha se agrupa por proyecto en el orden de Todoist, con P1 arriba', () => {
  const g = agrupar('sinFecha', [t('yt', null, { projectId: 'p2' }), t('baja', null), t('alta', null, { priority: 1 }), t('huerfana', null, { projectId: 'x' })], [], HOY, Z, proyectos)
  assert.deepEqual(g.map(x => [x.titulo, x.tareas.map(y => y.id)]), [['⚙️ Sistema', ['alta', 'baja']], ['🎬 YouTube', ['yt']], ['Sin proyecto', ['huerfana']]])
})

test('Hechas se agrupan por el día en que se cerraron, lo más reciente arriba', () => {
  const h = [t('ayer', null, { completed: true, completedAt: '2026-10-04T20:00:00Z' }), t('hoy', null, { completed: true, completedAt: '2026-10-05T15:00:00Z' })]
  assert.deepEqual(agrupar('hechas', [], h, HOY, Z, proyectos).map(g => [g.titulo, g.tareas[0].id]), [['Hoy', 'hoy'], ['Ayer', 'ayer']])
  const c = contar([t('v', '2026-10-01'), t('h', HOY), t('p', '2026-10-09'), t('s', null)], h, HOY, Z)
  assert.deepEqual(c, { hoy: 2, proximas: 1, sinFecha: 1, hechas: 2, vencidas: 1, hechasHoy: 1 })
})

test('buscar ignora acentos, emoji y mayúsculas, y busca también en el proyecto', () => {
  assert.equal(normalizar('🎬 Revisión  '), 'revision')
  const g = buscar('revision youtube', [t('Revisión del guion', null, { projectId: 'p2' }), t('Revisión de crons', null)], [t('revision vieja', null, { projectId: 'p2', completed: true })], proyectos)
  assert.deepEqual(g.map(x => [x.titulo, x.tareas.map(y => y.id)]), [['Pendientes', ['Revisión del guion']], ['Hechas', ['revision vieja']]])
  assert.deepEqual(buscar('   ', [t('a', null)], [], proyectos), [])
})

test('mover a hoy o mañana conserva la hora en la zona de Daniel', () => {
  assert.equal(fechaMovida(t('a', '2026-10-01'), '2026-10-06', Z), '2026-10-06')
  assert.equal(fechaMovida(t('b', '2026-10-01T15:30:00Z'), '2026-10-06', Z), '2026-10-06T15:30:00.000Z')
  assert.equal(instanteCivil('2026-10-06', '09:30', Z), '2026-10-06T15:30:00.000Z')
})

test('el rótulo de la fecha avisa lo vencido en oro', () => {
  assert.deepEqual(rotuloFecha(t('a', '2026-10-02'), HOY, Z), { texto: 'Venció 2 oct', tono: 'oro' })
  assert.equal(rotuloFecha(t('b', '2026-10-05T16:00:00Z'), HOY, Z)?.texto, 'Hoy · 10:00')
  assert.equal(rotuloFecha(t('c', '2026-10-06'), HOY, Z)?.texto, 'Mañana')
  assert.equal(rotuloFecha(t('d', null), HOY, Z), null)
})

test('el botón de orden (18 oct): Prioridad reordena dentro de cada grupo; Proyecto agrupa Hoy por proyecto', () => {
  const activas = [t('vieja', '2026-10-01'), t('tarde', '2026-10-05T23:00:00Z', { priority: 1, projectId: 'p2' }), t('temprano', '2026-10-05T15:00:00Z'), t('sinHora', '2026-10-05', { priority: 2 })]
  assert.deepEqual(agrupar('hoy', activas, [], HOY, Z, proyectos).map(g => g.tareas.map(x => x.id)), [['vieja'], ['temprano', 'tarde', 'sinHora']])
  assert.deepEqual(agrupar('hoy', activas, [], HOY, Z, proyectos, 'prioridad').map(g => g.tareas.map(x => x.id)), [['vieja'], ['tarde', 'sinHora', 'temprano']])
  const porProyecto = agrupar('hoy', activas, [], HOY, Z, proyectos, 'proyecto')
  assert.deepEqual(porProyecto.map(g => g.titulo), ['⚙️ Sistema', '🎬 YouTube'])
  assert.deepEqual(porProyecto[0].tareas.map(x => x.id), ['vieja', 'temprano', 'sinHora'])
})
