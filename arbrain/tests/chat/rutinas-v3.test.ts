import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { RUTINAS_EN_BARRA, RUTINAS_HILOS_VERSION, destinoDeRutina, fuenteInformacion } from '../../src/shared/constants/rutinas-hilos'
import { JOB_REPORTE_SEGUNDA, invocacionVista, vistaDelReporte } from '../../src/shared/constants/reporte-vivo'
import { decidirRutina } from '../../src/features/avisos/policy'
import { corridasDelPeriodo, periodoDe, reporteDelPeriodo } from '../../src/features/planning/reporte-por-fecha'

test('v3: la sección Rutinas sale de la barra y la versión sube a 3', () => {
  assert.equal(RUTINAS_HILOS_VERSION, 3)
  assert.equal(RUTINAS_EN_BARRA, false)
})

test('v3: lo que caía a Reportes va a la favorita; Información, a la bitácora; lo no mapeado no cambia', () => {
  for (const j of ['morning-briefing', 'business-council', 'monthly-review', 'snapshot-finanzas', 'ritual-noche']) assert.equal(destinoDeRutina(j), 'favorita', j)
  for (const j of ['os-audit', 'system-consciousness', 'reporte-diario-html', 'twitter-monitor', 'intel-youtube-scan', 'intel-enrich']) assert.equal(destinoDeRutina(j), 'bitacora', j)
  assert.equal(destinoDeRutina('workspace-backup'), null)
  assert.equal(destinoDeRutina(JOB_REPORTE_SEGUNDA), null, 'el reporte de la segunda persona no se toca')
  // La fuente de Información no es la de un fallo (`rutina:<job>`), que la línea «Máquina» cuenta como falla.
  assert.equal(fuenteInformacion('os-audit'), 'informacion:os-audit')
  // Los de Información nunca suenan: su política es bitácora.
  for (const j of ['os-audit', 'intel-youtube-scan', 'reporte-diario-html']) assert.equal(decidirRutina(j, false).entrega, 'bitacora', j)
})

test('v3: cada reporte lleva su vista viva; el ritual de la noche es charla sin vista', () => {
  assert.deepEqual(vistaDelReporte('morning-briefing', '2026-10-10'), { vista: 'diario', fecha: '2026-10-10' })
  assert.deepEqual(vistaDelReporte('business-council', '2026-10-11'), { vista: 'calendario', alcance: 'semana', fecha: '2026-10-11' })
  assert.deepEqual(vistaDelReporte('monthly-review', '2026-11-01'), { vista: 'calendario', alcance: 'mes', fecha: '2026-10-31' })
  assert.deepEqual(vistaDelReporte('monthly-review', '2026-01-01'), { vista: 'calendario', alcance: 'mes', fecha: '2025-12-31' })
  assert.deepEqual(vistaDelReporte('snapshot-finanzas', '2026-11-01'), { vista: 'finanzas' })
  assert.equal(vistaDelReporte('ritual-noche', '2026-10-10'), null)
  const inv = invocacionVista('cron-business-council-1', { vista: 'calendario', alcance: 'semana', fecha: '2026-10-11' })
  assert.equal(inv.toolCalls[0].toolName, 'mcp__cabina__mostrar')
  assert.deepEqual(JSON.parse(inv.toolInputs[inv.toolCalls[0].toolId]), { vista: 'calendario', alcance: 'semana', fecha: '2026-10-11' })
})

test('periodos del calendario: el día, la semana de lunes a domingo y el mes', () => {
  assert.deepEqual(periodoDe('dia', '2026-10-10'), { desde: '2026-10-10', hasta: '2026-10-11' })
  assert.deepEqual(periodoDe('semana', '2026-10-10'), { desde: '2026-10-05', hasta: '2026-10-12' }, 'sábado')
  assert.deepEqual(periodoDe('semana', '2026-10-11'), { desde: '2026-10-05', hasta: '2026-10-12' }, 'domingo cierra su semana')
  assert.deepEqual(periodoDe('semana', '2026-10-12'), { desde: '2026-10-12', hasta: '2026-10-19' }, 'lunes abre otra')
  assert.deepEqual(periodoDe('mes', '2026-12-15'), { desde: '2026-12-01', hasta: '2027-01-01' })
  assert.deepEqual(corridasDelPeriodo('mes', '2026-09-20'), { desde: '2026-10-01', hasta: '2026-10-04' }, 'el de septiembre corre el 1 de octubre')
})

test('el botón abre el reporte de ESA fecha, también de días pasados y en reentrega; si no hay, null', () => {
  const m = (id: string, created_at: string, originalAt?: string) => ({ id, session_id: 's', created_at, metadata: originalAt ? { originalAt } : {} })
  const mensajes = [
    m('hoy', '2026-10-10T11:30:00Z'),
    m('ayer', '2026-10-09T11:30:00Z'),
    m('reentrega-del-7', '2026-10-08T20:00:00Z', '2026-10-07T11:30:00Z'),
    m('noche-del-6', '2026-10-07T03:00:00Z'), // 21:00 CDMX del 6
  ]
  assert.equal(reporteDelPeriodo(mensajes, 'dia', '2026-10-09')?.id, 'ayer')
  assert.equal(reporteDelPeriodo(mensajes, 'dia', '2026-10-07')?.id, 'reentrega-del-7')
  assert.equal(reporteDelPeriodo(mensajes, 'dia', '2026-10-06')?.id, 'noche-del-6', 'la fecha es la de CDMX, no la de UTC')
  assert.equal(reporteDelPeriodo(mensajes, 'dia', '2026-10-08'), null)
  const semanal = [m('sem-41', '2026-10-11T13:00:00Z'), m('sem-40', '2026-10-04T13:00:00Z')]
  assert.equal(reporteDelPeriodo(semanal, 'semana', '2026-10-07')?.id, 'sem-41')
  assert.equal(reporteDelPeriodo(semanal, 'semana', '2026-09-30')?.id, 'sem-40')
  const mensual = [m('sep', '2026-10-01T11:35:00Z')]
  assert.equal(reporteDelPeriodo(mensual, 'mes', '2026-09-15')?.id, 'sep')
  assert.equal(reporteDelPeriodo(mensual, 'mes', '2026-10-15'), null, 'el de octubre llega el 1 de noviembre')
})
