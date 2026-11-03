/**
 * Equipo y la fecha viva del calendario (5 oct 2026): el organigrama dice el último movimiento real de cada quien, el
 * panel no repite pestañas («dos Calendario») y el «Hoy» cruza la medianoche («dom 4 oct» el lunes 5).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hace, resumenEquipo, ultimoMovimiento, DUENO_ID, SEGUNDA_ID, type FotoEquipo } from '../../src/features/cabina/vistas/equipo-modelo'
import { esHoy, fechaViva, sinDuplicadas, type Fijada } from '../../src/features/cabina/panel/fijadas'
import { debeAvanzarAHoy } from '../../src/features/planning/hoy-vivo'
import { rutaDe, seccionDe } from '../../src/features/cabina/model'
import { capital, NOMBRE_DUENO, NOMBRE_SEGUNDA } from '../../src/config'

const fijada = (id: string, input: Fijada['input'], extra: Partial<Fijada> = {}): Fijada => ({ id, input, en: 0, ...extra })

describe('equipo', () => {
  const ahora = Date.parse('2026-10-05T14:00:00Z') // 08:00 en CDMX
  it('el último movimiento es lo más reciente entre entrar y conversar', () => {
    assert.deepEqual(ultimoMovimiento({ entro: '2026-10-05T12:49:51Z', conversacion: '2026-10-05T13:41:45Z' }), { en: '2026-10-05T13:41:45Z', que: 'conversacion' })
    assert.deepEqual(ultimoMovimiento({ entro: '2026-10-04T22:21:00Z', conversacion: null }), { en: '2026-10-04T22:21:00Z', que: 'entro' })
    assert.equal(ultimoMovimiento({ entro: null, conversacion: null }), null)
  })
  it('las horas se dicen en Ciudad de México y sin dato no es cero', () => {
    assert.equal(hace('2026-10-05T13:55:00Z', ahora), 'hace 5 min')
    assert.equal(hace('2026-10-05T11:00:00Z', ahora), 'hace 3 h')
    assert.equal(hace('2026-10-04T22:21:00Z', ahora), 'ayer 16:21')
    assert.equal(hace('2026-10-02T18:00:00Z', ahora), '2 oct')
    assert.equal(hace('no-es-fecha', ahora), 'sin dato')
  })
  it('el resumen del hilo nombra a los dos', () => {
    const foto: FotoEquipo = { leidoEn: '', errores: [], agentes: [], personas: [
      { id: DUENO_ID, nombre: 'Dueño', avatar: null, entro: null, conversacion: new Date(Date.now() - 5 * 60_000).toISOString(), sinLeer: 0, ultimoAviso: null, push: true },
      { id: SEGUNDA_ID, nombre: 'Socia', avatar: null, entro: null, conversacion: null, sinLeer: null, ultimoAviso: null, push: null },
    ] }
    // Los nombres del resumen salen de la configuración de la instalación (src/config), no de la foto.
    assert.equal(resumenEquipo(foto), `Equipo · ${capital(NOMBRE_DUENO())} hace 5 min · ${capital(NOMBRE_SEGUNDA())} sin dato`)
  })
  it('tiene su sección en la barra', () => {
    assert.equal(rutaDe({ destino: 'equipo' }), '/equipo')
    assert.equal(seccionDe({ vista: 'equipo' }), '/equipo')
  })
})

describe('pestañas sin duplicar', () => {
  it('objetivos y calendario guardados de antes del alias quedan en una sola pestaña', () => {
    const r = sinDuplicadas([fijada('a', { vista: 'calendario', alcance: 'semana' }), fijada('b', { vista: 'calendario', alcance: 'mes' }, { guardada: true }), fijada('c', { vista: 'finanzas' })])
    assert.deepEqual(r.map(f => f.id), ['a', 'c'])
    assert.equal(r[0].guardada, true)
  })
  it('dos documentos distintos siguen siendo dos', () => {
    assert.equal(sinDuplicadas([fijada('a', { vista: 'documento', ruta: 'x.md' }), fijada('b', { vista: 'documento', ruta: 'y.md' })]).length, 2)
  })
})

describe('la fecha del calendario cruza la medianoche', () => {
  it('con la app abierta: lo que mostraba hoy pasa a mañana; otra fecha elegida se respeta', () => {
    assert.equal(debeAvanzarAHoy('2026-10-04', '2026-10-05', '2026-10-04', '2026-10-05'), true) // día
    assert.equal(debeAvanzarAHoy('2026-10-04', '2026-10-05', '2026-09-28', '2026-10-05'), true) // semana
    assert.equal(debeAvanzarAHoy('2026-10-04', '2026-10-05', '2026-10-12', '2026-10-19'), false) // fue a otra semana
    assert.equal(debeAvanzarAHoy('2026-10-05', '2026-10-05', '2026-10-05', '2026-10-06'), false) // no cambió el día
  })
  it('la pestaña en el periodo de hoy no guarda fecha', () => {
    assert.equal(esHoy('dia', '2026-10-05', '2026-10-05'), true)
    assert.equal(esHoy('semana', '2026-10-05', '2026-10-07'), true)
    assert.equal(esHoy('dia', '2026-10-04', '2026-10-05'), false)
  })
  // 2 nov 2026: la pestaña traía «9 nov» guardado días antes (sin hora) y la Semana abrió en S3. La fecha vale solo en la sesión viva.
  it('la fecha de la pestaña vale dentro de la sesión viva; vieja o sin hora, vuelve a hoy', () => {
    const t = Date.parse('2026-11-02T12:08:00Z'), min = 60_000
    assert.deepEqual(fechaViva({ vista: 'calendario', alcance: 'semana', fecha: '2026-11-09' }, t), { vista: 'calendario', alcance: 'semana' })
    assert.deepEqual(fechaViva({ vista: 'calendario', alcance: 'semana', fecha: '2026-11-09', fechaEn: t - 5 * min }, t), { vista: 'calendario', alcance: 'semana', fecha: '2026-11-09', fechaEn: t - 5 * min })
    assert.deepEqual(fechaViva({ vista: 'calendario', alcance: 'semana', fecha: '2026-11-09', fechaEn: t - 16 * min }, t), { vista: 'calendario', alcance: 'semana' })
    // Un día pasado elegido hace un momento también se respeta (navegar hacia atrás dentro de la sesión).
    assert.deepEqual(fechaViva({ vista: 'calendario', alcance: 'dia', fecha: '2026-10-30', fechaEn: t - min }, t), { vista: 'calendario', alcance: 'dia', fecha: '2026-10-30', fechaEn: t - min })
    // Un reloj que se fue para atrás no deja una fecha eterna.
    assert.deepEqual(fechaViva({ vista: 'calendario', alcance: 'dia', fecha: '2026-11-09', fechaEn: t + 60 * min }, t), { vista: 'calendario', alcance: 'dia' })
    assert.deepEqual(fechaViva({ vista: 'lienzo', paginaId: 'p', fecha: '2026-10-01' }, t), { vista: 'lienzo', paginaId: 'p', fecha: '2026-10-01' })
  })
})

// 2 nov 2026: la app quedó abierta la noche en S3. Un día nuevo sin navegación en la sesión viva vuelve a hoy.
describe('día nuevo con la app abierta', () => {
  it('sin navegar en 15 min vuelve a hoy; recién navegado se respeta', async () => {
    const { nuevoDiaVuelveAHoy, REAPERTURA_MS } = await import('../../src/features/planning/apertura')
    const t = Date.parse('2026-11-02T06:00:00Z')
    assert.equal(nuevoDiaVuelveAHoy(t - 8 * 3600_000, t), true)
    assert.equal(nuevoDiaVuelveAHoy(t - REAPERTURA_MS, t), true)
    assert.equal(nuevoDiaVuelveAHoy(t - 60_000, t), false)
  })
})
