import test from 'node:test'
import assert from 'node:assert/strict'
import { avance, bloquesDelDia, duracion, enCurso, faltan, tramoRiel } from '../../src/features/planning/dia-vivo'
import type { PlanEvent } from '../../src/features/planning/types'

const dia = new Date(2026, 9, 5)
const at = (h: number, m = 0, d = 5) => new Date(2026, 9, d, h, m).toISOString()
const ev = (id: string, start: string, end: string, extra: Partial<PlanEvent> = {}): PlanEvent => ({ id, externalId: id, kind: 'event', sourceId: 'cal', account: 'a', calendarId: 'cal', title: id, description: '', location: '', start, end, allDay: false, timeZone: null, etag: null, recurringEventId: null, recurrence: [], editable: true, ...extra } as PlanEvent)
const todos = () => true, sinColor = () => null

test('la hoja del día toma los bloques con hora del día, ordenados, y aparta los de todo el día y los ocultos', () => {
  const eventos = [ev('gym', at(12), at(13)), ev('despertar', at(5), at(6)), ev('ayer', at(9, 0, 4), at(10, 0, 4)),
    ev('viaje', '2026-10-05', '2026-10-06', { allDay: true }), ev('oculto', at(7), at(8), { sourceId: 'objetivos' })]
  const { conHora, todoElDia } = bloquesDelDia(eventos, dia, e => e.sourceId !== 'objetivos', sinColor)
  assert.deepEqual(conHora.map(b => b.id), ['despertar', 'gym'])
  assert.deepEqual(todoElDia.map(e => e.id), ['viaje'])
})

test('un bloque que cruza la medianoche se recorta al día', () => {
  const { conHora } = bloquesDelDia([ev('noche', at(23), at(1, 0, 6))], dia, todos, sinColor)
  assert.equal(conHora[0].fin, new Date(2026, 9, 6).getTime())
})

test('en curso y siguiente: si se enciman manda el que empezó después', () => {
  const { conHora } = bloquesDelDia([ev('a', at(8), at(10)), ev('b', at(9), at(9, 30)), ev('c', at(11), at(12))], dia, todos, sinColor)
  const nueve15 = new Date(2026, 9, 5, 9, 15).getTime()
  assert.equal(enCurso(conHora, nueve15).actual?.id, 'b')
  assert.equal(enCurso(conHora, nueve15).sigue?.id, 'c')
  assert.equal(enCurso(conHora, new Date(2026, 9, 5, 13).getTime()).actual, undefined)
  assert.equal(avance(conHora[0], new Date(2026, 9, 5, 9).getTime()), 0.5)
})

test('textos cortos de tiempo y tramo del riel', () => {
  assert.equal(duracion(45), '45 min'); assert.equal(duracion(120), '2 h'); assert.equal(duracion(95), '1 h 35 min')
  assert.equal(faltan(0), 'en 1 min')
  const { conHora } = bloquesDelDia([ev('temprano', at(4, 30), at(5)), ev('tarde', at(22, 15), at(23))], dia, todos, sinColor)
  assert.deepEqual(tramoRiel(conHora, dia), { desde: 4 * 60, hasta: 23 * 60 })
  assert.deepEqual(tramoRiel([], dia), { desde: 6 * 60, hasta: 22 * 60 })
})
