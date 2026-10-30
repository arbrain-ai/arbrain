import test from 'node:test'
import assert from 'node:assert/strict'
import { CALENDARIO_RUTINA, rutinaDeAgenda, rutinaOculta, type EventoAgenda } from '../../src/features/planning/rutinas'
import { fantasmasAntesDe, type SemanaPerfecta } from '../../src/features/planning/semana-perfecta'
import { AJUSTES_BASE, leerAjustes } from '../../src/features/planning/ajustes'

// 26 oct 2026, Daniel: «no quiero ver mi rutina a futuro, ya me la sé! la veo al pasado justo lo que hice».
let n = 0
const NEGOCIO = 'negocio@example.com'
const ev = (title: string, dia: string, hora: string, extra: Partial<EventoAgenda> = {}): EventoAgenda =>
  ({ id: `e${n++}`, title, start: `${dia}T${hora}:00-06:00`, end: `${dia}T${hora}:00-06:00`, allDay: false, recurringEventId: null, calendarId: CALENDARIO_RUTINA, ...extra })
const semana = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']
const persona = [{ self: true }, { self: false }]

function agenda() {
  const despierto = semana.map(d => ev('🌅 5:30 Despierto · rutina matutina', d, '05:30', { recurringEventId: 'despierto' }))
  const fuerte = semana.map(d => ev('🧠 Trabajo fuerte · monk mode', d, '06:00', { recurringEventId: 'fuerte' }))
  const gym = semana.map(d => ev('GYM', d, '09:30', { recurringEventId: 'gym' }))
  const dormir = semana.map(d => ev('🌙 A dormir 21:30 · monk mode', d, '21:30', { recurringEventId: 'dormir' }))
  const grabar = ev('🎥 Grabar onboarding: Bienvenida + Cómo funciona', '2026-10-26', '06:00')
  const grupalLunes = ev('👥 Grupal del lunes · Cerebro Artificial', '2026-10-26', '12:00', { recurringEventId: 'grupal-lunes', calendarId: NEGOCIO })
  const grupal = ['2026-10-28', '2026-10-30'].map(d => ev('👥 Grupal · Cerebro Artificial', d, '12:00', { recurringEventId: 'grupal', calendarId: NEGOCIO, attendees: persona, meetUrl: 'https://meet' }))
  const nivel7 = ev('Prospección en Frío con IA · Nivel 7', '2026-10-27', '12:00', { recurringEventId: 'n7', calendarId: NEGOCIO })
  const diagnosticoA = ev('🧭 Diagnóstico · Cliente Uno', '2026-10-30', '15:15', { calendarId: NEGOCIO, attendees: persona, meetUrl: 'https://meet' })
  const diagnosticoB = ev('🧭 Diagnóstico · Cliente Dos', '2026-10-31', '17:30', { calendarId: NEGOCIO, attendees: persona, meetUrl: 'https://meet' })
  const fase = ev('🧠 Fase 1 · Tu cerebro (S0–1)', '2026-10-21', '00:00', { allDay: true, start: '2026-10-21', end: '2026-11-02', recurringEventId: null })
  return { despierto, fuerte, gym, dormir, grabar, grupalLunes, grupal, nivel7, diagnosticoA, diagnosticoB, fase }
}

test('la rutina es lo recurrente del calendario Trabajo Duro sin invitados', () => {
  const a = agenda()
  const todos = [...a.despierto, ...a.fuerte, ...a.gym, ...a.dormir, a.grabar, a.grupalLunes, ...a.grupal, a.nivel7, a.diagnosticoA, a.diagnosticoB, a.fase]
  const r = rutinaDeAgenda(todos)
  for (const e of [...a.despierto, ...a.fuerte, ...a.gym, ...a.dormir]) assert.ok(r.has(e.id), e.title)
  for (const e of [a.grabar, a.grupalLunes, ...a.grupal, a.nivel7, a.diagnosticoA, a.diagnosticoB, a.fase]) assert.ok(!r.has(e.id), e.title)
})

