import test from 'node:test'
import assert from 'node:assert/strict'
import { borradorDe, cambios, datosDe, datosDeCambio, enlaces, etiquetaDuracion, etiquetaFecha, fechasRapidas, leerHora, semanasDelMes } from '../../src/features/planning/detalle'
import { inverseFor } from '../../src/features/planning/undo'
import type { PlanEvent, PlanTask } from '../../src/features/planning/types'

process.env.TZ = 'America/Mexico_City'
const sources = [{ id: 's', calendarId: 'c', account: 'a', title: 'Trabajo', color: null, timeZone: 'America/Mexico_City', editable: true, selected: true, objective: false }]
const task: PlanTask = { id: 'todoist:1', externalId: '1', kind: 'task', title: 'Guion', description: '', projectId: 'p', sectionId: null, parentId: null, priority: 2,
  due: '2026-10-05T10:00:00', timeZone: null, recurring: true, recurrenceText: 'every day', durationMinutes: 45, completed: false, updatedAt: 'v1' }
const event: PlanEvent = { id: 'google:e', externalId: 'e', kind: 'event', sourceId: 's', account: 'a', calendarId: 'c', title: 'Retiro', description: '', location: '',
  start: '2026-10-10', end: '2026-10-13', allDay: true, timeZone: 'America/Mexico_City', etag: 'v1', recurringEventId: null, recurrence: [], editable: true }

test('el borrador separa día, hora y duración, y vuelve a los datos de la pluma', () => {
  const b = borradorDe({ item: task }, { sources })
  assert.deepEqual([b.day, b.time, b.minutes, b.priority, b.projectId], ['2026-10-05', '10:00', 45, 2, 'p'])
  const d = datosDe({ ...b, time: '', day: '2026-10-06' }, 'America/Mexico_City')
  assert.equal(d.due, '2026-10-06'); assert.equal(d.durationMinutes, null)
  const e = borradorDe({ item: event }, { sources })
  assert.deepEqual([e.day, e.endDay, e.time], ['2026-10-10', '2026-10-12', ''])
  const de = datosDe(e, 'America/Mexico_City')
  assert.deepEqual([de.start, de.end, de.allDay], ['2026-10-10', '2026-10-13', true])
  const timed = datosDe({ ...e, time: '09:30', minutes: 90 }, 'America/Mexico_City')
  assert.equal(timed.start, '2026-10-10T15:30:00.000Z'); assert.equal(timed.end, '2026-10-10T17:00:00.000Z')
  assert.throws(() => datosDe({ ...b, title: '  ' }, 'UTC'), /nombre/)
})

test('el autoguardado de una tarea solo manda lo que cambió (una recurrente no recibe su fecha si nadie la tocó)', () => {
  const base = borradorDe({ item: task }, { sources })
  assert.deepEqual(cambios(base, base), [])
  const titulo = datosDeCambio({ ...base, title: 'Guion v2' }, base, 'UTC')
  assert.deepEqual(titulo, { title: 'Guion v2' })
  const fecha = datosDeCambio({ ...base, minutes: 60 }, base, 'UTC')
  assert.deepEqual(Object.keys(fecha).sort(), ['due', 'durationMinutes', 'title'])
  assert.deepEqual(cambios({ ...base, projectId: 'q' }, base), ['projectId'])
})

test('fechas rápidas, etiquetas y duraciones', () => {
  const lunes = new Date(2026, 9, 5, 8, 30)
  assert.deepEqual(fechasRapidas(lunes).map(f => [f.label, f.day]), [['Hoy', '2026-10-05'], ['Mañana', '2026-10-06'], ['Este fin', '2026-10-10'], ['Próx. semana', '2026-10-12']])
  assert.equal(fechasRapidas(new Date(2026, 9, 10, 9)).find(f => f.id === 'finde')!.day, '2026-10-10')
  assert.deepEqual(etiquetaFecha({ kind: 'task', day: '2026-10-05', time: '10:00', minutes: 45, endDay: '' }, lunes), { texto: 'Hoy · 10:00 – 10:45', tono: 'hoy' })
  assert.equal(etiquetaFecha({ kind: 'task', day: '2026-10-02', time: '', minutes: 30, endDay: '' }, lunes).tono, 'vencida')
  assert.equal(etiquetaFecha({ kind: 'task', day: '', time: '', minutes: 30, endDay: '' }, lunes).texto, 'Sin fecha')
  assert.match(etiquetaFecha({ kind: 'event', day: '2026-10-10', time: '', minutes: 60, endDay: '2026-10-12' }, lunes).texto, /sáb 10 oct → lun 12 oct/)
  assert.deepEqual([etiquetaDuracion(45), etiquetaDuracion(60), etiquetaDuracion(90)], ['45 min', '1 h', '1 h 30'])
})

test('leer la hora escrita como la escribe una persona', () => {
  assert.deepEqual(['9', '930', '9:30', '9.30', '9pm', '9:30 pm', '21h', '12am', '25', 'hola'].map(leerHora),
    ['09:00', '09:30', '09:30', '09:30', '21:00', '21:30', '21:00', '00:00', null, null])
})

test('enlaces detectados sin repetir, con su tipo', () => {
  const l = enlaces(['Ver https://docs.google.com/document/d/x/edit.', 'y https://meet.google.com/abc y https://docs.google.com/document/d/x/edit', 'https://github.com/a/b/pull/3'])
  assert.deepEqual(l.map(x => [x.tipo, x.etiqueta]), [['doc', 'Documento de Google'], ['meet', 'Videollamada'], ['codigo', 'a/b']])
})

test('el mes del selector empieza en lunes y cubre seis semanas', () => {
  const s = semanasDelMes(new Date(2026, 9, 15))
  assert.equal(s.length, 6); assert.equal(s[0][0].getDay(), 1); assert.equal(s[0][0].getDate(), 28)
})

test('mover de proyecto se deshace regresando al proyecto anterior', () => {
  const op = { ownerId: 'o', requestId: 'r', kind: 'task' as const, action: 'move' as const, externalId: '1', updatedAt: 'v1', data: { projectId: 'q' } }
  const inv = inverseFor(op, task, { ok: true, task: { ...task, projectId: 'q', updatedAt: 'v2' } })!
  const back = inv.build([{ ...task, projectId: 'q', updatedAt: 'v2' }], new Map())!
  assert.deepEqual([back.action, back.data, back.updatedAt], ['move', { projectId: 'p' }, 'v2'])
})
