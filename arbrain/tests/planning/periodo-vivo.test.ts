import test from 'node:test'
import assert from 'node:assert/strict'
import { diasEntre, marcasDelDia, movimientoEntre, objetivoDe, periodoDeEscala, puntosDelDia, rejillaDelMes, rotuloEstado, tareasPorDia, tiempoDelPeriodo, avanceDeTareas } from '../../src/features/planning/periodo-vivo'
import { calendarAction } from '../../src/features/planning/shortcuts'
import type { Goal } from '../../src/features/goals/model'
import type { PlanEvent, PlanTask, PlanningSnapshot } from '../../src/features/planning/types'

const goal = (scope: Goal['scope'], start: string, end: string, title: string, status: Goal['status'] = 'agreed'): Goal =>
  ({ id: `${scope}-${start}`, scope, start, end, title, success: '', notes: '', status, parentId: null, taskIds: [], eventIds: [], completionNote: '' })
const ev = (id: string, start: string, end: string, extra: Partial<PlanEvent> = {}): PlanEvent => ({ id, externalId: id, kind: 'event', sourceId: 'cal', account: 'a', calendarId: 'cal', title: id, description: '', location: '', start, end, allDay: false, timeZone: 'America/Mexico_City', etag: null, recurringEventId: null, recurrence: [], editable: true, ...extra })
const task = (id: string, due: string | null, extra: Partial<PlanTask> = {}): PlanTask => ({ id, externalId: id, kind: 'task', title: id, description: '', projectId: null, sectionId: null, parentId: null, priority: 4, due, timeZone: null, recurring: false, recurrenceText: null, durationMinutes: null, completed: false, updatedAt: null, ...extra })
const snap = (events: PlanEvent[]): PlanningSnapshot => ({ ownerId: 'o', sources: [{ id: 'sem', calendarId: 'sem', account: 'a', title: 'Objetivo de la semana', color: null, timeZone: 'America/Mexico_City', editable: false, selected: true, objective: true }], events, tasks: [], projects: [], health: [], loadedAt: '', range: { from: '', to: '' } })

test('el objetivo de la semana es el mismo en todas las escalas: el registro manda, con su estado y la etiqueta del calendario que lo espeja', () => {
  // El caso del 5 oct 2026: el Día decía «Semana 2 · Nutrir…» como firme y la Semana «En planificación».
  const goals = [goal('week', '2026-10-05', '2026-10-12', 'Nutrir a la comunidad y escribir la masterclass', 'draft')]
  const s = snap([ev('obj', '2026-10-02', '2026-10-09', { sourceId: 'sem', allDay: true, title: '🎯 Semana 2 · Nutrir a la comunidad y escribir la masterclass' })])
  for (const dia of ['2026-10-05', '2026-10-08', '2026-10-11']) {
    const o = objetivoDe(goals, s, 'week', dia)!
    assert.equal(o.titulo, 'Nutrir a la comunidad y escribir la masterclass')
    assert.equal(o.estado, 'draft'); assert.equal(o.etiqueta, 'Semana 2'); assert.equal(rotuloEstado(o), 'En planificación')
  }
})

test('sin registro, vale el evento del calendario rotulado; sin nada, no hay objetivo', () => {
  const s = snap([ev('obj', '2026-10-09', '2026-10-16', { sourceId: 'sem', allDay: true, title: '🎯 Semana 3 · Lanzamiento HT' })])
  const o = objetivoDe([], s, 'week', '2026-10-12')!
  assert.deepEqual([o.titulo, o.etiqueta, o.origen, rotuloEstado(o)], ['Lanzamiento HT', 'Semana 3', 'calendario', 'Calendario'])
  assert.equal(objetivoDe([], null, 'week', '2026-10-12'), null)
  assert.equal(rotuloEstado({ estado: 'agreed', origen: 'plan' }), null)
})

test('cada escala pinta su periodo: 4 días desde el ancla, semana de lunes a domingo, mes civil', () => {
  const miercoles = new Date(2026, 9, 7)
  assert.deepEqual(periodoDeEscala('fourDays', miercoles), { desde: '2026-10-07', hasta: '2026-10-11' })
  assert.deepEqual(periodoDeEscala('week', miercoles), { desde: '2026-10-05', hasta: '2026-10-12' })
  assert.deepEqual(periodoDeEscala('month', miercoles), { desde: '2026-10-01', hasta: '2026-11-01' })
  assert.equal(diasEntre('2026-10-05', '2026-10-12').length, 7)
})

test('la rejilla del mes trae solo las semanas que el mes necesita, de lunes a domingo', () => {
  const octubre = rejillaDelMes(new Date(2026, 9, 15))
  assert.equal(octubre.length, 5)
  assert.equal(octubre[0][0], '2026-09-28'); assert.equal(octubre.at(-1)![6], '2026-11-01')
  assert.equal(rejillaDelMes(new Date(2027, 1, 10)).length, 4) // febrero 2027: empieza en lunes y tiene 28 días
  assert.equal(rejillaDelMes(new Date(2026, 7, 10)).length, 6) // agosto 2026: empieza en sábado
})

test('densidad del mes: en días pasados las rutinas callan; primero lo de todo el día, luego lo único, al final las rutinas', () => {
  const dia = { conHora: [
    { id: 'gym', titulo: 'Gym', inicio: new Date(2026, 9, 5, 12).getTime(), fin: new Date(2026, 9, 5, 13).getTime(), color: '#f00', evento: ev('gym', '', '', { recurringEventId: 'r' }) },
    { id: 'llamada', titulo: 'Llamada', inicio: new Date(2026, 9, 5, 16).getTime(), fin: new Date(2026, 9, 5, 17).getTime(), color: '#0f0', evento: ev('llamada', '', '') },
  ], todoElDia: [ev('viaje', '2026-10-05', '2026-10-06', { allDay: true })] }
  const color = () => '#00f'
  assert.deepEqual(marcasDelDia(dia, false, color).map(m => m.id), ['viaje', 'llamada', 'gym'])
  assert.deepEqual(marcasDelDia(dia, true, color).map(m => m.id), ['viaje', 'llamada'])
  assert.deepEqual(puntosDelDia(marcasDelDia(dia, false, color), 2), { colores: ['#00f', '#0f0'], resto: 1 })
})

