import test from 'node:test'
import assert from 'node:assert/strict'
import type { CronRun, CronSchedule, CronSnapshot } from '../../src/features/planning/types'
import { CATEGORIAS, RUTINAS } from '../../src/features/rutinas/catalogo'
import { LAPIDAS } from '../../src/features/rutinas/lapidas'
// El id del reporte de la segunda persona lleva su clave de la configuración (src/config).
import { JOB_REPORTE_SEGUNDA } from '../../src/shared/constants/reporte-vivo'
import type { Rendimiento } from '../../src/features/rutinas/rinde'
import { costoDe, estadoViva, repartir, horario, huecoEsperado, lectura, leerFilas, nocheYDia, noRinde, siguiente, turno } from '../../src/features/rutinas/vista'

// Taller › Rutinas, la vista viva (10 oct 2026). Lógica pura: horario de 24 h, estado honesto, costo y consumo, de un vistazo.

const AHORA = Date.parse('2026-10-10T10:00:00-06:00')
const job = (over: Partial<CronSchedule> = {}): CronSchedule => ({ id: 'hipocampo', schedule: '5 3 * * *', status: 'active', next_run: null, last_run: (AHORA - 7 * 3_600_000) / 1000, last_result: 'Listo', ...over })
const run = (over: Partial<CronRun> = {}): CronRun => ({ id: 'r', job_id: 'hipocampo', status: 'done', created_at: new Date(AHORA - 7 * 3_600_000).toISOString(), response: null, error: null, ...over })
const rinde = (over: Partial<Rendimiento> = {}): Rendimiento => ({ id: 'hipocampo', status: 'active', schedule: '5 3 * * *', lastRun: null, lastResult: null, corridas: 30, errores: 0, medidas: 30,
  tokens: 106_000, tokensPorCorrida: 3_500, parte: 0.5, esperadas: 30, tono: 'rinde', motivo: 'Entregó las 30 veces.', propuestas: [], ...over })

test('el horario se lee en el reloj de 24 h: diaria, varias al día, semanal, mensual y continua', () => {
  assert.deepEqual(horario('5 3 * * *'), { horas: [{ h: 3, m: 5 }], ritmo: 'diaria' })
  assert.deepEqual(horario('45 8,20 * * *').horas, [{ h: 8, m: 45 }, { h: 20, m: 45 }])
  assert.deepEqual(horario('0 7 * * 0'), { horas: [{ h: 7, m: 0 }], ritmo: 'semanal', dias: 'dom' })
  assert.deepEqual(horario('35 5 1 * *'), { horas: [{ h: 5, m: 35 }], ritmo: 'mensual', dias: 'día 1' })
  assert.deepEqual(horario('*/10 * * * *'), { horas: [], ritmo: 'continua', cadaMin: 10 })
  assert.equal(horario('0 */6 * * *').horas.length, 4)
  assert.equal(horario('basura').ritmo, 'otra')
})

test('noche es de 22 a 05: el chip dice noche, día, ambos o todo el día', () => {
  assert.equal(turno(horario('5 3 * * *')), 'noche')
  assert.equal(turno(horario('30 23 * * *')), 'noche')
  assert.equal(turno(horario('5 5,21 * * *')), 'dia')
  assert.equal(turno(horario('0 0,12 * * *')), 'ambos')
  assert.equal(turno(horario('*/10 * * * *')), 'siempre')
  assert.equal(huecoEsperado(horario('0 0,12 * * *')), 12 * 3_600_000)
  assert.equal(huecoEsperado(horario('5 5,21 * * *')), 16 * 3_600_000)
})

