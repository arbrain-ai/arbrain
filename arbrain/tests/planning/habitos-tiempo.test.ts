import test from 'node:test'
import assert from 'node:assert/strict'
import { diasDeTabla, lineaPeriodo, rotuloDia, diasDelMes, estadoTiempo, llenado, llenadosHoy, mejorRacha, primeraMarca, rachaLlenado, rangoTiempo, registrado, rotulosDeMes, semanasDelMapa, ventanaTiempo } from '../../src/features/planning/habitos-tiempo'
import { calendarAction } from '../../src/features/planning/shortcuts'
import { diaDelPeriodo } from '../../src/features/planning/periodo-premio'
import { NOMBRE_PRIVADO, nombreEnPantalla } from '../../src/lib/sistema/atomicos'
import { readFileSync } from 'node:fs'
import { INSTALACION } from '../../src/config/instalacion'
import { accionCtrl } from '../../src/shared/navigation/atajos-ctrl'

const TEMPORADA = { desde: '2026-10-26', hasta: '2026-11-24' }

test('el conteo del monk mode empieza hoy, dom 25 oct', () => {
  assert.equal(INSTALACION.temporadaHabitos?.arranque, '2026-10-25')
  assert.deepEqual(ventanaTiempo('2026-10-25', { desde: '2026-10-25', hasta: '2026-11-24' }, null).desde, '2026-10-25')
})

