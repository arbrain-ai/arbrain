import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { arrastrableEnDia, guardaInvitados, invitadosDe, listaNombres, soltarEnDia } from '../../src/features/planning/arrastre-dia'
import type { PlanEvent, PlanTask } from '../../src/features/planning/types'

// Arrastrar en el Día (11 nov 2026): la hora nueva sale de `soltar` de la Semana, redondeada a 15 min; con invitados, se pregunta.
const D = '2026-11-11'
const at = (h: number, m = 0, dia = D) => { const [y, mo, d] = dia.split('-').map(Number); return new Date(y, mo - 1, d, h, m) }
const ev = (extra: Partial<PlanEvent> = {}): PlanEvent => ({
  id: 'google:x', externalId: 'x', kind: 'event', sourceId: 'trabajo', account: 'owner@example.test', calendarId: 'trabajo', title: 'Trabajo fuerte',
  description: '', location: '', start: at(7, 30).toISOString(), end: at(9, 30).toISOString(), allDay: false, timeZone: 'America/Mexico_City',
  etag: 'v1', recurringEventId: null, recurrence: [], editable: true, ...extra,
})
const TRAMO_DIA = { desde: 5 * 60, hasta: 22 * 60 }
const minutos = (d: Date) => d.getHours() * 60 + d.getMinutes()

test('soltar en otra hora conserva la duración y redondea al cuarto de hora más cercano', () => {
  const r = soltarEnDia(ev(), D, 10 * 60 + 7, TRAMO_DIA)!
  assert.equal(minutos(r.inicio), 10 * 60)
  assert.equal(r.fin.getTime() - r.inicio.getTime(), 2 * 3_600_000)
  const r2 = soltarEnDia(ev(), D, 10 * 60 + 8, TRAMO_DIA)!
  assert.equal(minutos(r2.inicio), 10 * 60 + 15)
  assert.equal(r2.inicio.toDateString(), at(0).toDateString(), 'el Día no cambia de día')
})

test('soltar en su misma hora (o a menos de medio paso) no escribe nada', () => {
  assert.equal(soltarEnDia(ev(), D, 7 * 60 + 30, TRAMO_DIA), null)
  assert.equal(soltarEnDia(ev(), D, 7 * 60 + 36, TRAMO_DIA), null)
})

test('soltar fuera del tramo lo deja en la orilla: ni antes de su primera hora ni empezando después de la última', () => {
  assert.equal(minutos(soltarEnDia(ev(), D, 2 * 60, TRAMO_DIA)!.inicio), 5 * 60)
  assert.equal(minutos(soltarEnDia(ev(), D, 23 * 60, TRAMO_DIA)!.inicio), 22 * 60 - 15)
})

test('se arrastra lo editable con hora y entero en el día; lo de todo el día, lo ajeno y lo que cruza la medianoche, no', () => {
  assert.equal(arrastrableEnDia(ev(), D), true)
  assert.equal(arrastrableEnDia(ev({ allDay: true, start: D, end: '2026-11-12' }), D), false)
  assert.equal(arrastrableEnDia(ev({ editable: false }), D), false)
  assert.equal(arrastrableEnDia(ev({ start: at(23).toISOString(), end: at(1, 0, '2026-11-12').toISOString() }), D), false)
  assert.equal(arrastrableEnDia(ev({ start: at(21).toISOString(), end: at(0, 0, '2026-11-12').toISOString() }), D), true, 'termina justo a medianoche')
})

test('guarda de invitados: sin otras personas se mueve directo; con ellas, pregunta diciendo quiénes verán la hora nueva', () => {
  const solo = ev({ attendees: [{ email: 'yo@example.test', name: 'Yo', response: 'accepted', self: true, organizer: true }] })
  assert.equal(guardaInvitados(solo, at(10)), null)
  assert.equal(guardaInvitados(ev(), at(10)), null)
  const grupal = ev({ title: 'Grupal', attendees: [
    { email: 'yo@example.test', name: 'Yo', response: 'accepted', self: true, organizer: true },
    { email: 'alfa@example.test', name: 'Alfa', response: 'accepted', self: false, organizer: false },
    { email: 'beta@example.test', name: '', response: 'needsAction', self: false, organizer: false },
    { email: 'gamma@example.test', name: 'Gamma', response: 'accepted', self: false, organizer: false },
  ] })
  assert.deepEqual(invitadosDe(grupal), ['Alfa', 'beta@example.test', 'Gamma'])
  const g = guardaInvitados(grupal, at(12, 30))!
  assert.ok(g)
  assert.match(g.texto, /^«Grupal» tiene invitados \(Alfa, beta@example\.test y 1 más\)\./)
  assert.match(g.texto, /12:30/)
  assert.match(g.texto, /verán la nueva hora en su calendario/)
  const tarea = { kind: 'task', title: 'Tarea' } as PlanTask
  assert.equal(guardaInvitados(tarea, at(10)), null, 'una tarea no tiene invitados')
})

test('la lista de nombres se lee en español', () => {
  assert.equal(listaNombres(['Alfa']), 'Alfa')
  assert.equal(listaNombres(['Alfa', 'Beta']), 'Alfa y Beta')
  assert.equal(listaNombres(['Alfa', 'Beta', 'Gamma', 'Delta']), 'Alfa, Beta y 2 más')
})

test('el calendario pasa la guarda antes de escribir y el Día arrastra por la misma pluma que la Semana', () => {
  const cal = readFileSync(new URL('../../src/features/planning/PlanningCalendar.tsx', import.meta.url), 'utf8')
  const mover = cal.slice(cal.indexOf('const moverEnRejilla'), cal.indexOf('const tramoSemana'))
  assert.ok(mover.indexOf('guardaInvitados(') > 0 && mover.indexOf('guardaInvitados(') < mover.indexOf('auto.editar('), 'la guarda va antes de escribir')
  assert.match(cal, /<DiaVivo[\s\S]*?onMover=\{snapshot && !pending \? \(ev, inicio, fin\) => void moverEnRejilla\(ev, inicio, fin\)/)
  assert.match(cal, /onMover=\{\(\) => \{ const p = porConfirmar; setPorConfirmar\(null\); void moverEnRejilla\(p\.item, p\.inicio, p\.fin, true\) \}\}/)
  const agenda = readFileSync(new URL('../../src/features/planning/AgendaMini.tsx', import.meta.url), 'utf8')
  assert.match(agenda, /soltarEnDia\(g\.bloque\.evento, diaClave, g\.minuto, tramoRef\.current\)/)
  assert.match(agenda, /h\.fantasma/, 'el fantasma es el de la Semana')
})
