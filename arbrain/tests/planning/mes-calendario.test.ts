process.env.TZ = 'America/Mexico_City'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sinLenguaje } from '../diseno/sin-lenguaje'
import { CALENDARIO_RUTINA } from '../../src/features/planning/rutinas'
import { mesCalendario, moverAlDia, ritmoDelMes, ritmoTipico, tituloMes, objetivoDelDiaMes } from '../../src/features/planning/mes-calendario'
import { rejillaDelMes } from '../../src/features/planning/periodo-vivo'
import { AJUSTES_BASE, VERSION_AJUSTES, leerAjustes } from '../../src/features/planning/ajustes'
import type { PlanEvent, PlanTask } from '../../src/features/planning/types'

// 17 nov 2026, Daniel: «esta vista de mes no me ayuda para planificar nada… pensemos en un calendario de toda la vida… aprovecha e
// incluye mi viaje a monterrey del 26-29». El noviembre de estas pruebas copia la FORMA del real (sin datos de personas).
let n = 0
const NEGOCIO = 'negocio@example.com', PERSONAL = 'personal@example.com'
const yo = { email: 'yo@example.com', name: 'Yo', response: 'accepted', self: true, organizer: true }
const otro = { email: 'otra@example.com', name: 'Otra', response: 'accepted', self: false, organizer: false }
function ev(title: string, start: string, end: string, extra: Partial<PlanEvent> = {}): PlanEvent {
  const allDay = !start.includes('T')
  return { id: `e${n++}`, externalId: `x${n}`, kind: 'event', sourceId: extra.calendarId ?? CALENDARIO_RUTINA, account: 'yo@example.com', calendarId: CALENDARIO_RUTINA,
    title, description: '', location: '', start, end, allDay, timeZone: 'America/Mexico_City', etag: 'v1', recurringEventId: null, recurrence: [], editable: true, ...extra }
}
const a = (dia: string, hora: string) => `${dia}T${hora}:00-06:00`
const dias = (desde: number, hasta: number) => Array.from({ length: hasta - desde + 1 }, (_, i) => `2026-11-${String(desde + i).padStart(2, '0')}`)
function tarea(title: string, due: string | null, extra: Partial<PlanTask> = {}): PlanTask {
  return { id: `t${n++}`, externalId: `tt${n}`, kind: 'task', title, description: '', priority: 4, due, durationMinutes: null, projectId: null, sectionId: null,
    labels: [], completed: false, recurring: false, updatedAt: null, ...extra } as PlanTask
}

