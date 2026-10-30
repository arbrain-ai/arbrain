import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  capitulosDe, ordenDeLectura, tituloDe, camaraDeCapitulo, bajarEnCapitulo, capituloBajo, vuelo, duracionDeVuelo,
} from '../../src/features/canvas/layout/capitulos'
import { AnimadorCamara } from '../../src/features/canvas/input/navegacion'
import type { CanvasElement, Camera } from '../../src/features/canvas/model/element'

const base = { rotation: 0, zIndex: 1, opacity: 1, locked: false, version: 1, createdAt: 0, updatedAt: 0 }
const marco = (id: string, x: number, y: number, w: number, h: number, title = '') =>
  ({ ...base, id, type: 'frame', role: 'tray', title, x, y, width: w, height: h }) as unknown as CanvasElement
const texto = (id: string, x: number, y: number, size: number, text: string, w = 400) =>
  ({ ...base, id, type: 'text', text, lines: [text], align: 'left', style: { size, family: 'montserrat', weight: 700 },
     x, y, width: w, height: size * 1.2 }) as unknown as CanvasElement
const caja = (id: string, x: number, y: number, w = 200, h = 100) =>
  ({ ...base, id, type: 'shape', shape: 'rect', role: 'card', x, y, width: w, height: h }) as unknown as CanvasElement

const vp = { width: 1200, height: 900, dpr: 1 }
const CHROME = { left: 96, top: 76, bottom: 116, right: 16 }

test('capítulos: sin secciones no hay relato', () => {
  assert.deepEqual(capitulosDe([caja('a', 0, 0), caja('b', 900, 0)]), [])
})

test('capítulos: secciones de primer nivel + la isla suelta del tamaño de una parte, de izquierda a derecha', () => {
  const isla = Array.from({ length: 12 }, (_, i) => caja(`cj:${i}`, 2300 + (i % 4) * 260, 100 + Math.floor(i / 4) * 300))
  const els = [
    marco('m2', 1100, 0, 1000, 1200),
    marco('m1', 0, 0, 1000, 1200),
    marco('sub', 100, 100, 300, 200),          // dentro de m1: apartado, no capítulo
    texto('t1', 40, 40, 150, 'La oferta'),
    texto('k3', 2300, -60, 30, 'ACOMPAÑAMIENTO · ③ EL ACOMPAÑAMIENTO'),
    ...isla,
    caja('nota', 5000, 3000, 40, 20),           // una nota perdida no es capítulo
    marco('m4', 3500, 0, 1000, 1200, 'El plan'),
  ]
  const caps = capitulosDe(els)
  assert.deepEqual(caps.map(c => c.titulo), ['La oferta', 'Sin título', 'El acompañamiento', 'El plan'])
  assert.ok(caps[2].id.startsWith('isla:'))
})

test('orden de lectura: renglones de arriba abajo, cada uno de izquierda a derecha', () => {
  const c = (id: string, x: number, y: number) => ({ id, caja: { x, y, width: 100, height: 100 } })
  assert.deepEqual(ordenDeLectura([c('d', 200, 400), c('b', 200, 10), c('a', 0, 0), c('c', 0, 420)]).map(x => x.id), ['a', 'b', 'c', 'd'])
})

test('título: el número circulado nombra la parte; si no, el texto más grande de la cabeza', () => {
  const zona = { x: 0, y: 0, width: 1000, height: 1000 }
  assert.equal(tituloDe(zona, [texto('a', 0, 10, 30, 'KICKER · ②'), texto('b', 0, 50, 150, 'Cómo se vende')]), 'Cómo se vende')
  assert.equal(tituloDe(zona, [texto('a', 0, -40, 44, 'X · ③ EL ACOMPAÑAMIENTO'), texto('b', 0, 50, 150, 'Cerebro')]), 'El acompañamiento')
  // Un ③ a media frase no es un nombre.
  assert.equal(tituloDe(zona, [texto('a', 0, 10, 30, 'van ②④, precio final'), texto('b', 0, 50, 90, 'Titular')]), 'Titular')
  assert.equal(tituloDe(zona, [], 'Declarado'), 'Declarado')
})

