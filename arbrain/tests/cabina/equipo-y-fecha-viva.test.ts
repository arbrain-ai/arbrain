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
  it('al abrir la app, un periodo terminado vuelve a hoy y uno futuro se respeta', () => {
    assert.deepEqual(fechaViva({ vista: 'calendario', alcance: 'dia', fecha: '2026-10-04' }, '2026-10-05'), { vista: 'calendario', alcance: 'dia' })
    assert.deepEqual(fechaViva({ vista: 'calendario', alcance: 'dia', fecha: '2026-10-17' }, '2026-10-05'), { vista: 'calendario', alcance: 'dia', fecha: '2026-10-17' })
    assert.deepEqual(fechaViva({ vista: 'lienzo', paginaId: 'p', fecha: '2026-10-01' }, '2026-10-05'), { vista: 'lienzo', paginaId: 'p', fecha: '2026-10-01' })
  })
})