function noviembre() {
  const ritual = dias(1, 30).map(d => ev('🌅 5:00 Ritual matutino · luz, agua, yoga', a(d, '05:00'), a(d, '05:30'), { recurringEventId: 'ritual' }))
  const gym = dias(1, 30).map(d => ev('GYM · Pierna', a(d, '09:30'), a(d, '11:30'), { recurringEventId: 'gym', description: '[no negociable]' }))
  const noche = dias(1, 20).map(d => ev('🌙 Rutina de noche: diario y a la cama', a(d, '20:30'), a(d, '21:00'), { recurringEventId: 'noche' }))
  // La grupal de lunes, miércoles y viernes: tres por semana; la del lunes llega sin invitados (Google no los manda en esa ocurrencia).
  const grupales = ['2026-11-16', '2026-11-18', '2026-11-20', '2026-11-23', '2026-11-25', '2026-11-27'].map((d, i) =>
    ev('👥 Grupal · Primer cliente · Cerebro Artificial (cohorte fundadora)', a(d, '12:00'), a(d, '13:00'), { recurringEventId: 'grupal', calendarId: NEGOCIO, sourceId: NEGOCIO,
      ...(i % 3 ? { attendees: [yo, otro], meetUrl: 'https://meet.example' } : {}) }))
  const fase = ev('🎯 Fase 3 · Tu primer cliente: marketing y ventas (S4–7)', '2026-11-16', '2026-12-14')
  const viaje = ev('🏔️ Viaje con Fulana · premio del mes (Centro)', '2026-11-26', '2026-11-30')
  const hospedaje = ev('Stay at Hotel Centro', '2026-11-26', '2026-11-30', { calendarId: PERSONAL, sourceId: PERSONAL })
  const ida = ev('Flight to Monterrey (VB 7401)', a('2026-11-26', '15:20'), a('2026-11-26', '16:52'), { calendarId: PERSONAL, sourceId: PERSONAL })
  const regreso = ev('Flight to Morelia (VB 7400)', a('2026-11-29', '13:08'), a('2026-11-29', '14:30'), { calendarId: PERSONAL, sourceId: PERSONAL })
  const reunion = ev('🤝 Reunión SaaS Factory en Monterrey (presencial)', '2026-11-28', '2026-11-29')
  const unoAUno = ev('🧭 Uno a uno · al cerrar la etapa · tu oferta (S3)', '2026-11-12', '2026-11-16')
  const mecanica = ev('🔓 Abre Primer cliente en el classroom (día 28)', '2026-11-14', '2026-11-18')
  const llamada = ev('🧭 Tu oferta · Persona Uno · Cerebro Artificial', a('2026-11-16', '08:00'), a('2026-11-16', '08:45'), { calendarId: NEGOCIO, sourceId: NEGOCIO, attendees: [yo, otro], meetUrl: 'https://meet.example' })
  const brief = ev('📋 Brief del diagnóstico · Persona Uno', a('2026-11-16', '08:00'), a('2026-11-16', '08:45'), { calendarId: NEGOCIO, sourceId: NEGOCIO })
  const siesta = ev('😴 Siesta 20 min', a('2026-11-17', '13:00'), a('2026-11-17', '13:20'), { calendarId: PERSONAL, sourceId: PERSONAL })
  const grabar = ev('🎥 Grabar mi primer «mírame hacerlo»', a('2026-11-19', '06:15'), a('2026-11-19', '07:30'))
  const eventos = [...ritual, ...gym, ...noche, ...grupales, fase, viaje, hospedaje, ida, regreso, reunion, unoAUno, mecanica, llamada, brief, siesta, grabar]
  const tareas = [
    tarea('Vencida de ayer', '2026-11-16', { priority: 3 }),
    tarea('P1 de hoy con hora', '2026-11-17T08:40:00-06:00', { priority: 1 }),
    tarea('P2 de hoy', '2026-11-17', { priority: 2 }),
    tarea('Grabar la clase antes de Monterrey', '2026-11-25T18:00:00', { priority: 2 }),
  ]
  const hechas = [tarea('Ya cerrada el lunes', '2026-11-16', { completed: true, completedAt: '2026-11-16T18:00:00Z' })]
  return { eventos, tareas, hechas, viaje, hospedaje, ida, regreso, reunion, unoAUno, fase, grupales, brief, siesta, grabar, llamada, ritual, gym, noche }
}
function mes() {
  const x = noviembre(), fecha = new Date('2026-11-17T12:00:00')
  const semanas = mesCalendario({ semanas: rejillaDelMes(fecha), desde: '2026-11-01', hasta: '2026-12-01', hoy: '2026-11-17', eventos: x.eventos, tareas: x.tareas, hechas: x.hechas,
    zona: 'America/Mexico_City', programa: { lunes0: Date.UTC(2026, 9, 19), ultima: 11 } })
  const dia = (d: string) => semanas.flatMap(w => w.dias).find(y => y.dia === d)!
  return { ...x, semanas, dia }
}

test('la cuadrícula de siempre: noviembre son 6 semanas de lunes a domingo, del 26 oct al 6 dic, con hoy marcado', () => {
  const { semanas, dia } = mes()
  assert.equal(semanas.length, 6)
  assert.equal(semanas[0].lunes, '2026-10-26'); assert.equal(semanas.at(-1)!.domingo, '2026-12-06')
  assert.ok(dia('2026-11-17').hoy && !dia('2026-11-17').pasado && dia('2026-11-16').pasado)
  assert.ok(dia('2026-11-21').finde && dia('2026-11-22').finde && !dia('2026-11-20').finde)
  assert.equal(dia('2026-10-26').enMes, false)
})

