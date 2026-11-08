import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { enElTimeline, eventoDe, eventosExplicitos, horaEnTexto, listaDelDia, minutoDeTarea, mismoPendiente, parejas } from '../../src/features/planning/lista-dia'
import type { Bloque } from '../../src/features/planning/dia-vivo'
import type { Goal } from '../../src/features/goals/model'
import type { PlanEvent, PlanTask } from '../../src/features/planning/types'

const ZONA = 'America/Mexico_City'
const DIA = '2026-11-04'
const BASE = new Date(2026, 10, 4).setHours(0, 0, 0, 0)
const tarea = (id: string, title: string, due: string | null, extra: Partial<PlanTask> = {}): PlanTask => ({
  id, externalId: id, kind: 'task', title, description: '', projectId: null, sectionId: null, parentId: null, priority: 4, due, timeZone: null,
  recurring: false, recurrenceText: null, durationMinutes: null, completed: false, updatedAt: null, ...extra,
})
const bloque = (id: string, titulo: string, h0: number, h1: number): Bloque => ({
  id, titulo, inicio: BASE + h0 * 3_600_000, fin: BASE + h1 * 3_600_000, color: null, evento: { id, title: titulo } as PlanEvent,
})
// El mié 4 nov tal como lo lee la pluma (3 nov 2026, 18:46).
const bloques = [
  bloque('rutina', '🌅 5:30 Despierto · rutina matutina: abs + mis 3 casillas (Ctrl+H)', 5.5, 6),
  bloque('fuerte', '🧠 Trabajo fuerte · monk mode', 6, 9),
  bloque('gym', 'GYM', 9.5, 11.5),
  bloque('grupal', '👥 Grupal · Cerebro Artificial (cohorte fundadora)', 12, 13),
  bloque('noche', '🌙 Rutina de noche: diario, objetivo de mañana y a la cama 21:00', 20.5, 21),
]
const casillas = [
  { linea: 0, texto: 'Rutina nueva a las 5:30: agua y creatina, luz, meditación, yoga y plancha (15 min)', hecho: false },
  { linea: 1, texto: 'Clase de las 12:00 dada: la ecuación de valor y la Grand Slam Offer aplicadas a su consultoría', hecho: false },
  { linea: 2, texto: 'Post de Wins publicado con la foto del perro, y aviso a Fulano y Mengano', hecho: false },
]
const grupal = tarea('grupal-t', 'Grupal 12:00: 5 min «todos conectamos su Arbrain» (generar código en la web, pegarlo, prender compartir texto)', DIA)

test('la hora escrita en el texto: «12:00:», «a las 5:30», nunca segundos ni números sueltos', () => {
  assert.equal(horaEnTexto(grupal.title), 12 * 60)
  assert.equal(horaEnTexto(casillas[0].texto), 5 * 60 + 30)
  assert.equal(horaEnTexto('Post de Wins'), null)
  assert.equal(horaEnTexto('versión 0.2.20'), null)
  assert.equal(horaEnTexto('10:00:30 exacto'), null)
  assert.equal(horaEnTexto('a las 25:00'), null)
})

test('la hora de una tarea: la de Todoist manda; sin hora, la escrita; vencida de otro día, sin hora', () => {
  assert.equal(minutoDeTarea(tarea('a', 'Llamar 12:00', '2026-11-04T21:00:00Z'), DIA, ZONA), 15 * 60)
  assert.equal(minutoDeTarea(tarea('b', 'x', '2026-11-04T15:30:00'), DIA, ZONA), 15 * 60 + 30)
  assert.equal(minutoDeTarea(grupal, DIA, ZONA), 12 * 60)
  assert.equal(minutoDeTarea(tarea('c', 'Grupal 12:00', '2026-11-03'), DIA, ZONA), null)
})

test('la grupal: la tarea y la casilla de las 12:00 viven dentro del evento, una sola vez cada una', () => {
  const lista = listaDelDia({ dia: DIA, hoy: '2026-11-03', zona: ZONA, casillas, abiertas: [grupal], completadas: [] })
  assert.deepEqual(lista.map(i => i.id), ['casilla:0', 'casilla:1', 'casilla:2', 'grupal-t'])
  const { dentro, sueltas } = enElTimeline(lista, bloques, BASE)
  assert.deepEqual(dentro.get('grupal')?.map(i => i.id), ['casilla:1', 'grupal-t'], 'por nombre y por empezar a las 12:00')
  assert.deepEqual(dentro.get('rutina')?.map(i => i.id), ['casilla:0'], 'la rutina de las 5:30 comparte nombre')
  assert.equal(sueltas.length, 0)
  assert.equal(dentro.get('fuerte'), undefined)
})

