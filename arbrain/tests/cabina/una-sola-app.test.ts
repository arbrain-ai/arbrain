/**
 * «Arbrain, una sola app» (3 oct 2026): expandir lleva a la sección de la barra izquierda, en la misma
 * fecha, página o zona, y la sección Lienzo abre una página real (nunca el banco de pruebas).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { rutaDe, seccionDe } from '../../src/features/cabina/model'
import { paginaPorDefecto } from '../../src/features/canvas/state/pagina-por-defecto'

describe('expandir lleva a la sección', () => {
  it('el lienzo va a /lienzo con página y zona, nunca a /canvas-lab', () => {
    assert.equal(seccionDe({ vista: 'lienzo', paginaId: 'abc', zona: 'ht:hito' }), '/lienzo?p=abc&z=ht%3Ahito')
    assert.equal(rutaDe({ destino: 'sfmap', paginaId: 'abc' }), '/lienzo?p=abc')
    assert.equal(seccionDe({ vista: 'lienzo' }), '/lienzo')
  })
  it('el calendario va a su sección en la misma fecha y alcance', () => {
    assert.equal(seccionDe({ vista: 'calendario', fecha: '2026-10-17', alcance: 'dia' }), '/calendar?date=2026-10-17&mode=day')
    assert.equal(seccionDe({ vista: 'calendario', alcance: 'mes' }), '/calendar?mode=month')
  })
  it('lo que no tiene sección no se expande a otro lado', () => {
    assert.equal(seccionDe({ vista: 'documento' }), null)
    assert.equal(seccionDe({ vista: 'trabajos' }), null)
  })
})

describe('la sección Lienzo elige página', () => {
  const ps = [
    { id: 'vieja', actualizado: '2026-09-01T00:00:00Z' },
    { id: 'reciente', actualizado: '2026-10-03T00:00:00Z' },
  ]
  it('la última usada si sigue viva', () => assert.equal(paginaPorDefecto(ps, 'vieja'), 'vieja'))
  it('si la última ya no existe, la más reciente', () => assert.equal(paginaPorDefecto(ps, 'borrada'), 'reciente'))
  it('sin páginas, ninguna (no el banco de pruebas)', () => assert.equal(paginaPorDefecto([], null), null))
})

describe('Guardar solo en lo que generó el agente', async () => {
  const { guardable } = await import('../../src/features/cabina/panel/fijadas')
  const mano = (vista: string, extra: Record<string, unknown> = {}) => ({ id: `mano-${vista}-x`, input: { vista, ...extra } as never })
  const deLevy = (vista: string, extra: Record<string, unknown> = {}) => ({ id: `tool-${vista}`, input: { vista, ...extra } as never })
  it('las vistas por defecto del «+» no llevan Guardar', () => {
    for (const v of ['calendario', 'objetivos', 'negocio', 'lienzo', 'reporte', 'centro', 'contenido', 'finanzas'])
      assert.equal(guardable(mano(v, v === 'lienzo' ? { paginaId: 'p' } : {})), false, v)
  })
  it('un documento, un lienzo o un reporte que mostró Levy sí', () => {
    assert.equal(guardable(deLevy('documento', { ruta: '/tmp/x.md' })), true)
    assert.equal(guardable(deLevy('lienzo', { paginaId: 'p' })), true)
    assert.equal(guardable(deLevy('reporte')), true)
  })
  it('un calendario o el negocio que mostró Levy siguen siendo vistas por defecto', () => {
    assert.equal(guardable(deLevy('calendario')), false)
    assert.equal(guardable(deLevy('negocio')), false)
  })
  it('lo que ya está en Guardadas conserva su botón', () => assert.equal(guardable({ ...mano('calendario'), guardada: true }), true))
})

describe('Calendario y Objetivos son una sola vista (4 oct 2026)', () => {
  it('«objetivos» es alias de «calendario»: misma pestaña, misma ruta, escala conservada', async () => {
    const { alias, claveDe } = await import('../../src/features/cabina/panel/fijadas')
    const { coincide } = await import('../../src/features/cabina/panel/bus-puro')
    const { rutaDe } = await import('../../src/features/cabina/model')
    assert.deepEqual(alias({ vista: 'objetivos', alcance: 'semana', fecha: '2026-10-05' }), { vista: 'calendario', alcance: 'semana', fecha: '2026-10-05' })
    assert.equal(alias({ vista: 'objetivos' }).alcance, 'mes')
    assert.equal(claveDe({ vista: 'objetivos' }), claveDe({ vista: 'calendario' }))
    assert.equal(coincide({ vista: 'calendario' }, { vista: 'objetivos' }), true)
    assert.equal(rutaDe({ destino: 'objetivos', alcance: 'dia', fecha: '2026-10-05' }), '/calendar?date=2026-10-05&mode=day')
  })
})