test('estado honesto: aviso solo por el encabezado del reporte, atrasada si dejó de correr, sin dato nunca es bien', () => {
  assert.equal(estadoViva(job(), [run()], AHORA).tono, 'ok')
  assert.equal(estadoViva(job(), [run({ status: 'error', error: 'exit 2' })], AHORA).tono, 'falla')
  assert.equal(estadoViva(job({ last_result: '⚠️ /api/finanzas no responde' }), [run()], AHORA).tono, 'aviso')
  assert.equal(estadoViva(job({ last_result: '🔴 OS Audit ROJO — 4 hallazgos' }), [run()], AHORA).tono, 'aviso')
  assert.equal(estadoViva(job({ last_result: 'Los datos se sincronizaron bien, pero el programa terminó con código 2' }), [run()], AHORA).tono, 'aviso')
  assert.equal(estadoViva(job({ last_result: 'Terminó sin errores (código de salida 0).' }), [run()], AHORA).tono, 'ok')
  // Un informe largo que cita «ROJO» de otra rutina no es un aviso de esta.
  assert.equal(estadoViva(job({ last_result: `**WEEKLY REVIEW** ${'x'.repeat(300)} AUDITORÍA: os-audit ROJO` }), [run()], AHORA).tono, 'ok')
  const viejo = AHORA - 3 * 86_400_000
  assert.equal(estadoViva(job({ last_run: viejo / 1000 }), [], AHORA).tono, 'atrasada')
  assert.equal(estadoViva(job({ schedule: '0 7 * * 0', last_run: viejo / 1000 }), [], AHORA).tono, 'ok', 'una semanal de hace 3 días va a tiempo')
  assert.equal(estadoViva(job({ last_result: null }), [], AHORA).tono, 'sin-dato')
  assert.equal(estadoViva(job({ status: 'paused' }), [run()], AHORA).tono, 'pausada')
})

test('costo: programa sin costo, tokens medidos o sin dato (nunca cero inventado)', () => {
  assert.equal(costoDe(RUTINAS['hipocampo'], rinde()).tipo, 'tokens')
  assert.equal(costoDe(RUTINAS['hipocampo'], undefined).tipo, 'sin-dato')
  const p = costoDe(RUTINAS['polar-sync'], rinde({ id: 'polar-sync', tokens: 28_470 }))
  assert.equal(p.tipo, 'programa')
  assert.match(p.nota ?? '', /de cuando lo envolvía un modelo \(hasta el 10 oct\)/)
  assert.equal(costoDe(undefined, rinde({ tokens: 0 })).tipo, 'programa', 'medido en cero: no gasta tokens')
})

test('no rinde: nadie lo usa (salvo un seguro), quien lo usa está en pausa, o falla más de lo que entrega', () => {
  const pausadas = new Set(['youtube-comments-respond'])
  assert.equal(noRinde(RUTINAS['workspace-backup'], undefined, pausadas), null, 'el respaldo es un seguro')
  assert.equal(noRinde(RUTINAS['youtube-comments-engagement'], undefined, pausadas), 'Nadie usa lo que produce.')
  assert.match(noRinde(RUTINAS['youtube-comments-feedback-loop'], undefined, pausadas) ?? '', /Respuestas a comentarios.*en pausa/)
  assert.equal(noRinde(RUTINAS['hipocampo'], rinde({ tono: 'no-rinde', motivo: 'Falló 5 de 6.' }), pausadas), 'Falló 5 de 6.')
  assert.equal(noRinde(RUTINAS['hipocampo'], rinde(), pausadas), null)
})

test('de un vistazo: la falla manda, luego el atraso, el aviso y el sin dato; a igualdad, el dinero antes que la máquina', () => {
  const snap = (jobs: CronSchedule[], runs: CronRun[] = []): CronSnapshot => ({ jobs, runs, timeZone: 'America/Mexico_City', loadedAt: '', scheduleError: null, historyError: null })
  const ok = leerFilas(snap([job(), job({ id: 'v73-migrated', status: 'paused' })], [run()]), [], AHORA)
  assert.equal(ok.activas.length, 1, 'las lápidas de migración no cuentan'); assert.equal(ok.pausadas.length, 0)
  assert.equal(lectura(ok.activas).palabra, 'Todo en orden')
  const varias = leerFilas(snap([
    job({ id: 'workspace-backup', schedule: '0 0,12 * * *', last_result: '⚠️ disco al 90 %' }),
    job({ id: 'snapshot-finanzas', schedule: '0 8 1 * *', last_result: '⚠️ /api/finanzas no responde' }),
    job({ id: 'tareas-espejo', schedule: '*/10 * * * *', last_result: null, last_run: null }),
  ], [run({ job_id: 'workspace-backup' }), run({ job_id: 'snapshot-finanzas' })]), [], AHORA)
  const l = lectura(varias.activas)
  assert.equal(l.tono, 'atencion'); assert.equal(l.avisos, 2); assert.equal(l.sinDato, 1)
  assert.equal(l.grave?.id, 'snapshot-finanzas', 'el dinero pesa más que la máquina')
  assert.equal(l.palabra, '2 avisaron algo')
  const falla = leerFilas(snap([job({ id: 'workspace-backup' })], [run({ job_id: 'workspace-backup', status: 'error', error: 'exit 1' })]), [], AHORA)
  assert.equal(lectura(falla.activas).palabra, 'Falló Respaldo')
  assert.equal(lectura(falla.activas).tono, 'mal')
  const solo = leerFilas(snap([job({ id: 'x', last_result: null, last_run: null })]), [], AHORA)
  assert.notEqual(lectura(solo.activas).tono, 'bien', 'sin dato nunca es bien')
})

