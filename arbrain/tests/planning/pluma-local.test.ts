import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PlumaLocal, diasDeSerie, instanteDePared, contextoHeredado, RUTA_CALENDARIO, RUTA_OBJETIVOS } from '../../src/lib/planning/local'
import { apiPermitidaEnCliente, seccionPanelPermitida, vistaPermitidaEnCliente, paginaPermitidaEnCliente } from '../../src/lib/edicion'

const nueva = () => new PlumaLocal(mkdtempSync(join(tmpdir(), 'pluma-local-')))
const SEMANA = { action: 'snapshot', from: '2026-10-19T06:00:00.000Z', to: '2026-10-26T06:00:00.000Z' }

test('la edición cliente abre el calendario y sus rutas, pero no el scheduler de crons', () => {
  assert.equal(seccionPanelPermitida('calendario', true), true)
  assert.equal(seccionPanelPermitida('finanzas', true), false)
  assert.equal(vistaPermitidaEnCliente('calendario', true), true)
  assert.equal(apiPermitidaEnCliente('/api/planning'), true)
  assert.equal(apiPermitidaEnCliente('/api/planning/objectives'), true)
  assert.equal(apiPermitidaEnCliente('/api/planning/crons'), false)
  assert.equal(apiPermitidaEnCliente('/api/planning/crons/result'), false)
  assert.equal(apiPermitidaEnCliente('/api/sistema/inteligencia'), false)
  assert.equal(paginaPermitidaEnCliente('/calendar'), true)
})

test('sin archivo: calendario vacío, fresco y editable (nunca datos ajenos)', () => {
  const s = nueva().snapshot(SEMANA)
  assert.equal(s.events.length, 0)
  assert.equal(s.tasks.length, 0)
  assert.equal(s.sources[0].editable, true)
  assert.ok(s.health.every(h => h.state === 'fresh'))
  assert.ok(s.health.some(h => h.id === 'todoist'), 'la vista usa la llave «todoist» para las tareas')
})

test('crear, editar y borrar un evento; el reintento con el mismo requestId no duplica', async () => {
  const p = nueva()
  const op = { requestId: randomUUID(), kind: 'event', action: 'create', account: 'local', calendarId: 'local',
    data: { title: 'Bloque profundo', start: '2026-10-22T15:00:00.000Z', end: '2026-10-22T17:00:00.000Z', allDay: false, timeZone: 'America/Mexico_City' } }
  const r1 = await p.handle(op) as { event: { externalId: string; etag: string } }
  const r2 = await p.handle(op) as { event: { externalId: string } }
  assert.equal(r1.event.externalId, r2.event.externalId)
  assert.equal(p.snapshot(SEMANA).events.length, 1)
  await assert.rejects(p.handle({ ...op, data: { ...op.data, title: 'otro' } }), /reintento/)
  const up = await p.handle({ requestId: randomUUID(), kind: 'event', action: 'update', account: 'local', calendarId: 'local', externalId: r1.event.externalId, etag: r1.event.etag,
    data: { ...op.data, title: 'Bloque profundo · guion' } }) as { event: { title: string } }
  assert.equal(up.event.title, 'Bloque profundo · guion')
  await assert.rejects(p.handle({ requestId: randomUUID(), kind: 'event', action: 'update', account: 'local', calendarId: 'local', externalId: r1.event.externalId, etag: r1.event.etag, data: op.data }), /cambió/)
  await p.handle({ requestId: randomUUID(), kind: 'event', action: 'delete', account: 'local', calendarId: 'local', externalId: r1.event.externalId })
  assert.equal(p.snapshot(SEMANA).events.length, 0)
})