test('tareas por día (con hora primero) y avance honesto del periodo', () => {
  const ts = [task('b', '2026-10-06'), task('a', '2026-10-06T15:00:00Z'), task('fuera', '2026-10-20')]
  const m = tareasPorDia(ts, ['2026-10-05', '2026-10-06'], 'America/Mexico_City')
  assert.deepEqual(m.get('2026-10-06')!.map(t => t.id), ['a', 'b'])
  assert.deepEqual(m.get('2026-10-05'), [])
  const hechas = [task('h1', null, { completed: true, completedAt: '2026-10-06T18:00:00Z' }), task('h2', null, { completed: true, completedAt: '2026-09-30T18:00:00Z' })]
  assert.deepEqual(avanceDeTareas(ts.slice(0, 2), hechas, '2026-10-05', '2026-10-12', 'America/Mexico_City'), { hechas: 1, pendientes: 2, total: 3 })
})

test('el tiempo del periodo: en qué día vas, antes y después', () => {
  assert.deepEqual({ ...tiempoDelPeriodo('2026-10-05', '2026-10-12', '2026-10-07', new Date(2026, 9, 7, 12).getTime()), fraccion: 0 }, { total: 7, dia: 3, fraccion: 0, estado: 'actual', faltan: 4 })
  assert.equal(tiempoDelPeriodo('2026-10-12', '2026-10-19', '2026-10-07').estado, 'futuro')
  assert.equal(tiempoDelPeriodo('2026-10-12', '2026-10-19', '2026-10-07').faltan, 5)
  assert.equal(tiempoDelPeriodo('2026-09-28', '2026-10-05', '2026-10-07').estado, 'pasado')
})

test('cambiar de escala acerca o aleja; ← → y D · S · M (el 4 quedó libre)', () => {
  assert.equal(movimientoEntre('month', 'day'), 'acercar'); assert.equal(movimientoEntre('day', 'week'), 'alejar'); assert.equal(movimientoEntre('crons', 'day'), null)
  const k = (key: string) => calendarAction({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })
  assert.deepEqual(k('ArrowRight'), { type: 'nav', delta: 1 }); assert.deepEqual(k('ArrowLeft'), { type: 'nav', delta: -1 })
  assert.deepEqual(k('d'), { type: 'mode', mode: 'day' }); assert.equal(k('4'), null); assert.equal(k('2'), null)
  assert.deepEqual(k('s'), { type: 'mode', mode: 'week' }); assert.deepEqual(k('m'), { type: 'mode', mode: 'month' })
})

// ── El hilo (segunda pasada): ritmo, hueco libre, hitos y eje común ──
import { cuentaA, hitosDe, huecoMasLargo, ritmoDe, tramoDePeriodo } from '../../src/features/planning/periodo-vivo'
const bloque = (id: string, dia: number, h0: number, h1: number, serie: string | null = null) => ({ id, titulo: id, inicio: new Date(2026, 9, dia, h0).getTime(), fin: new Date(2026, 9, dia, h1).getTime(), color: '#123456', evento: ev(id, new Date(2026, 9, dia, h0).toISOString(), new Date(2026, 9, dia, h1).toISOString(), { recurringEventId: serie }) })
const semanaDe = () => new Map([5, 6, 7, 8].map(d => [`2026-10-0${d}`, { conHora: [bloque(`gym-${d}`, d, 12, 13, 'gym'), ...(d === 7 ? [bloque('llamada', 7, 16, 17)] : [])], todoElDia: [] as PlanEvent[] }]))

test('el ritmo es lo que se repite en 3 o más días, con su hora más común', () => {
  const r = ritmoDe(semanaDe())
  assert.equal(r.length, 1); assert.equal(r[0].id, 'gym'); assert.equal(r[0].dias, 4); assert.equal(r[0].hora, '12:00')
})

test('los hitos son lo que no se repite; el eje común cubre de 06 a 22 o más', () => {
  assert.deepEqual(hitosDe(semanaDe(), () => null).map(h => h.id), ['llamada'])
  assert.deepEqual(tramoDePeriodo(semanaDe()), { desde: 360, hasta: 1320 })
  const tarde = new Map([['2026-10-05', { conHora: [bloque('noche', 5, 22, 23)], todoElDia: [] as PlanEvent[] }]])
  assert.equal(tramoDePeriodo(tarde).hasta, 23 * 60)
})

test('el hueco libre más largo del día, desde ahora si es hoy', () => {
  const bs = [bloque('a', 5, 6, 10), bloque('b', 5, 12, 13)]
  const h = huecoMasLargo(bs, '2026-10-05')!
  assert.deepEqual([new Date(h.inicio).getHours(), new Date(h.fin).getHours()], [13, 22])
  const tarde = huecoMasLargo(bs, '2026-10-05', new Date(2026, 9, 5, 21, 45).getTime())
  assert.equal(tarde, null) // 15 min no cuentan
  assert.equal(cuentaA('2026-10-17', '2026-10-05'), 'en 12 días'); assert.equal(cuentaA('2026-10-06', '2026-10-05'), 'mañana'); assert.equal(cuentaA('2026-10-02', '2026-10-05'), 'hace 3 días')
})