test('con hora y sin evento que la reclame: una marca suelta; sin hora: solo en la lista', () => {
  const lista = listaDelDia({ dia: DIA, hoy: DIA, zona: ZONA, casillas: [], abiertas: [
    tarea('suelta', 'Revisar contrato', '2026-11-04T15:00:00'), tarea('sinHora', 'Algo', DIA), tarea('encima', 'Escribir', '2026-11-04T07:00:00'),
  ], completadas: [] })
  const { dentro, sueltas } = enElTimeline(lista, bloques, BASE)
  assert.deepEqual(sueltas.map(i => i.id), ['encima', 'suelta'], '07:00 cae en «Trabajo fuerte» pero ni comparte nombre ni empieza ahí: marca')
  assert.equal(dentro.size, 0)
  assert.ok(lista.some(i => i.id === 'sinHora'))
})

test('el evento más corto gana cuando dos comparten nombre; los ids del objetivo mandan sobre la hora', () => {
  const encima = [...bloques, bloque('grupal-larga', 'Grupal extendida', 11, 14)]
  assert.equal(eventoDe({ texto: 'Grupal 12:30', minuto: 12 * 60 + 30 }, encima, BASE)?.id, 'grupal')
  const goals = [{ id: 'g', scope: 'day', start: DIA, end: '2026-11-05', taskIds: ['libre'], eventIds: ['gym'] }] as unknown as Goal[]
  const explicitos = eventosExplicitos(goals, DIA, bloques)
  const lista = listaDelDia({ dia: DIA, hoy: DIA, zona: ZONA, casillas: [], abiertas: [tarea('libre', 'Sin fecha ligada', null)], completadas: [], goals })
  assert.deepEqual(lista.map(i => i.id), ['libre'], 'ligada por taskIds aunque no venza hoy')
  assert.deepEqual(enElTimeline(lista, bloques, BASE, explicitos).dentro.get('gym')?.map(i => i.id), ['libre'])
})

test('completadas del día se quedan marcadas; la tarea-objetivo y la gemela de una casilla no se repiten', () => {
  const hecha = tarea('hecha', 'Mandar factura', DIA, { completed: true, completedAt: '2026-11-04T16:00:00Z' })
  const repe = tarea('repe', 'Llamar a Zutano', DIA, { completed: true, recurring: true, completedAt: '2026-11-04T16:00:00Z' })
  const gemela = tarea('gemela', 'Post de Wins publicado con la foto del perro, y aviso a Fulano y Mengano', DIA)
  const ancla = tarea('ancla', 'Clase de ofertas', DIA, { labels: ['objetivo'] })
  const vieja = tarea('vieja', 'Vencida', '2026-11-01')
  const lista = listaDelDia({ dia: DIA, hoy: DIA, zona: ZONA, casillas, abiertas: [gemela, ancla, vieja], completadas: [hecha, repe], sin: 'ancla' })
  assert.deepEqual(lista.map(i => i.id), ['casilla:0', 'casilla:1', 'gemela', 'vieja', 'repe', 'hecha'], 'la gemela toma el lugar de su criterio; luego cronología')
  assert.equal(lista.find(i => i.id === 'gemela')?.criterio?.linea, 2)
  assert.ok(!lista.some(i => i.id === 'ancla' || i.id === 'casilla:2'))
  assert.equal(lista.find(i => i.id === 'hecha')?.hecho, true)
  assert.equal(lista.find(i => i.id === 'repe')?.fija, true, 'una repetición completada no se reabre')
  assert.equal(lista.find(i => i.id === 'vieja')?.vencida, true)
  // Reabierta: sigue en completadas hasta la siguiente lectura, pero la lectura de abiertas manda.
  const reabierta = listaDelDia({ dia: DIA, hoy: DIA, zona: ZONA, casillas: [], abiertas: [{ ...hecha, completed: false }], completadas: [hecha] })
  assert.deepEqual(reabierta.map(i => [i.id, i.hecho]), [['hecha', false]])
})