test('lo que Levy escribe a mano en calendario.json se pinta, con repeticiones y días omitidos', () => {
  const p = nueva()
  mkdirSync(join(p.raiz, '.claude/plan'), { recursive: true })
  writeFileSync(join(p.raiz, RUTA_CALENDARIO), JSON.stringify({ version: 1, zona: 'America/Mexico_City',
    eventos: [
      { id: 'gym', titulo: 'Gym', inicio: '2026-10-19T09:30:00-06:00', fin: '2026-10-19T10:30:00-06:00', repetir: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', omitir: ['2026-10-21'] },
      { id: 'lanz', titulo: 'Semana de lanzamiento', inicio: '2026-10-23', fin: '2026-10-25', todoElDia: true },
    ],
    tareas: [{ id: 't1', titulo: 'Enviar propuesta', fecha: '2026-10-22', prioridad: 1 }, { id: 't2', titulo: 'Hecha', hecha: true, hechaEn: '2026-10-20T18:00:00Z' }] }))
  const s = p.snapshot({ ...SEMANA, includeCompleted: true })
  const gym = s.events.filter(e => e.title === 'Gym')
  assert.deepEqual(gym.map(e => e.start), ['2026-10-19T15:30:00.000Z', '2026-10-23T15:30:00.000Z'])
  assert.ok(gym.every(e => e.recurringEventId === 'gym'))
  assert.equal(s.events.find(e => e.allDay)?.end, '2026-10-25')
  assert.deepEqual(s.tasks.map(t => t.title), ['Enviar propuesta'])
  assert.deepEqual(s.completedTasks.map(t => t.title), ['Hecha'])
})

test('editar una ocurrencia la aparta de la serie; borrarla la omite', async () => {
  const p = nueva()
  const c = await p.handle({ requestId: randomUUID(), kind: 'event', action: 'create', account: 'local', calendarId: 'local',
    data: { title: 'Rutina', start: '2026-10-19T14:00:00.000Z', end: '2026-10-19T14:30:00.000Z', allDay: false, timeZone: 'America/Mexico_City', recurrence: ['RRULE:FREQ=DAILY'] } }) as { event: { recurringEventId: string } }
  assert.ok(c.event.recurringEventId)
  let s = p.snapshot(SEMANA)
  assert.equal(s.events.length, 7)
  const mar = s.events.find(e => e.start.startsWith('2026-10-20'))!
  await p.handle({ requestId: randomUUID(), kind: 'event', action: 'update', account: 'local', calendarId: 'local', externalId: mar.externalId, etag: mar.etag, scope: 'occurrence',
    data: { title: 'Rutina corta', start: mar.start, end: '2026-10-20T14:15:00.000Z', allDay: false } })
  const mie = p.snapshot(SEMANA).events.find(e => e.start.startsWith('2026-10-21'))!
  await p.handle({ requestId: randomUUID(), kind: 'event', action: 'delete', account: 'local', calendarId: 'local', externalId: mie.externalId, scope: 'occurrence' })
  s = p.snapshot(SEMANA)
  assert.equal(s.events.length, 6)
  assert.equal(s.events.filter(e => e.title === 'Rutina corta').length, 1)
})

test('tareas: crear, editar parcial, completar y reabrir', async () => {
  const p = nueva()
  const r = await p.handle({ requestId: randomUUID(), kind: 'task', action: 'create', data: { title: 'Llamar al cliente', due: '2026-10-22', priority: 2 } }) as { task: { externalId: string; updatedAt: string } }
  await p.handle({ requestId: randomUUID(), kind: 'task', action: 'update', externalId: r.task.externalId, updatedAt: r.task.updatedAt, data: { title: 'Llamar al cliente', durationMinutes: 30 } })
  assert.equal(p.snapshot(SEMANA).tasks[0].durationMinutes, 30)
  assert.equal(p.snapshot(SEMANA).tasks[0].priority, 2)
  await p.handle({ requestId: randomUUID(), kind: 'task', action: 'complete', externalId: r.task.externalId })
  assert.equal(p.snapshot(SEMANA).tasks.length, 0)
  await p.handle({ requestId: randomUUID(), kind: 'task', action: 'reopen', externalId: r.task.externalId })
  assert.equal(p.snapshot(SEMANA).tasks.length, 1)
})

test('objetivos: mismo registro que objectives_store.py, revisión y contexto heredado', async () => {
  const p = nueva()
  mkdirSync(join(p.raiz, '.claude/plan'), { recursive: true })
  writeFileSync(join(p.raiz, RUTA_OBJETIVOS), '# Objetivos\n\n## Octubre 2026\n**Mes:** primera cohorte entregando\n\n### Semana 19-25\n**Foco:** cerrar 5 diagnósticos\n\n#### Mié 21\n- [ ] Kickoff\n')
  const v = p.leerObjetivos()
  assert.deepEqual(v.context.map(c => c.scope), ['month', 'week', 'day'])
  assert.equal(v.context[1].start, '2026-10-19')
  const goal = { id: randomUUID(), scope: 'month', start: '2026-10-01', end: '2026-11-01', title: 'Primera cohorte', success: '5 fundadores con su cerebro instalado', notes: '', status: 'agreed', parentId: null, taskIds: ['local:t1'], eventIds: [], completionNote: '' }
  const w = await p.handle({ action: 'objectives-write', requestId: randomUUID(), revision: v.revision, goal }) as { goals: unknown[]; revision: string }
  assert.equal(w.goals.length, 1)
  await assert.rejects(p.handle({ action: 'objectives-write', requestId: randomUUID(), revision: v.revision, goal }), /cambió/)
  const disco = readFileSync(join(p.raiz, RUTA_OBJETIVOS), 'utf8')
  assert.ok(disco.startsWith('# Objetivos'), 'conserva lo escrito a mano')
  assert.match(disco, /<!-- arbrain-objectives-v1\n/)
  assert.equal(contextoHeredado(disco).length, 3)
})

test('repeticiones y horario de verano', () => {
  assert.deepEqual(diasDeSerie('FREQ=WEEKLY;BYDAY=TU,TH;COUNT=3', '2026-10-20', '2026-10-01', '2026-12-01'), ['2026-10-20', '2026-10-22', '2026-10-27'])
  assert.deepEqual(diasDeSerie('FREQ=DAILY;INTERVAL=2;UNTIL=20261025', '2026-10-20', '2026-10-01', '2026-12-01'), ['2026-10-20', '2026-10-22', '2026-10-24'])
  assert.deepEqual(diasDeSerie('FREQ=MONTHLY', '2026-10-15', '2026-11-01', '2027-01-01'), ['2026-11-15', '2026-12-15'])
  // Nueva York cambia de horario el 1 nov 2026: las 9:00 siguen siendo las 9:00.
  assert.equal(instanteDePared('2026-10-30', '09:00:00', 'America/New_York').toISOString(), '2026-10-30T13:00:00.000Z')
  assert.equal(instanteDePared('2026-11-02', '09:00:00', 'America/New_York').toISOString(), '2026-11-02T14:00:00.000Z')
})
