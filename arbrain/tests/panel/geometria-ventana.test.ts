// Geometría de ventana en WKWebView (7 oct 2026): `window.screenX/outerWidth…` no valen allí; el blanco sale de la medida de la app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blancoBajo, rectEnPantalla, type Blanco, type GeomVentana } from '../../src/features/cabina/panel/arrastre-geom'
import { fijarFuenteGeometria, geometriaDeNativa, geometriaVentana, refrescarGeometria } from '../../src/features/cabina/panel/geometria-ventana'

/** Lo que reporta un WKWebView suelto con dos monitores (valores de ejemplo, en puntos lógicos): no cambia al mover la ventana. */
const MENTIRA: GeomVentana = { screenX: 0, screenY: 1080, outerWidth: 0, outerHeight: 0, innerWidth: 1800, innerHeight: 1000 }

/** Una «Ventana 1» de ejemplo en el segundo monitor (contenido en puntos lógicos; el monitor es @2x). */
const VENTANA_1 = { x: 2000 * 2, y: 120 * 2, ancho: 1800 * 2, alto: 1000 * 2, escala: 2 }
const tira = { left: 20, top: 14, right: 900, bottom: 50 }
const blanco = (g: GeomVentana): Blanco => ({ ventana: 'ventana-1', area: rectEnPantalla(g, { left: 0, top: 0, right: g.innerWidth, bottom: g.innerHeight }), tira: rectEnPantalla(g, tira), pestanas: [], foco: 1 })
/** Dónde cae el cursor al soltar sobre la tira de esa ventana, en coordenadas de pantalla (las de los eventos de puntero). */
const SOBRE_LA_TIRA = { x: 2000 + 300, y: 120 + 32 }

test('la geometría de la app (física) se vuelve puntos lógicos con el contenido sin marco', () => {
  assert.deepEqual(geometriaDeNativa(VENTANA_1), { screenX: 2000, screenY: 120, outerWidth: 1800, outerHeight: 1000, innerWidth: 1800, innerHeight: 1000 })
  assert.equal(geometriaDeNativa({ ...VENTANA_1, escala: 0 }), null)
  assert.equal(geometriaDeNativa({ ...VENTANA_1, ancho: 0 }), null)
  assert.equal(geometriaDeNativa({ ...VENTANA_1, x: Number.NaN }), null)
})

test('con la geometría que miente WKWebView, soltar sobre la tira de la otra ventana NO da con su blanco (el bug)', () => {
  assert.equal(blancoBajo(SOBRE_LA_TIRA, [blanco(MENTIRA)]), null)
})

test('con la medida de la app, soltar sobre la tira de la otra ventana da con su blanco y con su tira', () => {
  const g = geometriaDeNativa(VENTANA_1)!
  const d = blancoBajo(SOBRE_LA_TIRA, [blanco(g)])
  assert.equal(d?.ventana, 'ventana-1')
  assert.ok(d?.tira && SOBRE_LA_TIRA.x >= d.tira.left && SOBRE_LA_TIRA.x <= d.tira.right && SOBRE_LA_TIRA.y >= d.tira.top && SOBRE_LA_TIRA.y <= d.tira.bottom, 'el punto cae dentro de la tira')
  // Y un punto sobre la OTRA ventana (la principal, en el primer monitor) no es de este blanco.
  assert.equal(blancoBajo({ x: 900, y: 300 }, [blanco(g)]), null)
})

test('geometriaVentana usa la última medida de la fuente y la conserva si una medida falla', async () => {
  const g = geometriaDeNativa(VENTANA_1)!
  let falla = false
  fijarFuenteGeometria(async () => { if (falla) throw new Error('sin ventana'); return g })
  await refrescarGeometria()
  assert.deepEqual(geometriaVentana(), g)
  falla = true
  await refrescarGeometria()
  assert.deepEqual(geometriaVentana(), g)
  fijarFuenteGeometria(null)
})