test('Monterrey del 26 al 29 es UNA barra morada con el hospedaje plegado; los días se marcan fuera de casa; vuelos y reunión en su celda', () => {
  const { semanas, dia, viaje, hospedaje, ida, regreso, reunion } = mes()
  const s5 = semanas.find(w => w.lunes === '2026-11-23')!
  const barra = s5.barras.find(b => b.id === viaje.id)!
  assert.deepEqual([barra.a, barra.z, barra.tono], [3, 6, 'viaje'])
  assert.deepEqual(barra.dentro, ['Hospedaje: Hotel Centro'])
  assert.ok(!s5.barras.some(b => b.id === hospedaje.id), 'el hospedaje no es otra barra')
  for (const d of dias(26, 29)) assert.ok(dia(d).fuera?.startsWith('Viaje con Fulana'), d)
  assert.equal(dia('2026-11-25').fuera, null)
  const vuelo = dia('2026-11-26').items.find(i => i.id === ida.id)!
  assert.deepEqual([vuelo.tipo, vuelo.hora, vuelo.tono, vuelo.titulo], ['compromiso', '15:20', 'viaje', 'Vuelo a Monterrey'])
  assert.equal(dia('2026-11-29').items.find(i => i.id === regreso.id)?.titulo, 'Vuelo a Morelia')
  const r = dia('2026-11-28').items[0]
  assert.deepEqual([r.id, r.tipo, r.tono], [reunion.id, 'hito', 'viaje'], 'la reunión presencial va primero en su día')
})

test('la rutina no es texto: ritual, gym (aunque sea «no negociable») y la noche son ritmo; la grupal de L-M-V nunca es rutina', () => {
  const { dia, grupales, eventos } = mes()
  const r = ritmoDelMes(eventos)
  for (const g of grupales) assert.ok(!r.has(g.id), 'la grupal de tres por semana (aun sin invitados el lunes) es compromiso')
  const lunes = dia('2026-11-16')
  assert.deepEqual(lunes.ritmo.map(x => x.desde), [300, 570, 1230])
  assert.ok(!lunes.items.some(i => /Ritual|GYM|Rutina de noche/.test(i.titulo)))
  assert.ok(lunes.items.some(i => i.titulo === 'Grupal · Primer cliente' && i.tipo === 'compromiso' && i.tono === null), 'la grupal sale, sin el sufijo del programa y neutra')
})

test('el ritmo de todos los días se dice una vez, con su hora más común', () => {
  const { semanas } = mes()
  assert.deepEqual(ritmoTipico(semanas).map(r => `${r.hora} ${r.nombre}`), ['05:00 Ritual matutino', '09:30 GYM', '20:30 Rutina de noche'])
})

test('en cada día, por importancia: lo de todo el día, compromisos, tareas (P1 primero, la vencida en hoy) y bloques; nada de briefs, siestas ni lo cerrado', () => {
  const { dia, brief, llamada, siesta, grabar } = mes()
  const lunes = dia('2026-11-16').items
  assert.ok(lunes.some(i => i.id === llamada.id) && !lunes.some(i => i.id === brief.id), 'el brief vive en su llamada')
  assert.ok(!lunes.some(i => i.titulo === 'Ya cerrada el lunes'), 'lo cerrado no ocupa la celda')
  assert.ok(!lunes.some(i => i.titulo === 'Vencida de ayer'), 'la vencida sube a hoy')
  const hoy = dia('2026-11-17').items
  // Las de hora, por hora; luego las de solo fecha, P1 primero (la prioridad se ve en el color del círculo).
  assert.deepEqual(hoy.filter(i => i.tipo === 'tarea').map(i => `${i.titulo}${i.vencida ? ' (vencida)' : ''}`), ['P1 de hoy con hora', 'P2 de hoy', 'Vencida de ayer (vencida)'])
  assert.ok(!hoy.some(i => i.id === siesta.id), 'lo de menos de 45 min que no es compromiso es textura del Día')
  assert.equal(dia('2026-11-19').items.find(i => i.id === grabar.id)?.tipo, 'bloque')
  assert.equal(dia('2026-11-25').items.find(i => i.titulo.startsWith('Grabar la clase'))?.hora, '18:00', 'hora flotante de Todoist, tal cual')
})