test('cámara de capítulo: un marco alto se lee a lo ancho desde su cabeza; uno bajo se encuadra entero', () => {
  const alto = { x: 0, y: 0, width: 1400, height: 5600 }
  const c = camaraDeCapitulo(alto, vp, CHROME)
  const anchoUtil = vp.width - 40 * 2 - CHROME.left - CHROME.right
  const altoUtil = vp.height - 40 * 2 - CHROME.top - CHROME.bottom
  // A lo ancho, pero sin enseñar menos del 40 % de su alto (en pantalla completa, a lo ancho era solo la cabeza).
  assert.ok(Math.abs(c.zoom - Math.min(anchoUtil / 1400, altoUtil / 5600 * 2.5)) < 1e-9)
  const angosto = camaraDeCapitulo(alto, { width: 520, height: 900, dpr: 1 }, CHROME)
  assert.ok(Math.abs(angosto.zoom - (520 - 80 - CHROME.left - CHROME.right) / 1400) < 1e-9)
  // La cabeza del marco cae justo debajo del chrome de arriba, con su aire.
  const ySup = (alto.y - c.y) * c.zoom + vp.height / 2
  assert.ok(Math.abs(ySup - (CHROME.top + 40)) < 1e-6)
  const bajo = camaraDeCapitulo({ x: 0, y: 0, width: 1000, height: 300 }, vp, CHROME)
  assert.ok(Math.abs(bajo.y - (150 - (CHROME.top - CHROME.bottom) / 2 / bajo.zoom)) < 1e-6)
})

test('↓ ↑ dentro del capítulo no se salen de él', () => {
  const capi = { x: 0, y: 0, width: 1000, height: 4000 }
  let c = camaraDeCapitulo(capi, vp, CHROME)
  const tope = c.y
  c = bajarEnCapitulo(c, capi, vp, -1, CHROME)
  assert.equal(c.y, tope)
  for (let i = 0; i < 40; i++) c = bajarEnCapitulo(c, capi, vp, 1, CHROME)
  const yInf = (capi.y + capi.height - c.y) * c.zoom + vp.height / 2
  assert.ok(Math.abs(yInf - (vp.height - CHROME.bottom - 40)) < 1e-6)
})

test('capítulo bajo la cámara', () => {
  const caps = [{ id: 'a', titulo: 'A', caja: { x: 0, y: 0, width: 100, height: 100 } }, { id: 'b', titulo: 'B', caja: { x: 200, y: 0, width: 100, height: 100 } }]
  assert.equal(capituloBajo({ x: 250, y: 50, zoom: 1 }, caps), 1)
  assert.equal(capituloBajo({ x: 150, y: 50, zoom: 1 }, caps), null)
})

test('vuelo: lejos se aleja a medio camino y llega exacto; cerca es el camino de siempre', () => {
  const a: Camera = { x: 0, y: 0, zoom: 0.8 }, b: Camera = { x: 6000, y: 0, zoom: 0.8 }
  assert.deepEqual(vuelo(a, b, 0, 1200), a)
  assert.deepEqual(vuelo(a, b, 1, 1200), b)
  const medio = vuelo(a, b, 0.5, 1200)
  assert.ok(medio.zoom < 0.3, `a medio camino debía alejarse, va a ${medio.zoom}`)
  assert.ok(Math.abs(medio.x - 3000) < 1e-6)
  const cerca = vuelo(a, { x: 300, y: 0, zoom: 0.8 }, 0.5, 1200)
  assert.equal(cerca.zoom, 0.8)
  assert.ok(duracionDeVuelo(a, b, 1200) <= 1100 && duracionDeVuelo(a, a, 1200) >= 560)
})

test('el animador acepta un trayecto propio', () => {
  let t = 0
  const cuadros: Array<() => void> = []
  let cam: Camera = { x: 0, y: 0, zoom: 1 }
  const anim = new AnimadorCamara(c => { cam = c }, () => cam, {
    ahora: () => t, cuadro: f => { cuadros.push(f); return cuadros.length }, cancelar: () => {},
  })
  anim.ir({ x: 100, y: 0, zoom: 1 }, 100, x => x, (_a, _b, k) => ({ x: 7, y: 7, zoom: k + 1 }))
  t = 50; cuadros.shift()!()
  assert.deepEqual(cam, { x: 7, y: 7, zoom: 1.5 })
  t = 100; cuadros.shift()!()
  assert.deepEqual(cam, { x: 100, y: 0, zoom: 1 })
})