test('lo que sigue y cuántas corren de noche o de día', () => {
  const snap: CronSnapshot = { jobs: [
    job({ id: 'hipocampo', next_run: (AHORA + 17 * 3_600_000) / 1000 }),
    job({ id: 'workspace-backup', schedule: '0 0,12 * * *', next_run: (AHORA + 2 * 3_600_000) / 1000 }),
    job({ id: 'tareas-espejo', schedule: '*/10 * * * *', next_run: (AHORA + 60_000) / 1000 }),
  ], runs: [run(), run({ job_id: 'workspace-backup' }), run({ job_id: 'tareas-espejo' })], timeZone: 'America/Mexico_City', loadedAt: '', scheduleError: null, historyError: null }
  const { activas } = leerFilas(snap, [], AHORA)
  assert.equal(siguiente(activas, AHORA)?.id, 'workspace-backup', 'lo continuo no cuenta como «lo que sigue»')
  assert.deepEqual(nocheYDia(activas), { noche: 2, dia: 1, siempre: 1 })
})

test('el catálogo cubre las 27 rutinas del scheduler tras la poda, cada una con categoría, consumidor y motor', () => {
  const vivas = ['tareas-espejo', 'ritual-noche', JOB_REPORTE_SEGUNDA, 'sfocus-guardia', 'videoteca-sync', 'machinery-sensores', 'os-audit', 'studio-live-sync', 'snapshot-finanzas', 'metabolismo',
    'hipocampo', 'knowledge-compile', 'youtube-comments-feedback-loop', 'morning-briefing', 'workspace-backup', 'intel-youtube-scan', 'polar-income-sync', 'youtube-comments-respond',
    'youtube-comments-post', 'youtube-comments-engagement', 'system-consciousness', 'polar-sync', 'metrics-snapshot', 'youtube-analytics-sync', 'gmail-cleanup', 'business-council', 'monthly-review']
  const cats = new Set(CATEGORIAS.map(c => c.id))
  for (const id of vivas) {
    const r = RUTINAS[id]
    assert.ok(r, `${id} sin entrada`)
    assert.ok(cats.has(r.categoria) && r.para && r.motor && r.produce, `${id} incompleta`)
  }
  for (const c of CATEGORIAS) assert.ok(Object.values(RUTINAS).some(r => r.categoria === c.id), `${c.id} vacía`)
  // Las lápidas no vuelven al catálogo de lo vivo.
  for (const l of LAPIDAS) assert.equal(RUTINAS[l.id], undefined, `${l.id} está enterrada`)
})

test('el reloj reparte las marcas encimadas de un anillo y deja quietas las que ya caben', () => {
  const r = repartir([255, 256.25, 300, 257.5], 6)
  assert.deepEqual(r.map(x => Math.round(x * 100) / 100), [250.25, 256.25, 300, 262.25])
  assert.deepEqual(repartir([10, 40, 90], 6), [10, 40, 90])
  const juntos = repartir([100, 101, 102, 103], 6).sort((a, b) => a - b)
  for (let i = 1; i < juntos.length; i++) assert.ok(juntos[i] - juntos[i - 1] >= 6 - 1e-9)
})
