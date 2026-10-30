import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { camaraPara, resolverZona, zoomEn } from '../../src/features/cabina/vistas/zona'
import { moverPeriodo } from '../../src/features/cabina/model'
import { firmarAutoria } from '../../src/features/canvas/model/autoria'
import { fusionar } from '../../src/features/canvas/state/nube'
import { claveDe } from '../../src/features/cabina/panel/fijadas'
import type { CanvasElement } from '../../src/features/canvas/model/element'

const el = (id: string, x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}) =>
  ({ id, type: 'text', x, y, width, height, rotation: 0, zIndex: 1, opacity: 1, locked: false, version: 1, createdAt: 1, updatedAt: 1, text: '', lines: [], style: {}, align: 'left', ...extra }) as unknown as CanvasElement

const lienzo = [
  el('tb:whole', 0, 0, 5000, 5000, { type: 'frame', title: '' }),
  el('tb:dec:a', 100, 4000, 800, 60, { text: 'DECISIONES ABIERTAS' }),
  el('tb:dec:b', 100, 4100, 2000, 300, { text: '¿Promesa y mecanismo?' }),
  el('c:tb:x', 0, 0, 0, 0, { type: 'connector' }),
  el('suelta', 9000, 9000, 100, 100, { text: 'Lo Firmado' }),
]

test('zona: rectángulo, id exacto y prefijo (sin conectores sin caja)', () => {
  assert.deepEqual(resolverZona(lienzo, '10, 20, 300, 400')?.rect, { x: 10, y: 20, width: 300, height: 400 })
  assert.equal(resolverZona(lienzo, 'tb:whole')?.como, 'id')
  const p = resolverZona(lienzo, 'tb:dec')!
  assert.equal(p.como, 'prefijo')
  assert.deepEqual(p.rect, { x: 100, y: 4000, width: 2000, height: 400 })
  assert.equal(resolverZona(lienzo, 'c:tb'), null)
})

test('zona por frase: sin acentos ni mayúsculas, y la zona legible más chica que la contiene', () => {
  const z = resolverZona(lienzo, 'promesa y mecanismo')!
  assert.equal(z.como, 'frase')
  assert.deepEqual(z.rect, { x: 100, y: 4000, width: 2000, height: 400 }) // el prefijo tb:dec, no el marco de 5000
  const suelta = resolverZona(lienzo, 'lo firmado')!
  assert.ok(suelta.rect.x < 9000 && suelta.rect.width > 100)  // sin zona alrededor: margen
  assert.equal(resolverZona(lienzo, 'no existe en el lienzo'), null)
})

test('cámara: la zona al ancho y anclada arriba; «todo» centrado y entero', () => {
  const c = camaraPara({ x: 0, y: 1000, width: 1000, height: 200 }, 500, 800, { margen: 0 })
  assert.equal(c.zoom, 0.5)
  assert.equal(c.y - 800 / 2 / c.zoom, 1000) // el borde de arriba del visor = arriba de la zona
  const t = camaraPara({ x: 0, y: 0, width: 1000, height: 4000 }, 500, 800, { margen: 0, todo: true })
  assert.equal(t.zoom, 0.2)
  const z = zoomEn({ x: 0, y: 0, zoom: 1 }, 2, { x: 100, y: 100 }, { width: 200, height: 200 })
  assert.deepEqual(z, { x: 0, y: 0, zoom: 2 }) // el punto bajo el cursor no se mueve
})

test('calendario: anterior/siguiente por día, semana y mes civil', () => {
  assert.equal(moverPeriodo('dia', '2026-10-31', 1), '2026-11-01')
  assert.equal(moverPeriodo('semana', '2026-10-02', -1), '2026-09-25')
  assert.equal(moverPeriodo('mes', '2026-01-31', 1), '2026-02-01')
})

test('autoría: firma solo lo nuevo de la mano; respeta lo existente, lo compilado y lo generado', () => {
  const nuevos = [el('a', 0, 0, 1, 1), el('b', 0, 0, 1, 1), el('c', 0, 0, 1, 1, { gen: true }), el('d', 0, 0, 1, 1, { origin: { regionId: 'r' } })]
  const f = firmarAutoria(nuevos, new Set(['b']))
  assert.deepEqual(f.map(e => e.autor ?? null), ['humano', null, null, null])
  const sinNada = [el('b', 0, 0, 1, 1)]
  assert.equal(firmarAutoria(sinNada, new Set(['b'])), sinNada) // sin cambios = el mismo arreglo
})

test('fusión: lo idéntico que llega de otro aparato devuelve EL MISMO arreglo (no rebota guardados)', () => {
  const local = [el('a', 0, 0, 1, 1), el('b', 0, 0, 1, 1)]
  const remoto = local.map(e => ({ ...e }))
  assert.equal(fusionar(local, remoto, 0), local)
  const cambiado = [{ ...local[0], x: 5, updatedAt: 2 } as CanvasElement, local[1]]
  const r = fusionar(local, cambiado, 0)
  assert.notEqual(r, local); assert.equal(r[0].x, 5)
})

test('Calendario es una pestaña; Lienzo, una por lienzo; las demás vistas, por parámetros', () => {
  assert.equal(claveDe({ vista: 'calendario', alcance: 'mes' }), claveDe({ vista: 'calendario', alcance: 'dia', fecha: '2026-10-17' }))
  // 14 oct 2026: el «+» con otro lienzo abre OTRA pestaña; la primera se conserva. Otra zona del mismo lienzo reusa la suya.
  assert.notEqual(claveDe({ vista: 'lienzo', paginaId: 'a' }), claveDe({ vista: 'lienzo', paginaId: 'b' }))
  assert.equal(claveDe({ vista: 'lienzo', paginaId: 'a', zona: 'x' }), claveDe({ vista: 'lienzo', paginaId: 'a', titulo: 'Otro título' }))
  assert.notEqual(claveDe({ vista: 'negocio', seccion: 'oferta' }), claveDe({ vista: 'negocio', seccion: 'avatar' }))
})
