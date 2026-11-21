import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bloquesDeTareas, DURACION_TAREA_MIN, enElTimeline, listaDelDia } from '../../src/features/planning/lista-dia'
import type { Bloque } from '../../src/features/planning/dia-vivo'
import type { PlanEvent, PlanTask } from '../../src/features/planning/types'

// 16 nov 2026, 15:37 (Daniel con el Día fijado a la derecha del chat): «la vista de calendario la hacemos vertical estática sin scroll
// bar vertical para que todo se vea completo… este toggle en lugar de mandar para abajo, que sea como una pestaña que se sobrepone al
// dar clic»; y «arraigar los eventos que tenemos, pero también las tareas… generar las horas límite fijas igual para verlo en el
// calendario». Capturas con sus datos de ese día: scripts/qa/capturas-dia-entero.mjs.

const fuente = (ruta: string) => readFileSync(new URL(`../../src/${ruta}`, import.meta.url), 'utf8')
const ZONA = 'America/Mexico_City', DIA = '2026-11-16'
const BASE = new Date(2026, 10, 16).setHours(0, 0, 0, 0)
const tarea = (id: string, title: string, due: string | null, extra: Partial<PlanTask> = {}): PlanTask => ({
  id, externalId: id, kind: 'task', title, description: '', projectId: null, sectionId: null, parentId: null, priority: 4, due, timeZone: null,
  recurring: false, recurrenceText: null, durationMinutes: null, completed: false, updatedAt: null, ...extra,
})
const bloque = (id: string, titulo: string, h0: number, h1: number): Bloque => ({
  id, titulo, inicio: BASE + h0 * 3_600_000, fin: BASE + h1 * 3_600_000, color: null, evento: { id, title: titulo } as PlanEvent,
})
const a = (hhmm: string) => `${DIA}T${hhmm}:00-06:00`
// La tarde del lun 16 nov: cinco tareas con hora y ningún evento que las contenga.
const tareas = [
  tarea('clase', 'Clase del miércoles lista: imanes de prospectos a fondo', a('17:00'), { priority: 1 }),
  tarea('fulano', 'Fulano: mandar su mensaje', a('17:30'), { priority: 1, durationMinutes: 15 }),
  tarea('mengano', 'Mengano: mandar su mensaje de reconocimiento', a('17:45'), { priority: 1, durationMinutes: 15 }),
  tarea('zutano', 'Completar la frase de Zutano', a('18:30'), { priority: 2 }),
  tarea('sfocus', 'Sfocus nuevo: correr en Terminal', a('19:00'), { priority: 3, durationMinutes: 45 }),
  tarea('sin-hora', 'Revisar el marcador', DIA),
]
const eventos = [bloque('fuerte', '🧠 Trabajo fuerte · monk mode', 6, 9), bloque('grupal', '👥 Grupal · Primer cliente', 12, 13), bloque('noche', '🌙 Rutina de noche', 20.5, 21)]
const casillas = [{ linea: 0, texto: 'Mensaje a la red caliente a las 16:30', hecho: false }]
const lista = listaDelDia({ dia: DIA, hoy: DIA, zona: ZONA, casillas, abiertas: tareas, completadas: [] })
const enAgenda = enElTimeline(lista, eventos, BASE)

test('cada tarea de Todoist con hora es un bloque propio en su hora; la casilla con hora escrita sigue como marca', () => {
  const { bloques, marcas } = bloquesDeTareas(enAgenda.sueltas, BASE)
  assert.deepEqual(bloques.map(b => b.item.id), ['clase', 'fulano', 'mengano', 'zutano', 'sfocus'])
  assert.deepEqual(marcas.map(m => m.id), ['casilla:0'])
  assert.equal(bloques[0].inicio, BASE + 17 * 3_600_000)
  assert.ok(bloques.every(b => b.id === `tarea:${b.item.id}`), 'el id del bloque no choca con el de un evento')
  assert.ok(!bloques.some(b => b.item.id === 'sin-hora'), 'sin hora no entra a la línea del día')
})

test('dura lo que diga Todoist y, sin duración, media hora; nunca pasa de la medianoche', () => {
  const { bloques } = bloquesDeTareas(enAgenda.sueltas, BASE), min = (id: string) => { const b = bloques.find(x => x.item.id === id)!; return (b.fin - b.inicio) / 60_000 }
  assert.equal(DURACION_TAREA_MIN, 30)
  assert.equal(min('clase'), 30)
  assert.equal(min('fulano'), 15)
  assert.equal(min('sfocus'), 45)
  const tarde = listaDelDia({ dia: DIA, hoy: DIA, zona: ZONA, casillas: [], abiertas: [tarea('tarde', 'Cerrar el día', a('23:45'), { durationMinutes: 60 })], completadas: [] })
  const b = bloquesDeTareas(enElTimeline(tarde, [], BASE).sueltas, BASE).bloques[0]
  assert.equal(b.fin, BASE + 24 * 3_600_000)
})

test('lo ligado a un evento no se duplica como bloque: ya vive dentro de su tarjeta', () => {
  const conGrupal = listaDelDia({ dia: DIA, hoy: DIA, zona: ZONA, casillas: [], abiertas: [tarea('g', 'Grupal 12:00: abrir con los wins', a('12:00'))], completadas: [] })
  const t = enElTimeline(conGrupal, eventos, BASE)
  assert.deepEqual(t.dentro.get('grupal')?.map(i => i.id), ['g'])
  assert.equal(bloquesDeTareas(t.sueltas, BASE).bloques.length, 0)
})

