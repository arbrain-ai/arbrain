import test from 'node:test'
import assert from 'node:assert/strict'
import { Guardian, capaDe } from '../../src/features/planning/autoguardado'
import { borradorDe, datosDeCambio } from '../../src/features/planning/detalle'
import type { MutationResult, PlanEvent, PlanMutation, PlanTask, PlanningSnapshot } from '../../src/features/planning/types'

process.env.TZ = 'America/Mexico_City'
const sources = [{ id: 's', calendarId: 'c', account: 'a', title: 'Trabajo Duro', color: null, timeZone: 'America/Mexico_City', editable: true, selected: true, objective: false }]
const evento: PlanEvent = { id: 'google:a:c:e1', externalId: 'e1', kind: 'event', sourceId: 's', account: 'a', calendarId: 'c', title: 'Trabajo Duro', description: '', location: '',
  start: '2026-10-05T16:30:00.000Z', end: '2026-10-05T18:00:00.000Z', allDay: false, timeZone: 'America/Mexico_City', etag: '"v1"', recurringEventId: null, recurrence: [], editable: true }
const tarea: PlanTask = { id: 'todoist:t1', externalId: 't1', kind: 'task', title: 'Guion', description: '', projectId: 'p1', sectionId: null, parentId: null, priority: 4,
  due: '2026-10-05', timeZone: null, recurring: false, recurrenceText: null, durationMinutes: null, completed: false, updatedAt: 'u1' }
const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Una fuente en memoria que se comporta como la pluma: exige el etag vigente y devuelve el elemento nuevo. */
function fuente(opciones: { fallar?: (m: PlanMutation) => string | null } = {}) {
  const eventos = new Map([[evento.id, { ...evento }]]), tareas = new Map([[tarea.id, { ...tarea }]])
  const escritas: PlanMutation[] = []
  let n = 1
  const escribir = async (m: PlanMutation): Promise<MutationResult> => {
    escritas.push(m)
    await espera(5)
    const motivo = opciones.fallar?.(m)
    if (motivo) throw new Error(motivo)
    if (m.kind === 'event') {
      const e = [...eventos.values()].find(x => x.externalId === m.externalId)!
      if (m.etag !== e.etag) throw new Error('El evento cambió en otra parte.')
      const nuevo = { ...e, ...(m.data as Partial<PlanEvent>), etag: `"v${++n}"` }
      eventos.set(e.id, nuevo); return { ok: true, event: nuevo }
    }
    const t = [...tareas.values()].find(x => x.externalId === m.externalId)!
    const nueva = m.action === 'move' ? { ...t, projectId: String(m.data?.projectId), updatedAt: `u${++n}` } : { ...t, ...(m.data as Partial<PlanTask>), updatedAt: `u${++n}` }
    tareas.set(t.id, nueva); return { ok: true, task: nueva }
  }
  const leer = (): PlanningSnapshot => ({ ownerId: 'o', sources, events: [...eventos.values()], tasks: [...tareas.values()], projects: [], sections: [], health: [], loadedAt: '', range: { from: '', to: '' } } as unknown as PlanningSnapshot)
  return { escribir, leer, escritas, eventos, tareas }
}
function guardian(f: ReturnType<typeof fuente>, fallos: string[] = []) {
  return new Guardian({ ownerId: () => 'o', escribir: f.escribir, onFallo: (t, m) => fallos.push(`${t}: ${m}`), onCambio: () => {}, demora: 30 })
}
const tituloEnVista = (g: Guardian, f: ReturnType<typeof fuente>) => g.aplicar(f.leer()).events.find(e => e.id === evento.id)!.title

test('editar → se ve al instante → una sola escritura tras la pausa → la fuente y la vista coinciden', async () => {
  const f = fuente(), g = guardian(f)
  const base = borradorDe({ item: evento }, { sources })
  for (const titulo of ['Café', 'Café con el equipo', 'Café · Publicar la Masterclass 12 pm']) {
    g.editar({ item: evento, data: datosDeCambio({ ...base, title: titulo }, base, 'America/Mexico_City') })
    assert.equal(tituloEnVista(g, f), titulo, 'la agenda pinta lo escrito al instante')
  }
  assert.equal(g.estado(evento.id).fase, 'pendiente')
  assert.equal(f.escritas.length, 0, 'todavía no escribe: espera la pausa')
  await espera(80)
  assert.equal(f.escritas.length, 1, 'una sola escritura con lo último')
  assert.equal(f.escritas[0].externalId, 'e1'); assert.equal(f.escritas[0].calendarId, 'c'); assert.equal(f.escritas[0].account, 'a'); assert.equal(f.escritas[0].etag, '"v1"')
  assert.equal(f.eventos.get(evento.id)!.title, 'Café · Publicar la Masterclass 12 pm', 'Google lo recibió')
  assert.equal(g.estado(evento.id).fase, 'guardado')
  assert.equal(tituloEnVista(g, f), 'Café · Publicar la Masterclass 12 pm', 'la vista lee lo mismo sin capa')
})