test('el Día ya no tiene sección de Tareas: la lista vive en la franja y el timeline pinta las marcas', () => {
  const fuente = (f: string) => readFileSync(new URL(`../../src/features/planning/${f}`, import.meta.url), 'utf8')
  const dia = fuente('DiaVivo.tsx'), agenda = fuente('AgendaMini.tsx')
  assert.doesNotMatch(dia, /aria-label=\{abierta \? 'Tareas'|<FilaTarea /)
  assert.match(dia, /<ListaDia /)
  assert.match(agenda, /data-marca-tarea/)
  assert.match(agenda, /data-sublinea/)
})

// El dom 8 nov 2026 tal como lo leyó Daniel: tres criterios del objetivo repetidos como tareas de Todoist con otras palabras.
const DOM = '2026-11-08'
const criterios = [
  { linea: 0, texto: 'Cola de la semana del canal de Levy revisada y con tu sí', hecho: false },
  { linea: 1, texto: 'Permiso de estadísticas de YouTube tocado en la bandeja', hecho: true },
  { linea: 2, texto: 'Mensajes de cobro a Fulano, Mengano y Zutano enviados', hecho: false },
  { linea: 3, texto: 'Rutina 5:30 + gym de abdomen y correr', hecho: false },
  { linea: 4, texto: 'Revisión corta de la semana', hecho: false },
]
const cobro = tarea('cobro', 'Mandar a Fulano, Mengano y Zutano el aviso amable de pago (borradores abajo)', DOM, { priority: 1 })
const cola = tarea('cola', 'Revisar y dar tu sí a la cola de la semana del canal de Levy', DOM, { priority: 1 })
const permiso = tarea('permiso', 'Tocar en la bandeja el permiso de estadísticas de YouTube (canal de Levy)', DOM, { priority: 2, completed: true, completedAt: '2026-11-08T15:07:54Z' })
const caja = tarea('caja', '🎨 miplataforma.com: mejor UI para la caja de comunidad', '2026-10-24', { priority: 3 })

test('criterio y tarea que dicen lo mismo con otras palabras: los tres pares del dom 8 nov', () => {
  assert.ok(mismoPendiente(criterios[0].texto, cola.title) > 0, 'revisada ↔ revisar, cola, semana, canal, Levy')
  assert.ok(mismoPendiente(criterios[1].texto, permiso.title) > 0, 'tocado ↔ tocar, permiso, estadísticas, YouTube, bandeja')
  assert.ok(mismoPendiente(criterios[2].texto, cobro.title) > 0, 'los tres nombres: Fulano, Mengano y Zutano')
  assert.equal(mismoPendiente('Post de Wins publicado', 'post de wins publicado'), 2, 'mismo texto, el más fuerte')
})

test('lo que solo se parece no se junta: una o dos palabras sueltas no bastan', () => {
  assert.equal(mismoPendiente(criterios[4].texto, cola.title), 0, '«revisión» y «semana» no hacen la cola del canal')
  assert.equal(mismoPendiente(criterios[0].texto, permiso.title), 0, '«canal de Levy» en las dos, nada más')
  assert.equal(mismoPendiente(criterios[3].texto, caja.title), 0)
  assert.equal(mismoPendiente('Grupal 12:00: nombre y bonos', 'Preparar bonos y descuentos con Levy'), 0)
  assert.equal(mismoPendiente('', cola.title), 0)
})

test('las parejas son una a una: cada tarea representa a un solo criterio, el más parecido', () => {
  const dos = [{ texto: 'Cola del canal de Levy revisada' }, { texto: 'Cola de la semana del canal de Levy revisada y con tu sí' }]
  const p = parejas(dos, [cola])
  assert.equal(p.size, 1)
  assert.equal(p.get(1)?.id, 'cola', 'gana el criterio que la cubre entera')
})

test('el Hoy del dom 8 nov: una fila por pendiente, la tarea con su prioridad en el lugar de su criterio', () => {
  const lista = listaDelDia({ dia: DOM, hoy: DOM, zona: ZONA, casillas: criterios, abiertas: [cobro, cola, caja], completadas: [permiso] })
  assert.deepEqual(lista.map(i => i.id), ['cola', 'permiso', 'cobro', 'casilla:3', 'casilla:4', 'caja'])
  assert.equal(lista.length, 6, 'eran 8 filas con los tres pares repetidos')
  assert.deepEqual(lista.slice(0, 3).map(i => [i.origen, i.tarea?.priority, i.criterio?.linea]), [['tarea', 1, 0], ['tarea', 2, 1], ['tarea', 1, 2]])
  assert.equal(lista[1].hecho, true, 'la tarea cerrada manda: el permiso se ve hecho')
  assert.equal(lista[0].criterio?.hecho, false, 'el criterio pendiente viaja con la tarea para marcarlo al cerrarla')
  assert.equal(lista.find(i => i.id === 'caja')?.vencida, true)
  const { dentro, sueltas } = enElTimeline(lista, [], BASE)
  assert.equal(dentro.size + sueltas.length, 1, 'solo la rutina de las 5:30 trae hora')
})

test('la fila de la tarea gemela: cerrar marca el criterio y el tooltip lo dice', () => {
  const fuente = (f: string) => readFileSync(new URL(`../../src/features/planning/${f}`, import.meta.url), 'utf8')
  assert.match(fuente('DiaVivo.tsx'), /it\.criterio && pluma\.puede && it\.criterio\.hecho === it\.hecho\) pluma\.alternar\(it\.criterio\.linea, !it\.hecho\)/)
  assert.doesNotMatch(fuente('ListaDia.tsx'), />P1</, 'sin la etiqueta P1: la prioridad es el color del círculo')
})