test('una tarea ya completada ese día conserva su bloque, marcada (se reabre desde ahí)', () => {
  const hecha = tarea('hecha', 'Mandar el aviso', a('10:00'), { completed: true, completedAt: `${DIA}T16:05:00Z` })
  const l = listaDelDia({ dia: DIA, hoy: DIA, zona: ZONA, casillas: [], abiertas: [], completadas: [hecha] })
  const { bloques } = bloquesDeTareas(enElTimeline(l, [], BASE).sueltas, BASE)
  assert.equal(bloques.length, 1)
  assert.equal(bloques[0].item.hecho, true)
})

test('el espejo «Tareas · Todoist» de Google no entra dos veces: la pluma descarta sus eventos al leer', () => {
  // La tarea se pinta desde Todoist; su copia en Google (cron tareas-espejo, para el iPhone) lleva `todoistId` y se filtra en la lectura.
  const pluma = readFileSync(new URL('../../server/scripts/calendar/planning.py', import.meta.url), 'utf8')
  assert.match(pluma, /not e\.get\("extendedProperties", \{\}\)\.get\("private", \{\}\)\.get\("todoistId"\)/)
})

test('el Día de escritorio va entero y sin scroll; el teléfono de verdad (angosto y táctil) sigue como estaba', () => {
  const cal = fuente('features/planning/PlanningCalendar.tsx')
  assert.match(cal, /const diaEntero = mode === 'day' && !dosColumnas && !\(telefono && tactil\)/)
  assert.match(cal, /data-dia-entero=\{diaEntero \? '' : undefined\}/)
  assert.match(cal, /entero=\{diaEntero\}/)
  assert.match(fuente('features/planning/planning.module.css'), /\.root\[data-unificada\]\[data-dia-entero\] \{ overflow:hidden; \}/)
  // La escena y el carril pasan el alto a la hoja, y la hoja se lo reparte a la agenda.
  assert.match(fuente('features/planning/escalas-vivas.module.css'), /:global\(\[data-dia-entero\]\) > \.escena \{ flex: 1 1 0; min-height: 0;/)
  assert.match(fuente('features/planning/carril.module.css'), /:global\(\[data-dia-entero\]\) \.hoja \{ height: 100%; \}/)
  const css = fuente('features/planning/dia-vivo.module.css')
  assert.match(css, /\.dia\[data-entero\] \{[^}]*height: 100%;[^}]*\}/)
  assert.match(css, /\.dia\[data-entero\] > \.cuerpo \{ flex: 1 1 0; min-height: 0;/)
  assert.match(css, /\.dia\[data-entero\] > \.pieHabitos \{ flex: none; max-height: 34%;/)
  const dia = fuente('features/planning/DiaVivo.tsx')
  assert.match(dia, /llenar=\{dosColumnas \|\| entero\}/)
  assert.match(dia, /entero \? \{ encima: true \}/)
})

test('las horas se comprimen hasta un piso; más corto que eso, la agenda se desplaza dentro de su caja', () => {
  const mini = fuente('features/planning/AgendaMini.tsx')
  assert.match(mini, /const HORA_PX_MIN = 16/)
  assert.match(mini, /desborda = llenar && pxJusto < HORA_PX_MIN/)
  assert.match(mini, /data-desborda=\{desborda \|\| undefined\}/)
  assert.match(fuente('features/planning/dia-vivo.module.css'), /\.miniCaja\[data-desborda\] \{ overflow-y: auto; scrollbar-width: none; \}/)
})

test('HOY se abre como pestaña encima: no empuja, se cierra con clic fuera o Esc y no se queda guardada', () => {
  const franja = fuente('features/planning/FranjaPlan.tsx'), css = fuente('features/planning/franja-plan.module.css')
  assert.match(franja, /abierta = conDetalle && \(encima \? flota \|\| porSenal : preferida \|\| porSenal\)/)
  assert.match(franja, /if \(encima\) \{ if \(abierta\) cerrarFlota\(\); else setFlota\(true\); return \}/, 'encima no toca la preferencia guardada')
  assert.match(franja, /document\.addEventListener\('pointerdown', fuera, true\)/)
  assert.match(franja, /e\.key !== 'Escape'/)
  assert.match(franja, /role="dialog"[^>]*data-franja-flotante/)
  // La franja abierta encima sigue siendo una línea (sin `data-abierta`, que es lo que deja envolver el título).
  assert.match(franja, /data-abierta=\{\(abierta && !encima\) \|\| undefined\}/)
  assert.match(css, /\.flotante \{ position: absolute; top: calc\(100% \+ 3px\);/)
  assert.match(css, /\.franja\[data-encima\] \{ position: relative; z-index: 30; overflow: visible; \}/)
})

test('la tarea con hora se distingue del evento y se palomea en la línea del día', () => {
  const mini = fuente('features/planning/AgendaMini.tsx'), css = fuente('features/planning/dia-vivo.module.css')
  assert.match(mini, /data-tarea-bloque/)
  assert.match(mini, /className=\{d\.tareaCasilla\} role="checkbox" aria-checked=\{it\.hecho\}[^>]*onClick=\{\(\) => p\.alternar\(it\)\}/)
  assert.match(mini, /className=\{d\.tareaCuerpo\}[^>]*onClick=\{\(\) => onAbrir\(t\)\}/)
  assert.match(css, /\.miniTareas li \{[^}]*border: 1px dashed/)
  // Debajo de la línea de ahora (z 6) y encima de las tarjetas de eventos.
  assert.match(css, /\.miniTareas \{ position: absolute; inset: 0 0 0 32px; z-index: 4;/)
})
