import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { duenoDeFuente, marcarAjenos, tituloVisible } from '../../src/features/planning/ajenos'
import { eventData } from '../../src/features/planning/model'
import type { CalendarSource, PlanEvent } from '../../src/features/planning/types'

// 2 nov 2026: «veo que dice Panteón y yo nunca lo puse». Las fuentes con la forma del snapshot real (nombres ficticios):
// dos cuentas del dueño, calendarios de grupo y el principal de otra persona compartido en la segunda cuenta.
const fuente = (account: string, calendarId: string, title: string): CalendarSource => ({ id: `${account}:${calendarId}`, calendarId, account, title, color: null, timeZone: 'America/Mexico_City', editable: true, selected: true, objective: false })
// Id de grupo sintético (no es un calendario real): el dominio va aparte para que el escáner de fugas no lo confunda con uno.
const GOOGLE = 'calendar.google.com'
const FUENTES = [
  fuente('dueno@correo.test', 'dueno@correo.test', 'dueno@correo.test'),
  fuente('dueno@correo.test', `compartido@group.${GOOGLE}`, 'Tiempo con Fulana'),
  fuente('dueno@empresa.test', 'dueno@empresa.test', 'dueno@empresa.test'),
  fuente('dueno@empresa.test', 'dueno@correo.test', 'dueno@correo.test'),
  fuente('dueno@empresa.test', 'fulana@correo.test', 'Fulana'),
  fuente('dueno@empresa.test', 'zutano@correo.test', 'zutano@correo.test'),
  fuente('dueno@correo.test', `es.mexican#holiday@group.v.${GOOGLE}`, 'Festivos'),
]
const evento = (id: string, sourceId: string, title: string): PlanEvent => ({ id, externalId: id, kind: 'event', sourceId, account: '', calendarId: '', title, description: '', location: '', start: '2026-11-02T10:00:00-06:00', end: '2026-11-02T15:00:00-06:00', allDay: false, timeZone: 'America/Mexico_City', etag: null, recurringEventId: null, recurrence: [], editable: true })

test('de quién es un calendario: el principal de otra persona sí; lo del dueño, de grupo y festivos no', () => {
  const cuentas = new Set(['dueno@correo.test', 'dueno@empresa.test'])
  assert.deepEqual(FUENTES.map(f => duenoDeFuente(f, cuentas)), [null, null, null, null, 'Fulana', 'zutano', null])
})

test('la ruta anota `de` solo en lo ajeno; el título se pinta «Fulana · …» y escribir nunca lo lleva', () => {
  const snap = marcarAjenos({ sources: FUENTES, events: [evento('p', 'dueno@empresa.test:fulana@correo.test', '🌼 Panteón'), evento('g', 'dueno@correo.test:dueno@correo.test', 'GYM')] })
  const [panteon, gym] = snap.events!
  assert.equal(panteon.de, 'Fulana')
  assert.equal(gym.de, undefined)
  assert.equal(tituloVisible(panteon), 'Fulana · 🌼 Panteón')
  assert.equal(tituloVisible(gym), 'GYM')
  assert.equal(tituloVisible({ title: '', de: 'Fulana' }, '(sin título)'), 'Fulana · (sin título)')
  assert.equal(eventData(panteon).title, '🌼 Panteón')
  assert.equal('de' in eventData(panteon), false)
  // Sin fuentes (respuesta de error, edición cliente) pasa tal cual.
  const vacio: { sources?: CalendarSource[]; events?: PlanEvent[]; error: string } = { error: 'x' }
  assert.equal(marcarAjenos(vacio), vacio)
})