test('cada semana: su S del programa y su fase como etiqueta (la fase nunca es barra), su carga contada y el uno a uno como barra que sigue', () => {
  const { semanas, fase, unoAUno } = mes()
  const s4 = semanas.find(w => w.lunes === '2026-11-16')!, s3 = semanas.find(w => w.lunes === '2026-11-09')!
  assert.deepEqual([s4.s, s4.fase], ['S4', 'Tu primer cliente'])
  assert.ok(!semanas.some(w => w.barras.some(b => b.id === fase.id)))
  const b = s3.barras.find(x => x.id === unoAUno.id)!
  assert.deepEqual([b.a, b.z, b.antes, b.despues, b.tono], [3, 6, false, false, 'accion'])
  assert.ok(!semanas.some(w => w.barras.some(x => /classroom/.test(x.titulo))), 'la mecánica del programa no se pinta')
  // Carga de S4: 3 grupales + la llamada = 4 compromisos; 3.75 h con personas (empalmes una vez); tareas: 3 abiertas + 1 cerrada que vencen esa semana.
  assert.deepEqual(s4.carga, { compromisos: 4, tareas: 4, horas: 4 })
})

test('arrastrar a otro día conserva la hora y la duración; lo de todo el día conserva cuántos días dura; lo que no se mueve, null', () => {
  const { ida, viaje } = noviembre()
  const m1 = moverAlDia(ida, '2026-11-27')!
  assert.equal(m1.todoElDia, false)
  assert.equal(m1.data.start, new Date('2026-11-27T15:20:00-06:00').toISOString())
  assert.equal(m1.data.end, new Date('2026-11-27T16:52:00-06:00').toISOString())
  assert.equal(m1.data.allDay, false)
  const m2 = moverAlDia(viaje, '2026-11-27')!
  assert.deepEqual([m2.data.start, m2.data.end, m2.data.allDay, m2.todoElDia], ['2026-11-27', '2026-12-01', true, true])
  assert.equal(moverAlDia(ida, '2026-11-26'), null)
  const t1 = moverAlDia(tarea('fecha sola', '2026-11-18'), '2026-11-20')!
  assert.equal(t1.data.due, '2026-11-20')
  assert.equal(moverAlDia(tarea('flotante', '2026-11-25T18:00:00'), '2026-11-24')!.data.due, '2026-11-24T18:00:00')
  assert.equal(moverAlDia(tarea('con zona', '2026-11-17T14:40:00Z'), '2026-11-19')!.data.due, '2026-11-19T14:40:00.000Z')
  assert.equal(moverAlDia(tarea('cerrada', '2026-11-17', { completed: true }), '2026-11-19'), null)
})

test('los títulos en la celda: sin emoji ni el sufijo del programa; vuelos y hospedaje en español', () => {
  assert.equal(tituloMes('👥 Grupal · Clase de lienzos · Cerebro Artificial (cohorte fundadora)'), 'Grupal · Clase de lienzos')
  assert.equal(tituloMes('Flight to Monterrey (VB 7401)'), 'Vuelo a Monterrey')
  assert.equal(tituloMes('Stay at Urban Loft'), 'Hospedaje: Urban Loft')
  assert.equal(tituloMes('Prospección en Frío con IA · Nivel 7'), 'Prospección en Frío con IA · Nivel 7')
})

