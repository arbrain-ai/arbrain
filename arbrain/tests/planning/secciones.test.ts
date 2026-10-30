import test from 'node:test'
import assert from 'node:assert/strict'
import { esNoNegociable, seccionDe } from '../../src/features/planning/secciones'
import { CALENDARIO_RUTINA, rutinaDeAgenda, rutinaOculta, type EventoAgenda } from '../../src/features/planning/rutinas'

test('seccionDe clasifica por título sin emoji', () => {
  assert.equal(seccionDe({ title: 'GYM · Pierna (cuádriceps)' }), 'gym')
  assert.equal(seccionDe({ title: '👥 Grupal del lunes · Cerebro Artificial' }), 'clase')
  assert.equal(seccionDe({ title: '🧭 Diagnóstico · Cliente Uno' }), 'unoauno')
  assert.equal(seccionDe({ title: '🧠 Trabajo fuerte · monk mode' }), 'trabajo')
  assert.equal(seccionDe({ title: '🌙 A dormir 21:30 · monk mode' }), 'personal')
  assert.equal(seccionDe({ title: 'Comprar VPS' }), null)
})

test('no negociable solo por la marca explícita, nunca por el título', () => {
  assert.ok(esNoNegociable({ description: 'Gym diario.\n#no-negociable' }))
  assert.ok(!esNoNegociable({ description: 'Gym diario' }))
  assert.ok(!esNoNegociable({ description: 'no negociable (sin etiqueta)' }))
})

test('lo no negociable no se oculta a futuro; la demás rutina sí', () => {
  const base = { allDay: false, calendarId: CALENDARIO_RUTINA, end: '2026-10-27T12:00:00-06:00', start: '2026-10-27T09:30:00-06:00' }
  const gym: EventoAgenda = { ...base, id: 'g', title: 'GYM', recurringEventId: 'gym', description: 'x\n#no-negociable' }
  const fuerte: EventoAgenda = { ...base, id: 'f', title: 'Trabajo fuerte', recurringEventId: 'fuerte', description: '' }
  const r = rutinaDeAgenda([gym, fuerte])
  const ahora = Date.parse('2026-10-26T08:00:00-06:00')
  assert.equal(rutinaOculta(gym, r, ahora), false)
  assert.equal(rutinaOculta(fuerte, r, ahora), true)
})