// 25 oct 2026, 08:54: «son 3… 0/3 debería ver al abrir el tercer hábito» (los tres cuentan). 28 oct 2026, 07:15:
// «por nada del mundo quiero que mis alumnos vean» el nombre del tercero: el privado se ve neutro POR DEFECTO, en todas partes.
// 07:59: «Privado» con candado despierta curiosidad; se llama «Hábito 3», sin candado.
test('REGLA: el tercer hábito cuenta en el x/3 y se ve «Hábito 3» por defecto, sin candado, con o sin pantalla compartida', () => {
  const p = { senal: '', dosMinutos: '', privado: true }
  assert.equal(NOMBRE_PRIVADO, 'Hábito 3')
  for (const r of ['features/sistema/NombreHabito.tsx', 'features/planning/HabitosHoy.tsx']) {
    const src = readFileSync(new URL(`../../src/${r}`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /\bLock\b|title=\{?['"`]Privado/, `${r}: sin candado ni tooltip «Privado»`)
  }
  assert.equal(nombreEnPantalla('Real', p), NOMBRE_PRIVADO, 'en su app también, sin revelar')
  assert.equal(nombreEnPantalla('Real', p, true), NOMBRE_PRIVADO)
  assert.equal(nombreEnPantalla('Rutina', { senal: '', dosMinutos: '' }), 'Rutina', 'lo no privado se ve siempre')
  for (const f of ['FranjaPlan.tsx', 'HabitosHoy.tsx', 'HabitosTiempo.tsx']) {
    const src = readFileSync(new URL(`../../src/features/planning/${f}`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /seMuestra|filasDeTiempo|presentacion\.activo && x\.p\?\.privado|privado && presentacion\.activo/, f)
    assert.match(src, /nombreEnPantalla\(/, f)
  }
})

// Ninguna superficie pinta el nombre crudo de un hábito: o pasa por `NombreHabito`/`habitDisplayName`, o por `nombreEnPantalla`.
test('REGLA: ninguna superficie de hábitos pinta {h.nombre} crudo', () => {
  const rutas = ['features/todotask/Habits.tsx', 'features/sistema/components/HabitChecklist.tsx', 'features/sistema/components/SistemaPage.tsx',
    'features/goals/GoalsWorkspace.tsx', 'features/goals/HoyTelefono.tsx', 'features/planning/HabitosDia.tsx', 'features/planning/HabitosTiempo.tsx']
  for (const r of rutas) {
    const src = readFileSync(new URL(`../../src/${r}`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, />\{h\.nombre\}<|<span>\{label\}<\/span>|<span>\{displayName\}<\/span>/, r)
  }
})

test('sin historia previa, el mapa va del lunes 26 oct a Monterrey (24 nov)', () => {
  const v = ventanaTiempo('2026-10-25', TEMPORADA, null)
  assert.deepEqual(v, { desde: '2026-10-26', hasta: '2026-11-24' })
  const semanas = semanasDelMapa(v)
  assert.equal(semanas.length, 5)
  assert.equal(semanas[0][0], '2026-10-26', 'la primera columna empieza en lunes')
  assert.equal(semanas[4][1], '2026-11-24')
  assert.equal(semanas[4][2], null, 'después del cierre no hay celda')
})

test('con historia de antes, el mapa empieza en la primera marca', () => {
  const records = [{ fecha: '2026-10-23', habito_clave: 'dormir', hecho: true }, { fecha: '2026-10-01', habito_clave: 'oculto', hecho: true },
    { fecha: '2026-10-20', habito_clave: 'dormir', hecho: null }]
  const primera = primeraMarca(records, ['dormir'])
  assert.equal(primera, '2026-10-23', 'ni los hábitos ocultos ni las marcas borradas mueven el inicio')
  assert.equal(ventanaTiempo('2026-10-25', TEMPORADA, primera).desde, '2026-10-23')
  assert.ok(ventanaTiempo('2026-10-25', TEMPORADA, '2020-01-01').desde >= rangoTiempo('2026-10-25').from, 'nunca antes de lo que se lee')
})

test('la mejor racha es la corrida más larga hasta hoy', () => {
  const m: Record<string, boolean> = { '2026-10-26': true, '2026-10-27': true, '2026-10-28': true, '2026-10-30': true, '2026-10-31': true }
  assert.equal(mejorRacha(f => m[f], '2026-10-26', '2026-10-31'), 3)
  assert.equal(mejorRacha(() => undefined, '2026-10-26', '2026-10-31'), 0)
})

test('el rótulo del mes va solo en la primera semana que lo trae', () => {
  const r = rotulosDeMes(semanasDelMapa({ desde: '2026-10-26', hasta: '2026-11-24' }))
  assert.deepEqual(r, ['oct', 'nov', null, null, null])
})

test('H y Ctrl+H llevan a la vista Hábitos', () => {
  assert.deepEqual(calendarAction({ key: 'h', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }), { type: 'mode', mode: 'habits' })
  assert.deepEqual(accionCtrl({ code: 'KeyH', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }), { tipo: 'habitos' })
})


test('llenar, no cumplir: fallado cuenta como registrado; solo el día sin registro falla', () => {
  assert.equal(registrado(true), true); assert.equal(registrado(false), true)
  assert.equal(registrado(null), false); assert.equal(registrado(undefined), false)
  const m: Record<string, boolean | null> = { '2026-11-01|a': true, '2026-11-01|b': false, '2026-11-01|c': true, '2026-11-02|a': false, '2026-11-02|c': true }
  const marca = (f: string, c: string) => m[`${f}|${c}`]
  const l = llenado(diasDelMes('2026-11-02'), ['a', 'b', 'c'], marca, '2026-11-02', '2026-10-26')!
  assert.deepEqual({ llenas: l.llenas, posibles: l.posibles, sinRegistro: l.sinRegistro, diasLlenos: l.diasLlenos, dias: l.dias }, { llenas: 5, posibles: 6, sinRegistro: 1, diasLlenos: 1, dias: 2 })
  assert.equal(llenadosHoy(['a', 'b', 'c'], marca, '2026-11-02'), 2, 'el oculto cuenta como número')
  assert.equal(llenado([], ['a'], marca, '2026-11-02', null), null, 'sin días vividos no hay número')
})

test('la racha de llenado cuenta registros seguidos, cumplidos o no', () => {
  const m: Record<string, boolean | null> = { '2026-10-26': true, '2026-10-27': false, '2026-10-28': true }
  assert.equal(rachaLlenado(f => m[f], '2026-10-28', '2026-10-26'), 3)
  assert.equal(rachaLlenado(f => m[f], '2026-10-29', '2026-10-26'), 3, 'hoy sin llenar no la rompe todavía')
  assert.equal(diasDelMes('2026-11-03').join(), '2026-11-01,2026-11-02,2026-11-03')
})

test('antes del arranque, lo registrado se pinta y lo vacío no es falla', () => {
  assert.equal(estadoTiempo(true, '2026-10-20', '2026-10-28', '2026-10-26'), 'hecho')
  assert.equal(estadoTiempo(false, '2026-10-20', '2026-10-28', '2026-10-26'), 'fallado')
  assert.equal(estadoTiempo(undefined, '2026-10-20', '2026-10-28', '2026-10-26'), 'fuera')
  assert.equal(estadoTiempo(undefined, '2026-10-27', '2026-10-28', '2026-10-26'), 'vacio', 'desde el arranque, sin registro = la única falla')
  assert.equal(estadoTiempo(undefined, '2026-10-29', '2026-10-28', '2026-10-26'), 'futuro')
})

// 25 oct 2026, 10:00: «literal una tabla mensual con los hábitos como columna y los días como fila… uno solo que englobe todo».
test('la tabla: filas = el periodo completo del monk mode (25 oct → 24 nov) cruzando el mes; sin periodo, el mes de hoy', () => {
  const dias = diasDeTabla('2026-10-25', { desde: '2026-10-25', hasta: '2026-11-24' })
  assert.equal(dias.length, 31)
  assert.equal(dias[0], '2026-10-25')
  assert.equal(dias.at(-1), '2026-11-24')
  const mes = diasDeTabla('2026-02-10', null)
  assert.deepEqual([mes.length, mes[0], mes.at(-1)], [28, '2026-02-01', '2026-02-28'])
  assert.equal(diasDeTabla('2026-12-31', undefined).length, 31)
})

test('el rótulo del día se lee en teléfono: «L 26»; el mes solo en la primera fila y el día 1', () => {
  assert.deepEqual(rotuloDia('2026-10-26', false), { dia: 'L 26', mes: null })
  assert.deepEqual(rotuloDia('2026-10-25', true), { dia: 'D 25', mes: 'oct' })
  assert.deepEqual(rotuloDia('2026-11-01', false), { dia: 'D 1', mes: 'nov' })
})

test('la línea del periodo, sin ruido: «Monk mode · Día 1 de 30 · 25 oct → Monterrey»', () => {
  const p = { desde: '2026-10-25', hasta: '2026-11-24', premio: 'Monterrey' }
  assert.equal(lineaPeriodo('Monk mode', p, diaDelPeriodo('2026-10-25', p)), 'Monk mode · Día 1 de 30 · 25 oct → Monterrey')
  assert.equal(lineaPeriodo(null, p, diaDelPeriodo('2026-10-23', p)), 'Empieza en 2 días · 25 oct → Monterrey')
})

test('REGLA: la vista H es UN componente (una tabla): sin franja de temporada, mapas por hábito ni métricas sueltas', () => {
  const src = readFileSync(new URL('../../src/features/planning/HabitosTiempo.tsx', import.meta.url), 'utf8')
  assert.match(src, /<table/)
  assert.match(src, /No negociables/)
  assert.doesNotMatch(src, /ContadorPeriodo|mejorRacha|rachaLlenado|semanasDelMapa|<article/)
})

test('el trayecto: lo vivido dice cuánto se llenó, hoy brilla hasta llenarse y el futuro es camino', async () => {
  const { trayecto, resumenHabito } = await import('../../src/features/planning/habitos-tiempo')
  const dias = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']
  const m: Record<string, boolean | null> = { '2026-10-25|a': true, '2026-10-25|b': false, '2026-10-26|a': true, '2026-10-28|a': true }
  const marca = (f: string, c: string) => m[`${f}|${c}`]
  const t = trayecto(dias, ['a', 'b'], marca, '2026-10-28', '2026-10-25')
  assert.deepEqual(t.map(x => x.tramo), ['lleno', 'parcial', 'vacio', 'hoy', 'futuro'])
  const r = resumenHabito('a', dias, marca, '2026-10-28', '2026-10-25')
  assert.equal(r.racha, 1, 'el 27 sin cumplir corta la racha')
  assert.equal(r.mejor, 2)
  assert.equal(r.cumplidos, 3)
  assert.equal(r.pct, 75)
})
