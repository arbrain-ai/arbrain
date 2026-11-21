/**
 * Contenido como YouTube (17 nov 2026): guardar y quitar, la cola de «ver después» y su orden, los huecos contra un
 * calendario de ejemplo y el bloque del calendario (crear, mover, deshacer) con un DOBLE de la pluma: nada toca Google.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { aplicar, colaOrdenada, enCola, estaGuardado, filtrarGuardados, normalizar, validarCambio, VACIO, type FichaVideo, type Mios } from '../../src/features/contenido/mios'
import { cambiarMiosEn, leerMiosEn } from '../../src/features/contenido/mios-archivo'
import { choca, huecosLibres, minutosDeBloque, type Ocupado } from '../../src/features/contenido/huecos'
import { agendar, calendarioDestino, crearBloque, deshacerBloque, enlaceVideo, moverBloque, ocupadoDe, refDe } from '../../src/features/contenido/bloque'
import type { MutationResult, PlanEvent, PlanMutation, PlanningSnapshot } from '../../src/features/planning/types'

const V = (id: string, o: Partial<FichaVideo> = {}): FichaVideo => ({ video_id: id.padEnd(11, 'x'), titulo: `Video ${id}`, canal: 'Canal', duracion_s: 1100, temas: ['claude-code'], ...o })
const AHORA = new Date(2026, 10, 17, 9, 5) // mar 17 nov, 09:05 hora local

test('guardar y quitar: un toque guarda, otro quita; guardar dos veces no duplica', () => {
  let m: Mios = VACIO
  m = aplicar(m, { accion: 'guardar', video: V('a') }, AHORA)
  m = aplicar(m, { accion: 'guardar', video: V('b') }, AHORA)
  m = aplicar(m, { accion: 'guardar', video: V('a') }, AHORA)
  assert.deepEqual(m.guardados.map(g => g.video_id), [V('a').video_id, V('b').video_id])
  assert.ok(estaGuardado(m, V('b').video_id))
  m = aplicar(m, { accion: 'quitar', video_id: V('b').video_id }, AHORA)
  assert.equal(estaGuardado(m, V('b').video_id), false)
  assert.equal(m.guardados.length, 1)
})

test('los guardados se buscan por título o canal y se filtran con los mismos temas', () => {
  const m = [V('a', { titulo: 'Claude Code a fondo', temas: ['claude-code'] }), V('b', { titulo: 'Vender sin miedo', canal: 'Hormozi', temas: ['ventas'] })]
    .reduce((acc, v) => aplicar(acc, { accion: 'guardar', video: v }, AHORA), VACIO)
  assert.deepEqual(filtrarGuardados(m.guardados, { q: 'hormozi' }).map(g => g.titulo), ['Vender sin miedo'])
  assert.deepEqual(filtrarGuardados(m.guardados, { tema: 'claude-code' }).map(g => g.titulo), ['Claude Code a fondo'])
})

test('guardar sobrevive a un reinicio: se escribe al archivo del Studio y se vuelve a leer igual', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mios-'))
  const ruta = path.join(dir, 'pantallas', 'mios.json')
  try {
    await cambiarMiosEn(ruta, { accion: 'guardar', video: V('a') }, AHORA)
    await Promise.all([cambiarMiosEn(ruta, { accion: 'guardar', video: V('b') }, AHORA), cambiarMiosEn(ruta, { accion: 'despues', video: V('c'), cuando: null, evento: null }, AHORA)])
    // «Reinicio»: nada en memoria, solo el archivo.
    const leido = await leerMiosEn(ruta)
    assert.deepEqual(leido.guardados.map(g => g.video_id).sort(), [V('a').video_id, V('b').video_id].sort())
    assert.equal(leido.despues[0].video_id, V('c').video_id)
    await cambiarMiosEn(ruta, { accion: 'quitar', video_id: V('a').video_id }, AHORA)
    assert.equal((await leerMiosEn(ruta)).guardados.length, 1)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('un archivo roto o ajeno no tumba la pantalla: se lee vacío o se limpia', async () => {
  assert.deepEqual(normalizar(null), VACIO)
  const m = normalizar({ guardados: [{ video_id: 'malo' }, { video_id: 'abcdefghijk', titulo: 'ok', miniatura_url: 'javascript:alert(1)' }], despues: [{ video_id: 'abcdefghijk', cuando: 'no-es-fecha' }] })
  assert.equal(m.guardados.length, 1)
  assert.equal(m.guardados[0].miniatura_url, null)
  assert.equal(m.despues[0].cuando, null)
  assert.equal(validarCambio({ accion: 'borrar-todo' }), null)
  assert.equal(validarCambio({ accion: 'quitar', video_id: '../../etc' }), null)
})

test('la cola: por cuándo toca, lo sin hora al final; verlo o votarlo lo saca', () => {
  let m: Mios = VACIO
  const t = (d: number, h: number) => new Date(2026, 10, 17 + d, h).toISOString()
  m = aplicar(m, { accion: 'despues', video: V('jueves'), cuando: t(2, 16), evento: null }, AHORA)
  m = aplicar(m, { accion: 'despues', video: V('sinhora1'), cuando: null, evento: null }, new Date(2026, 10, 17, 8))
  m = aplicar(m, { accion: 'despues', video: V('hoy'), cuando: t(0, 18), evento: null }, AHORA)
  m = aplicar(m, { accion: 'despues', video: V('sinhora2'), cuando: null, evento: null }, new Date(2026, 10, 17, 9))
  assert.deepEqual(colaOrdenada(m.despues).map(d => d.titulo), ['Video hoy', 'Video jueves', 'Video sinhora2', 'Video sinhora1'])
  m = aplicar(m, { accion: 'salir', video_id: V('hoy').video_id }, AHORA)
  assert.equal(enCola(m, V('hoy').video_id), null)
  assert.equal(m.despues.length, 3)
})

test('cambiarle la hora conserva su bloque (el mismo evento), no crea otro', () => {
  const ref = { externalId: 'ev1', account: 'yo@x', calendarId: 'primary', etag: '"1"' }
  let m = aplicar(VACIO, { accion: 'despues', video: V('a'), cuando: new Date(2026, 10, 17, 18).toISOString(), evento: ref }, AHORA)
  m = aplicar(m, { accion: 'despues', video: V('a'), cuando: new Date(2026, 10, 18, 14).toISOString(), evento: null }, AHORA)
  assert.equal(m.despues.length, 1)
  assert.equal(m.despues[0].evento?.externalId, 'ev1')
})

// ── Huecos contra un calendario de ejemplo ───────────────────────────────────────────────────────────────────────────
const at = (d: number, h: number, m = 0) => new Date(2026, 10, 17 + d, h, m).toISOString()
const DIA_DE_EJEMPLO: Ocupado[] = [
  { start: at(0, 0), end: at(1, 0), allDay: true }, // fase de todo el día: no ocupa
  { start: at(0, 6), end: at(0, 9), title: 'Trabajo fuerte' } as Ocupado,
  { start: at(0, 9, 30), end: at(0, 12) }, // gym
  { start: at(0, 12), end: at(0, 13, 30) }, // llamada
  { start: at(0, 14), end: at(0, 19) }, // tarde ocupada
  { start: at(0, 20, 30), end: at(0, 21) }, // rutina de noche
  { start: at(1, 6), end: at(1, 9) }, { start: at(1, 9, 30), end: at(1, 12) }, { start: at(1, 12), end: at(1, 13) },
  { start: at(1, 15), end: at(1, 16), de: 'Fulana' }, // de otra persona: no ocupa su hora
]

test('los huecos nunca caen encima de una llamada, del gym ni del trabajo fuerte', () => {
  const minutos = minutosDeBloque(1100) // 18 min 20 s → 30 min
  assert.equal(minutos, 30)
  const hs = huecosLibres({ ocupado: DIA_DE_EJEMPLO, ahora: AHORA, minutos })
  assert.equal(hs.length, 3)
  for (const h of hs) assert.equal(choca(DIA_DE_EJEMPLO, h.inicio, minutos), false, `choca: ${h.inicio}`)
  // Hoy a las 9:05 el primer lugar libre con aire es 19:15 (19:00 + 10 min, subido al cuarto); antes, todo ocupado.
  assert.equal(hs[0].inicio.getHours() * 60 + hs[0].inicio.getMinutes(), 19 * 60 + 15)
  assert.equal(hs[0].inicio.getDate(), 17)
  // Y mañana, después de la llamada.
  assert.ok(hs.slice(1).every(h => h.inicio.getDate() >= 18))
  assert.ok(hs.some(h => h.inicio.getDate() === 18 && h.inicio.getHours() === 13 && h.inicio.getMinutes() === 15))
})

test('si hoy no hay hueco, propone mañana; un curso de 8 h se agenda en un bloque de 2 h', () => {
  const lleno: Ocupado[] = [{ start: at(0, 0), end: at(0, 23, 59) }]
  const hs = huecosLibres({ ocupado: lleno, ahora: AHORA, minutos: 45 })
  assert.ok(hs.length > 0 && hs.every(h => h.inicio.getDate() > 17))
  assert.equal(hs[0].inicio.getHours(), 8)
  assert.equal(minutosDeBloque(8 * 3600 + 120), 120)
  assert.equal(minutosDeBloque(null), 15)
})

// ── El bloque del calendario, con un doble de la pluma ───────────────────────────────────────────────────────────────
function doble() {
  const ops: PlanMutation[] = []
  const eventos = new Map<string, PlanEvent>()
  let n = 0
  const mutar = async (op: PlanMutation): Promise<MutationResult> => {
    ops.push(op)
    if (op.action === 'create') {
      const d = op.data as Record<string, string>
      const ev: PlanEvent = { id: `ev${++n}`, externalId: `ev${n}`, kind: 'event', sourceId: 's', account: op.account!, calendarId: op.calendarId!, title: d.title, description: d.description, location: d.location,
        start: d.start, end: d.end, allDay: false, timeZone: d.timeZone, etag: '"1"', recurringEventId: null, recurrence: [], editable: true }
      eventos.set(ev.externalId, ev); return { ok: true, event: ev }
    }
    const ev = eventos.get(op.externalId!)!
    if (op.action === 'update') { assert.equal(op.etag, ev.etag, 'mueve con el etag vigente'); const d = op.data as Record<string, string>; const nuevo = { ...ev, start: d.start, end: d.end, etag: `"${Number(ev.etag!.slice(1, -1)) + 1}"` }; eventos.set(ev.externalId, nuevo); return { ok: true, event: nuevo } }
    if (op.action === 'delete') { eventos.delete(op.externalId!); return { ok: true, deletedId: op.externalId } }
    throw new Error(`acción inesperada ${op.action}`)
  }
  const snapshot = (): PlanningSnapshot => ({ ownerId: 'yo', sources: [{ id: 's', calendarId: 'primary', account: 'yo@x', title: 'Yo', color: null, timeZone: 'America/Mexico_City', editable: true, selected: true, objective: false },
    { id: 'o', calendarId: 'obj', account: 'yo@x', title: 'Objetivos', color: null, timeZone: 'America/Mexico_City', editable: true, selected: true, objective: true }],
    events: [...eventos.values()], tasks: [], projects: [], health: [], loadedAt: AHORA.toISOString(), range: { from: at(0, 0), to: at(4, 0) } })
  return { ops, eventos, mutar, snapshot }
}

test('crear: UN evento por la pluma, con el título, lo que dura redondeado y el enlace que regresa al video', async () => {
  const d = doble()
  const video = V('crear', { titulo: 'Rethinking Claude Code' })
  const ev = await crearBloque({ mutar: d.mutar, snapshot: d.snapshot(), video, inicio: new Date(at(0, 19, 15)), minutos: 30, origen: 'http://studio.local:3218/', zona: 'America/Mexico_City' })
  assert.equal(d.ops.length, 1)
  assert.equal(d.ops[0].action, 'create')
  assert.equal(d.ops[0].calendarId, 'primary', 'nunca el calendario de objetivos')
  assert.equal(ev.title, '▶ Rethinking Claude Code')
  assert.equal((Date.parse(ev.end) - Date.parse(ev.start)) / 60_000, 30)
  const enlace = enlaceVideo('http://studio.local:3218', video.video_id)
  assert.equal(enlace, `http://studio.local:3218/youtube?ver=${video.video_id}`)
  assert.ok(ev.description.includes(enlace))
  assert.equal(ev.location, '', 'el enlace no va en «lugar»: en el teléfono se ve como una dirección que no abre')
})

test('mover: cambiarle la hora mueve ESE mismo bloque (update con su etag), no crea otro', async () => {
  const d = doble()
  const video = V('mover')
  const ev = await crearBloque({ mutar: d.mutar, snapshot: d.snapshot(), video, inicio: new Date(at(0, 19, 15)), minutos: 30, origen: 'http://x', zona: 'UTC' })
  const movido = await moverBloque({ mutar: d.mutar, snapshot: d.snapshot(), ref: refDe(ev), video, antes: ev.start, inicio: new Date(at(2, 16, 30)), minutos: 30 })
  assert.deepEqual(d.ops.map(o => o.action), ['create', 'update'])
  assert.equal(d.ops[1].externalId, ev.externalId)
  assert.equal(d.eventos.size, 1)
  assert.equal(movido.start, new Date(at(2, 16, 30)).toISOString())
  // Mover otra vez con la referencia nueva (su etag cambió): sigue siendo el mismo.
  await moverBloque({ mutar: d.mutar, snapshot: d.snapshot(), ref: refDe(movido), video, antes: movido.start, inicio: new Date(at(3, 10)), minutos: 30 })
  assert.equal(d.eventos.size, 1)
})

test('deshacer lo recién creado lo quita del calendario (su propio toque); agendar sin hora no escribe nada', async () => {
  const d = doble()
  const video = V('deshacer')
  const r = await agendar({ mutar: d.mutar, snapshot: d.snapshot(), video, previo: null, inicio: new Date(at(1, 13, 15)), minutos: 30, origen: 'http://x', zona: 'UTC' })
  assert.ok(r.creado && r.evento)
  await deshacerBloque({ mutar: d.mutar, snapshot: d.snapshot(), evento: r.creado! })
  assert.equal(d.eventos.size, 0)
  const sinHora = await agendar({ mutar: d.mutar, snapshot: d.snapshot(), video, previo: null, inicio: null, minutos: 30, origen: 'http://x', zona: 'UTC' })
  assert.deepEqual(sinHora, { cuando: null, evento: null, creado: null, movido: false, sinCalendario: false })
  assert.deepEqual(d.ops.map(o => o.action), ['create', 'delete'])
})

test('agendar con bloque previo lo mueve; la cola guarda la referencia nueva', async () => {
  const d = doble()
  const video = V('previo')
  const a = await agendar({ mutar: d.mutar, snapshot: d.snapshot(), video, previo: null, inicio: new Date(at(0, 19, 15)), minutos: 30, origen: 'http://x', zona: 'UTC' })
  const b = await agendar({ mutar: d.mutar, snapshot: d.snapshot(), video, previo: { cuando: a.cuando, evento: a.evento }, inicio: new Date(at(1, 14)), minutos: 30, origen: 'http://x', zona: 'UTC' })
  assert.equal(b.movido, true)
  assert.equal(b.evento?.externalId, a.evento?.externalId)
  assert.notEqual(b.evento?.etag, a.evento?.etag)
  assert.deepEqual(d.ops.map(o => o.action), ['create', 'update'])
})

test('la copia del alumno sin calendario: «ver después» sigue sirviendo, sin bloque y sin escribir', async () => {
  const ops: PlanMutation[] = []
  const mutar = async (op: PlanMutation): Promise<MutationResult> => { ops.push(op); throw new Error('no debía escribir') }
  assert.equal(calendarioDestino(null), null)
  const r = await agendar({ mutar, snapshot: null, video: V('alumno'), previo: null, inicio: new Date(at(1, 10)), minutos: 30, origen: 'http://127.0.0.1:4000', zona: 'UTC' })
  assert.equal(r.sinCalendario, true)
  assert.equal(r.evento, null)
  assert.equal(ops.length, 0)
  // Con una lectura sin calendarios propios editables (solo de otra persona o de objetivos), igual.
  const soloAjenos = { ownerId: 'a', sources: [{ id: 'o', calendarId: 'obj', account: 'a', title: 'Objetivos', color: null, timeZone: 'UTC', editable: true, selected: true, objective: true }], events: [], tasks: [], projects: [], health: [], loadedAt: '', range: { from: '', to: '' } } as PlanningSnapshot
  assert.equal((await agendar({ mutar, snapshot: soloAjenos, video: V('alumno'), previo: null, inicio: new Date(at(1, 10)), minutos: 30, origen: 'x', zona: 'UTC' })).sinCalendario, true)
  assert.equal(ops.length, 0)
  // Y su cola funciona igual.
  const m = aplicar(VACIO, { accion: 'despues', video: V('alumno'), cuando: r.cuando, evento: r.evento }, AHORA)
  assert.equal(colaOrdenada(m.despues)[0].cuando, r.cuando)
})

test('lo ocupado sale de la lectura: eventos con hora, tareas con hora; no lo rechazado ni lo de otra persona', () => {
  const s = { events: [
    { start: at(0, 12), end: at(0, 13), allDay: false, attendees: [{ email: 'yo', name: '', response: 'declined', self: true, organizer: false }] },
    { start: at(0, 15), end: at(0, 16), allDay: false, de: 'Fulana' },
    { start: at(0, 17), end: at(0, 18), allDay: false },
  ] as PlanEvent[], tasks: [{ due: at(0, 10), durationMinutes: 45, completed: false }, { due: '2026-11-17', completed: false }] as PlanningSnapshot['tasks'] }
  const o = ocupadoDe(s)
  assert.equal(o.filter(x => !x.allDay && !x.de && !x.rechazado).length, 2)
  assert.equal(choca(o, new Date(at(0, 12)), 30), false, 'una llamada rechazada no ocupa')
  assert.equal(choca(o, new Date(at(0, 10, 30)), 15), true, 'la tarea con hora sí ocupa')
})