test('el objetivo del día: del registro o de su tarea; cumplido por la tarea cerrada o el hábito', () => {
  const goals = [{ id: 'g', scope: 'day', start: '2026-11-17', end: '2026-11-18', title: 'YouTube y el mecanismo único', status: 'agreed', success: '' }] as never
  assert.deepEqual(objetivoDelDiaMes({ dia: '2026-11-17', goals, abiertas: [], completadas: [], eventos: [], fuentes: [], zona: 'America/Mexico_City' }), { titulo: 'YouTube y el mecanismo único', hecho: false })
  assert.equal(objetivoDelDiaMes({ dia: '2026-11-17', goals, abiertas: [], completadas: [], eventos: [], fuentes: [], zona: 'America/Mexico_City', habito: () => true })?.hecho, true)
  const cerrada = tarea('Clase lista', '2026-11-16', { labels: ['objetivo'], completed: true, completedAt: '2026-11-16T20:00:00Z' })
  assert.deepEqual(objetivoDelDiaMes({ dia: '2026-11-16', goals: [], abiertas: [], completadas: [cerrada], eventos: [], fuentes: [], zona: 'America/Mexico_City' }), { titulo: 'Clase lista', hecho: true })
  assert.equal(objetivoDelDiaMes({ dia: '2026-11-18', goals, abiertas: [], completadas: [], eventos: [], fuentes: [], zona: 'America/Mexico_City' }), null)
})

test('calendario vacío (la copia del alumno): seis semanas limpias, sin carga, sin barras ni ritmo', () => {
  const semanas = mesCalendario({ semanas: rejillaDelMes(new Date('2026-11-17T12:00:00')), desde: '2026-11-01', hasta: '2026-12-01', hoy: '2026-11-17', eventos: [], tareas: [], zona: 'America/Mexico_City', programa: null })
  assert.equal(semanas.length, 6)
  assert.ok(semanas.every(w => !w.barras.length && !w.s && !w.fase && w.carga.horas === 0 && w.dias.every(d => !d.items.length && !d.ritmo.length && !d.fuera)))
  assert.deepEqual(ritmoTipico(semanas), [])
})

test('el Mes de la computadora es la cuadrícula nueva: default, y lo guardado antes de la versión 4 vuelve a ella una vez', () => {
  assert.equal(AJUSTES_BASE.mesVista, 'cuadricula')
  assert.equal(VERSION_AJUSTES, 4)
  assert.equal(leerAjustes(JSON.stringify({ ...AJUSTES_BASE, v: 3, mesVista: 'recorrido' })).mesVista, 'cuadricula')
  assert.equal(leerAjustes(JSON.stringify({ ...AJUSTES_BASE, v: 4, mesVista: 'recorrido' })).mesVista, 'recorrido', 'elegido después, el Recorrido se respeta')
  const cal = sinLenguaje(readFileSync(new URL('../../src/features/planning/PlanningCalendar.tsx', import.meta.url), 'utf8'))
  assert.match(cal, /const mesEntero = mode === 'month' && ajustes\.mesVista === 'cuadricula' && !compacto/)
  assert.match(cal, /mode === 'month' && mesEntero \? <MesCalendario/)
  assert.match(cal, /data-mes-entero=\{mesEntero \? '' : undefined\}/)
  // Mover en el Mes pasa por la misma pluma y la misma guarda de invitados que el Día y la Semana.
  assert.match(cal, /const m = moverAlDia\(item, hacia\); if \(m\) void moverEnRejilla\(item, m\.inicio, m\.fin, false, m\.data, m\.todoElDia\)/)
  assert.match(cal, /const guarda = confirmado \? null : guardaInvitados\(item, inicio, todoElDia\)/)
})