test('cerrar la hoja escribe ya, sin esperar la pausa (y la segunda escritura usa el etag nuevo)', async () => {
  const f = fuente(), g = guardian(f)
  const base = borradorDe({ item: evento }, { sources })
  g.editar({ item: evento, data: datosDeCambio({ ...base, title: 'Uno' }, base, 'America/Mexico_City') })
  assert.equal(await g.vaciar(evento.id), true)
  assert.equal(f.eventos.get(evento.id)!.title, 'Uno')
  g.editar({ item: evento, data: datosDeCambio({ ...base, title: 'Dos' }, base, 'America/Mexico_City') })
  assert.equal(await g.vaciar(), true)
  assert.equal(f.escritas[1].etag, '"v2"', 'no reusa el etag viejo (que el proveedor rechazaría)')
  assert.equal(f.eventos.get(evento.id)!.title, 'Dos')
})

test('si Google no confirma: la vista vuelve a lo que Google tiene, se avisa y se puede reintentar', async () => {
  let caido = true
  const f = fuente({ fallar: () => caido ? 'La pluma de planificación no respondió.' : null }), fallos: string[] = []
  const g = guardian(f, fallos)
  const base = borradorDe({ item: evento }, { sources })
  g.editar({ item: evento, data: datosDeCambio({ ...base, title: 'Nuevo' }, base, 'America/Mexico_City') })
  assert.equal(tituloEnVista(g, f), 'Nuevo')
  assert.equal(await g.vaciar(evento.id), false)
  assert.equal(g.estado(evento.id).fase, 'error')
  assert.match(g.estado(evento.id).error!, /no respondió/)
  assert.equal(tituloEnVista(g, f), 'Trabajo Duro', 'revertido: nunca muestra algo que Google no tiene')
  assert.deepEqual(fallos, ['Nuevo: La pluma de planificación no respondió.'], 'aviso visible, nunca en silencio')
  caido = false
  g.reintentar(evento.id)
  assert.equal(tituloEnVista(g, f), 'Nuevo')
  assert.equal(await g.vaciar(), true)
  assert.equal(f.eventos.get(evento.id)!.title, 'Nuevo')
  assert.equal(f.escritas.at(-1)!.requestId, f.escritas[0].requestId, 'reintentar reenvía la misma operación (idempotente en la pluma)')
})

test('tareas de Todoist: lo tocado viaja aunque vuelva al valor original, y mover de proyecto es su propia escritura', async () => {
  const f = fuente(), g = guardian(f)
  const base = borradorDe({ item: tarea }, { sources })
  const tocadas = new Set(['priority'])
  // P1 y de vuelta a P4: el valor original se escribe de vuelta (deshacer dentro de la hoja).
  assert.deepEqual(datosDeCambio({ ...base, priority: 4 }, base, 'America/Mexico_City', tocadas), { title: 'Guion', priority: 4 })
  g.editar({ item: tarea, data: datosDeCambio({ ...base, title: 'Guion v2', priority: 1 }, base, 'America/Mexico_City'), mover: 'p2' })
  const vista = g.aplicar(f.leer()).tasks[0]
  assert.equal(vista.title, 'Guion v2'); assert.equal(vista.priority, 1); assert.equal(vista.projectId, 'p2')
  assert.equal(await g.vaciar(), true)
  assert.deepEqual(f.escritas.map(m => m.action), ['update', 'move'])
  assert.notEqual(f.escritas[1].updatedAt, 'u1', 'el move usa el updatedAt que dejó el update')
  const final = f.tareas.get(tarea.id)!
  assert.equal(final.title, 'Guion v2'); assert.equal(final.priority, 1); assert.equal(final.projectId, 'p2')
})

test('la capa no pinta zona horaria ni recurrencia como campos del elemento', () => {
  assert.deepEqual(capaDe({ title: 'x', timeZone: 'America/Mexico_City', recurrence: ['RRULE:FREQ=DAILY'] }), { title: 'x' })
  assert.equal(capaDe(null), null)
})
