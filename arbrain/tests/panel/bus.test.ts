import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { coincide, mismaRuta, reportar } from '../../src/features/cabina/panel/bus-puro'
import type { MostrarInput } from '../../src/features/cabina/model'

const v = (o: Partial<MostrarInput> & { vista: MostrarInput['vista'] }) => o as MostrarInput

describe('coincide: soltar cierra la vista sin importar quién la abrió', () => {
  it('la misma vista con otro alcance, fecha o encuadre es la misma pestaña', () => {
    assert.ok(coincide(v({ vista: 'calendario', alcance: 'semana', fecha: '2026-10-05' }), v({ vista: 'calendario', alcance: 'mes' })))
    assert.ok(coincide(v({ vista: 'finanzas' }), v({ vista: 'finanzas', titulo: 'otro' })))
    assert.ok(coincide(v({ vista: 'negocio', seccion: 'oferta' }), v({ vista: 'negocio' })))
  })
  it('otra vista no', () => {
    assert.equal(coincide(v({ vista: 'contenido' }), v({ vista: 'finanzas' })), false)
  })
  it('un documento se distingue por su ruta, relativa o absoluta', () => {
    const tab = v({ vista: 'documento', ruta: '/Users/tu-usuario/Developer/artificial-brain/docs/guardados/plan-octubre-2026/index.html' })
    assert.ok(coincide(tab, v({ vista: 'documento', ruta: 'docs/guardados/plan-octubre-2026/index.html' })))
    assert.equal(coincide(tab, v({ vista: 'documento', ruta: 'docs/guardados/otro/index.html' })), false)
    assert.equal(mismaRuta(undefined, undefined), false)
  })
  it('un lienzo y un agente solo afinan si el pedido los trae', () => {
    assert.ok(coincide(v({ vista: 'lienzo', paginaId: 'a' }), v({ vista: 'lienzo', paginaId: 'a' })))
    assert.equal(coincide(v({ vista: 'lienzo', paginaId: 'a' }), v({ vista: 'lienzo', paginaId: 'b' })), false)
    assert.ok(coincide(v({ vista: 'trabajos', agenteId: 4 }), v({ vista: 'trabajos' })))
    assert.equal(coincide(v({ vista: 'trabajos', agenteId: 4 }), v({ vista: 'trabajos', agenteId: 5 })), false)
  })
})

describe('reportar: el panel como lo ve Daniel', () => {
  it('distingue lo que abrió Levy, lo guardado, la activa y lo que está en su ventana', () => {
    const r = reportar([
      { id: 'mano-finanzas-x', input: v({ vista: 'finanzas' }) },
      { id: 'levy-c1', input: v({ vista: 'documento', ruta: 'a/b.html', titulo: 'Octubre' }), deLevy: true, guardada: true },
    ], 'levy-c1', { 'mano-finanzas-x': 'ventana-2' })
    assert.deepEqual(r[0], { id: 'mano-finanzas-x', vista: 'finanzas', titulo: 'Finanzas', enVentana: true, ventana: 'Ventana 2' })
    assert.deepEqual(r[1], { id: 'levy-c1', vista: 'documento', titulo: 'Octubre', ruta: 'a/b.html', deLevy: true, guardada: true, activa: true })
  })
})
