// Reporte de la mañana como vista viva (5 oct 2026): lo que persiste el webhook se vuelve una vista montable.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { invocacionesDe, parseMostrar, resumen, seccionDe } from '../../src/features/cabina/model'
import { SEGUNDA_REPORTES_SESION, JOB_REPORTE_SEGUNDA, REPORTES_VIVOS, elegirFavorita, fechaDelReporte, invocacionDiario } from '../../src/shared/constants/reporte-vivo'
import { DUENO, NOMBRE_SEGUNDA, SEGUNDA } from '../../src/config'

// Las claves y nombres de las personas salen de la configuración de la instalación (src/config): la prueba vale
// igual con la de Daniel que con la plantilla del alumno.

test('la invocación del webhook es una vista diario del día del reporte', () => {
  const extra = invocacionDiario('cron-morning-briefing-1791212400000', DUENO(), '2026-10-05')
  const [inv] = invocacionesDe(extra)
  assert.equal(inv.verbo, 'mostrar')
  assert.deepEqual(inv.input && { vista: inv.input.vista, fecha: inv.input.fecha, quien: inv.input.quien }, { vista: 'diario', fecha: '2026-10-05', quien: undefined })
  assert.equal(inv.status, 'done')
})

test('el de la segunda persona viaja con su clave en quien y su hilo tiene id fijo', () => {
  const [inv] = invocacionesDe(invocacionDiario(`cron-${JOB_REPORTE_SEGUNDA}-1`, SEGUNDA(), '2026-10-05'))
  assert.equal(inv.verbo === 'mostrar' && inv.input?.quien, SEGUNDA())
  assert.match(SEGUNDA_REPORTES_SESION, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  assert.equal(JOB_REPORTE_SEGUNDA, `reporte-${SEGUNDA()}`)
  assert.deepEqual(REPORTES_VIVOS, { 'morning-briefing': DUENO(), [JOB_REPORTE_SEGUNDA]: SEGUNDA() })
})

test('quien solo vale en diario y con valores conocidos', () => {
  assert.equal(parseMostrar(JSON.stringify({ vista: 'calendario', quien: SEGUNDA() }))?.quien, undefined)
  assert.equal(parseMostrar(JSON.stringify({ vista: 'diario', quien: 'desconocido' }))?.quien, undefined)
})

test('la fecha del reporte es el día civil de CDMX, no el de UTC', () => {
  assert.equal(fechaDelReporte('2026-10-06T03:30:00Z'), '2026-10-05') // 21:30 del 5 en CDMX
  assert.equal(fechaDelReporte('2026-10-05T15:00:00Z'), '2026-10-05')
})

test('diario no tiene sección: se amplía encima; su resumen nombra a quién', () => {
  assert.equal(seccionDe({ vista: 'diario' }), null)
  assert.match(resumen({ vista: 'diario', fecha: '2026-10-05' }), /^Reporte diario · lunes,? 5 de octubre/)
  assert.ok(resumen({ vista: 'diario', fecha: '2026-10-05', quien: SEGUNDA() }).startsWith(`Reporte de ${NOMBRE_SEGUNDA()}`))
})

// 10 oct 2026: el reporte de Daniel entra a su conversación favorita, la primera de «Fijadas».
const fijada = (id: string, title: string, pinned_position: number | null, extra: { archived_at?: string; updated_at?: string; is_favorite?: boolean } = {}) =>
  ({ id, title, pinned_position, is_favorite: extra.is_favorite ?? true, archived_at: extra.archived_at ?? null, updated_at: extra.updated_at ?? '2026-10-10T13:00:00Z' })

test('la favorita es la primera de Fijadas, sin el hilo de reportes ni archivadas', () => {
  const sesiones = [
    fijada('auto', 'Automatizaciones', 0),
    fijada('vieja', 'Conversación de ejemplo archivada', 0, { archived_at: '2026-10-07T13:07:36Z' }),
    fijada('otra', 'investiga a cloudroom', 1),
    fijada('plan', 'Planeación mensual', 0, { updated_at: '2026-10-01T00:00:00Z' }),
    fijada('suelta', 'Sin fijar', null, { is_favorite: false }),
    fijada('rutina', 'Rutinas · Información', null),
  ]
  assert.equal(elegirFavorita(sesiones)?.id, 'plan')
})

test('una recién fijada (sin posición) va arriba, como en la barra; sin fijadas no hay favorita', () => {
  assert.equal(elegirFavorita([fijada('plan', 'Planeación mensual', 0), fijada('nueva', 'Nueva', null)])?.id, 'nueva')
  assert.equal(elegirFavorita([fijada('auto', 'Automatizaciones', 0)]), null)
})

test('v3: la favorita es la de la estrella aunque no sea la primera de Fijadas; con dos estrellas viejas gana la más activa', () => {
  const sesiones = [
    fijada('nueva', 'Nueva', null),
    { ...fijada('semana', 'Semana 42 · plan', 3), is_starred: true },
    { ...fijada('arch', 'Archivada', 0, { archived_at: '2026-10-07T13:07:36Z' }), is_starred: true },
    { ...fijada('auto', 'Automatizaciones', 0), is_starred: true },
  ]
  assert.equal(elegirFavorita(sesiones)?.id, 'semana')
  const dos = [{ ...fijada('a', 'A', 0, { updated_at: '2026-10-01T00:00:00Z' }), is_starred: true }, { ...fijada('b', 'B', 1, { updated_at: '2026-10-09T00:00:00Z' }), is_starred: true }]
  assert.equal(elegirFavorita(dos)?.id, 'b')
})