test('el lun 26 a las 6:30 se ven Despierto y Trabajo fuerte; no GYM ni A dormir; los compromisos de la semana sí', () => {
  const a = agenda()
  const todos = [...a.despierto, ...a.fuerte, ...a.gym, ...a.dormir, a.grabar, a.grupalLunes, ...a.grupal, a.nivel7, a.diagnosticoA, a.diagnosticoB, a.fase]
  const r = rutinaDeAgenda(todos), ahora = Date.parse('2026-10-26T06:30:00-06:00')
  const ve = (e: EventoAgenda) => !rutinaOculta(e, r, ahora)
  assert.ok(ve(a.despierto[0]) && ve(a.fuerte[0]), 'lo que ya empezó se ve')
  assert.ok(!ve(a.gym[0]) && !ve(a.dormir[0]), 'lo que falta de hoy no')
  assert.ok(!a.gym.slice(1).some(ve) && !a.fuerte.slice(1).some(ve), 'los días que vienen tampoco')
  for (const e of [a.grabar, a.grupalLunes, ...a.grupal, a.nivel7, a.diagnosticoA, a.diagnosticoB]) assert.ok(ve(e), e.title)
  // El interruptor «Rutina a futuro» la devuelve entera.
  assert.ok(todos.every(e => !rutinaOculta(e, r, ahora, true)))
})

test('lo de días pasados se ve entero: es lo que hizo', () => {
  const a = agenda()
  const r = rutinaDeAgenda([...a.gym, ...a.dormir]), ahora = Date.parse('2026-11-02T08:00:00-06:00')
  assert.ok([...a.gym, ...a.dormir].every(e => !rutinaOculta(e, r, ahora)))
})

test('una ocurrencia renombrada de la serie es única: se ve a futuro', () => {
  const a = agenda()
  const preparar = { ...a.fuerte[2], title: '🧹 Preparar la grupal' }
  const fuerte = [...a.fuerte.slice(0, 2), preparar, ...a.fuerte.slice(3)]
  const r = rutinaDeAgenda(fuerte)
  assert.ok(!r.has(preparar.id))
  assert.ok(r.has(a.fuerte[3].id))
})

test('otra instalación (sin el calendario Trabajo Duro): vale la marca por frecuencia, sin compromisos', () => {
  const OTRO = 'otro-calendario'
  const gym = semana.map(d => ev('GYM', d, '07:00', { recurringEventId: 'g', calendarId: OTRO }))
  const clase = ['2026-10-26', '2026-10-28', '2026-10-30'].map(d => ev('Clase con alumnos', d, '12:00', { recurringEventId: 'c', calendarId: OTRO, attendees: persona }))
  const r = rutinaDeAgenda([...gym, ...clase])
  assert.ok(gym.every(e => r.has(e.id)))
  assert.ok(clase.every(e => !r.has(e.id)))
})

test('la Semana Perfecta: los fantasmas solo hasta ahora', () => {
  const sp: SemanaPerfecta = { actualizado: '2026-10-25T00:00:00Z', bloques: [
    { dia: 1, desde: 6 * 60, hasta: 9 * 60, titulo: 'Producir', cuadrante: 'producir' },
    { dia: 1, desde: 14 * 60, hasta: 15 * 60, titulo: 'Comida', cuadrante: 'reemplazar' },
    { dia: 2, desde: 6 * 60, hasta: 9 * 60, titulo: 'Producir', cuadrante: 'producir' },
  ] }
  const [y, m, d] = [2026, 9, 26], ahora = new Date(y, m, d, 6, 30).getTime()
  assert.deepEqual(fantasmasAntesDe(sp, '2026-10-26', ahora).map(b => b.titulo), ['Producir'])
  assert.deepEqual(fantasmasAntesDe(sp, '2026-10-27', ahora), [])
  assert.equal(fantasmasAntesDe(sp, '2026-10-26', null).length, 2)
})

test('el interruptor nace apagado y se recuerda', () => {
  assert.equal(AJUSTES_BASE.rutinaFutura, false)
  assert.equal(leerAjustes(JSON.stringify({ v: 3, rutinaFutura: true })).rutinaFutura, true)
  assert.equal(leerAjustes(JSON.stringify({ v: 3 })).rutinaFutura, false)
})