test('los choques de horario se marcan: dos compromisos que se enciman el mismo día dicen con cuál chocan', () => {
  const x = noviembre()
  const reto = ev('🎯 Reto de la cohorte: 10 conversaciones (clase grabada)', a('2026-11-27', '12:00'), a('2026-11-27', '12:45'))
  const semanas = mesCalendario({ semanas: rejillaDelMes(new Date('2026-11-17T12:00:00')), desde: '2026-11-01', hasta: '2026-12-01', hoy: '2026-11-17', eventos: [...x.eventos, reto],
    tareas: [], zona: 'America/Mexico_City', programa: null })
  const v27 = semanas.flatMap(w => w.dias).find(d => d.dia === '2026-11-27')!.items
  assert.equal(v27.find(i => i.id === reto.id)?.choque, 'Grupal · Primer cliente')
  assert.ok(v27.find(i => i.titulo === 'Grupal · Primer cliente')?.choque?.startsWith('Reto de la cohorte'))
  const l16 = semanas.flatMap(w => w.dias).find(d => d.dia === '2026-11-16')!.items
  assert.ok(l16.every(i => !i.choque), 'la llamada de las 8 y la grupal de las 12 no chocan')
  // La llamada reservada dentro de «Uno a uno disponible» no choca con su ventana.
  const ventana = ev('🗓️ Uno a uno disponible', a('2026-11-19', '14:00'), a('2026-11-19', '17:00'), { calendarId: NEGOCIO, sourceId: NEGOCIO })
  const reservada = ev('🧭 Tu oferta · Persona Dos', a('2026-11-19', '15:00'), a('2026-11-19', '15:45'), { calendarId: NEGOCIO, sourceId: NEGOCIO, attendees: [yo, otro] })
  const j19 = mesCalendario({ semanas: rejillaDelMes(new Date('2026-11-17T12:00:00')), desde: '2026-11-01', hasta: '2026-12-01', hoy: '2026-11-17', eventos: [ventana, reservada],
    tareas: [], zona: 'America/Mexico_City', programa: null }).flatMap(w => w.dias).find(d => d.dia === '2026-11-19')!.items
  assert.equal(j19.length, 2)
  assert.ok(j19.every(i => !i.choque))
})

test('las estrellas salen de los DATOS del hábito: llegan los hábitos y el Mes se entera (no de la función `record`, de identidad fija)', async () => {
  const { diasConHabito } = await import('../../src/features/planning/mes-calendario')
  const rango = { from: '2026-10-26', to: '2026-11-17' }
  assert.deepEqual([...diasConHabito(null, 'objetivo_dia', rango).dias], [])
  assert.equal(diasConHabito(null, 'objetivo_dia', rango).listos, false, 'sin datos: leyendo (la estrella no dice «sin marcar»)')
  const datos = { from: '2026-10-26', to: '2026-11-17', checks: [{ fecha: '2026-11-17', habito_clave: 'objetivo_dia', hecho: true }],
    records: [{ fecha: '2026-10-26', habito_clave: 'objetivo_dia', hecho: true }, { fecha: '2026-10-30', habito_clave: 'objetivo_dia', hecho: true },
      { fecha: '2026-10-29', habito_clave: 'objetivo_dia', hecho: false }, { fecha: '2026-10-27', habito_clave: 'abs', hecho: true }] }
  const r = diasConHabito(datos, 'objetivo_dia', rango)
  assert.equal(r.listos, true)
  assert.deepEqual([...r.dias].sort(), ['2026-10-26', '2026-10-30', '2026-11-17'])
  // Lo leído de otro rango (el mes anterior, al cambiar de mes) no cuenta como listo.
  assert.equal(diasConHabito({ ...datos, from: '2026-09-28' , to: '2026-10-25' }, 'objetivo_dia', rango).listos, false)
  // El memo del Mes depende de los datos (objetivoHabito), nunca de `habitos.record`.
  const mes = sinLenguaje(readFileSync(new URL('../../src/features/planning/MesCalendario.tsx', import.meta.url), 'utf8'))
  assert.match(mes, /const objetivoHabito = useMemo\(\(\) => diasConHabito\(habitos\.data, 'objetivo_dia'/)
  assert.match(mes, /goals\.data, objetivoHabito\]\)/)
  assert.doesNotMatch(mes, /habitos\.record/)
  assert.match(mes, /data-habitos=\{objetivoHabito\.listos \? 'listos' : 'leyendo'\}/)
})
