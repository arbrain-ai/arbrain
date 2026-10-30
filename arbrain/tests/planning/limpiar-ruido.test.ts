import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sinLenguaje } from '../diseno/sin-lenguaje'
import { atencionDe, esMecanicaAlumno, nombreDeFase, piedraDe } from '../../src/features/planning/drip'
import { columnasDeBarra, esDeVariosDias, tramoDeTodoElDia } from '../../src/features/planning/semana-horas'
import { porDia } from '../../src/features/cabina/vistas/agenda'
import type { PlanningSnapshot } from '../../src/features/planning/types'

// 25 oct 2026, Daniel viendo noviembre: «la veo difícil de estudiar, siento redundancia con las fases y objetivos; veo repetido
// "Abre Primer cliente en el classroom"; no hay colores que guíen la atención ni la vista; termina de limpiar el ruido».
const fuente = (f: string) => sinLenguaje(readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8'))
const dia = (title: string, start: string, end: string) => ({ id: title, title, start, end, allDay: true })

test('la mecánica del programa para los alumnos («🔓 Abre … en el classroom») no es del calendario de Daniel', () => {
  for (const t of ['🔓 Abre Primer cliente en el classroom (día 28)', '🔓 Abre Supernova en el classroom (día 14)', 'Abre Supernova en el classroom'])
    assert.equal(esMecanicaAlumno(dia(t, '2026-11-14', '2026-11-18')), true, t)
  for (const t of ['🌟 Fase 2 · Supernova, tu oferta (S2–3)', '🧭 Uno a uno · al cerrar la etapa · tu oferta (S3)', '🎤 Demo day · Tu cerebro (viernes de S1)',
    '🏔️ Oaxaca · premio del monk mode (Centro, Jalatlaco)', '🚀 Abre el HT · 15 de octubre'])
    assert.equal(esMecanicaAlumno(dia(t, '2026-11-14', '2026-11-18')), false, t)
  // Con hora no es la mecánica (una clase que menciona el classroom sigue en su lugar).
  assert.equal(esMecanicaAlumno({ title: '🔓 Abre el classroom en vivo', allDay: false }), false)
})

test('es un filtro por regla en cada vista, no un borrado: Semana, Día, Mes, Año y la Cabina', () => {
  const cal = fuente('features/planning/PlanningCalendar.tsx')
  assert.match(cal, /const eventoVisible = useCallback\(\(e: PlanEvent\) => porCalendario\(e\) && !esMecanicaAlumno\(e\)/)
  assert.match(cal, /const yearVisible = useMemo\(\(\) => yearEvents\.events\.filter\([^\n]*!esMecanicaAlumno\(e\)\)/)
  const snap = { sources: [{ id: 's', title: 'Trabajo Duro', objective: false, color: null }], events: [
    { ...dia('🔓 Abre Primer cliente en el classroom (día 28)', '2026-11-14', '2026-11-18'), sourceId: 's' },
    { ...dia('🧭 Uno a uno · al cerrar la etapa · tu oferta (S3)', '2026-11-12', '2026-11-16'), sourceId: 's' },
  ], tasks: [] } as unknown as PlanningSnapshot
  const { mapa, tramos } = porDia(snap)
  assert.deepEqual(tramos.map(t => t.id), ['🧭 Uno a uno · al cerrar la etapa · tu oferta (S3)'])
  assert.equal([...mapa.values()].flat().some(i => i.titulo.includes('classroom')), false)
})

test('la fase es una etiqueta corta junto a la S, no otra cinta', () => {
  assert.equal(nombreDeFase('🌟 Fase 2 · Supernova, tu oferta (S2–3)'), 'Supernova')
  assert.equal(nombreDeFase('🧠 Fase 1 · Tu cerebro (S0–1)'), 'Tu cerebro')
  assert.equal(nombreDeFase('🎯 Fase 3 · Tu primer cliente: marketing y ventas (S4–7)'), 'Tu primer cliente')
  const mes = fuente('features/planning/MesClaro.tsx')
  assert.match(mes, /const resto = de\.filter\(x => !\(x\.piedra === 'hito' && esFase\(x\.evento\)\)\)/, 'la fase no entra a barras ni marcas')
  assert.match(mes, /\{w\.s && <b>\{w\.s\}<\/b>\}\{w\.s && w\.fase && ' · '\}\{w\.fase\}/)
  assert.doesNotMatch(mes, /w\.cintas/)
})

test('solo lo que pide actuar lleva color: uno a uno y llamadas clave en bronce, Monterrey en morado, lo demás neutro', () => {
  const at = (e: Parameters<typeof atencionDe>[0], c: Parameters<typeof piedraDe>[1] = 'producir') => atencionDe(e, piedraDe(e, c))
  assert.equal(at(dia('🧭 Uno a uno · al cerrar la etapa · tu cerebro (S1)', '2026-10-30', '2026-11-02')), 'accion')
  assert.equal(at({ title: 'Tú y el socio · 1-1', allDay: false, recurringEventId: null, attendees: [{ self: true }, { self: false }] }), 'accion')
  assert.equal(at({ title: 'Cliente Uno and Cliente Dos', allDay: false, recurringEventId: null, attendees: [{ self: true }, { self: false }] }), 'accion')
  assert.equal(at(dia('🏔️ Oaxaca · premio del monk mode (Centro, Jalatlaco)', '2026-11-24', '2026-11-30'), 'invertir'), 'viaje')
  assert.equal(at(dia('🤝 Reunión SaaS Factory en Monterrey (presencial)', '2026-11-28', '2026-11-29'), 'invertir'), 'viaje')
  for (const e of [dia('🎤 Demo day · Tu cerebro (viernes de S1)', '2026-10-30', '2026-10-31'), dia('🌟 Fase 2 · Supernova, tu oferta (S2–3)', '2026-11-02', '2026-11-16'),
    { title: 'Videollamada de comunidad · Producto y Arquitectura · Daniel', allDay: false, recurringEventId: 'serie', meetUrl: 'https://meet' },
    { title: 'Prospección en Frío con IA · Nivel 7', allDay: false, recurringEventId: null, meetUrl: 'https://meet' },
    { title: 'GYM', allDay: false, recurringEventId: 'gym' }])
    assert.equal(at(e), null, e.title)
  const css = fuente('features/planning/claridad.module.css')
  assert.match(css, /\.mesSemana\[data-actual\] \{ border-color: color-mix\(in srgb, var\(--gold\)/, 'la semana actual, en dorado sutil')
  assert.match(css, /\.mesPuntos i \{[^}]*background: color-mix\(in srgb, var\(--foreground\) 28%, transparent\)/, 'el ritmo, neutro')
})

test('lo de varios días es UNA barra que cruza sus días: en la Semana y en el Recorrido, sin repetirse', () => {
  assert.deepEqual(tramoDeTodoElDia({ start: '2026-10-30', end: '2026-11-02' }), ['2026-10-30', '2026-11-01'])
  assert.equal(esDeVariosDias({ start: '2026-10-30', end: '2026-10-31' }), false)
  assert.equal(esDeVariosDias({ start: '2026-11-24', end: '2026-11-30' }), true)
  const semana = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']
  assert.deepEqual(columnasDeBarra(semana, '2026-10-30', '2026-11-01'), { a: 5, z: 8, antes: false, despues: false })
  assert.deepEqual(columnasDeBarra(semana, '2026-10-21', '2026-11-01'), { a: 1, z: 8, antes: true, despues: false })
  assert.equal(columnasDeBarra(semana, '2026-11-02', '2026-11-15'), null)
  const clara = fuente('features/planning/SemanaClara.tsx')
  assert.match(clara, /if \(!e\.allDay \|\| !visible\(e\) \|\| esDeVariosDias\(e\)\) continue/, 'la columna del día solo lleva lo de un día')
  assert.match(fuente('features/planning/SemanaHoras.tsx'), /<div className=\{h\.barras\}>\{tramos\.map\(b => <button key=\{b\.id\}/)
  // En el Recorrido, el título va solo la primera vez; la semana siguiente lleva el tramo sin repetirlo.
  assert.match(fuente('features/planning/MesClaro.tsx'), /const primera = !vistos\.has\(x\.evento\.id\); vistos\.add\(x\.evento\.id\)/)
})

test('la Semana Perfecta queda más tenue que los eventos reales', () => {
  const css = fuente('features/planning/semana-horas.module.css')
  assert.match(css, /\.perfecta \{[^}]*background: color-mix\(in srgb, var\(--c\) 3%, transparent\); border: 1px dashed color-mix\(in srgb, var\(--c\) 18%, transparent\)/)
})
