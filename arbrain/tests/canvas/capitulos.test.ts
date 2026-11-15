import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  capitulosDe, ordenDeLectura, tituloDe, camaraDeCapitulo, bajarEnCapitulo, capituloBajo, vuelo, duracionDeVuelo,
  temasDe, temaDeCapitulo, SIN_TEMA, SIN_TITULO,
} from '../../src/features/canvas/layout/capitulos'
import { AnimadorCamara } from '../../src/features/canvas/input/navegacion'
import type { CanvasElement, Camera } from '../../src/features/canvas/model/element'

const base = { rotation: 0, zIndex: 1, opacity: 1, locked: false, version: 1, createdAt: 0, updatedAt: 0 }
const marco = (id: string, x: number, y: number, w: number, h: number, title = '') =>
  ({ ...base, id, type: 'frame', role: 'tray', title, x, y, width: w, height: h }) as unknown as CanvasElement
const texto = (id: string, x: number, y: number, size: number, text: string, w = 400) =>
  ({ ...base, id, type: 'text', text, lines: [text], align: 'left', style: { size, family: 'montserrat', weight: 700 },
     x, y, width: w, height: size * 1.2 }) as unknown as CanvasElement
const aMano = (e: CanvasElement) => ({ ...e, autor: 'humano' }) as CanvasElement
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

// ── temas (13 nov 2026: «pocos temas, toggles, numerados a la derecha») ──
const conTema = (e: CanvasElement, tema: string) => ({ ...e, tema }) as CanvasElement

test('temas: cada capítulo toma el tema que más se repite en lo que contiene; la sección puede declarar el suyo', () => {
  const isla = Array.from({ length: 8 }, (_, i) => conTema(caja(`of:${i}`, 2300 + (i % 4) * 260, 100 + Math.floor(i / 4) * 300), 'La oferta'))
  const els = [
    marco('m1', 0, 0, 1000, 1200),
    conTema(caja('a', 100, 100), 'Arriba'), conTema(caja('b', 400, 100), 'Arriba'), caja('mano', 700, 100),
    marco('m2', 1100, 0, 1000, 1200),
    conTema(caja('c', 1200, 100), 'Arriba'), conTema(caja('d', 1500, 100), 'La oferta'), conTema(caja('e', 1800, 100), 'Arriba'),
    ...isla,
    conTema(marco('m4', 3500, 0, 1000, 1200), 'El programa'),
    conTema(caja('f', 3600, 100), 'La oferta'),               // la sección declara: manda sobre lo que contiene
  ]
  const caps = capitulosDe(els)
  assert.deepEqual(caps.map(c => c.tema), ['Arriba', 'Arriba', 'La oferta', 'El programa'])
  const temas = temasDe(caps)
  assert.deepEqual(temas.map(t => [t.nombre, t.caps]), [['Arriba', [0, 1]], ['La oferta', [2]], ['El programa', [3]]])
  assert.deepEqual(temas[0].caja, { x: 0, y: 0, width: 2100, height: 1200 })
  assert.equal(temaDeCapitulo(temas, 1), 0)
  assert.equal(temaDeCapitulo(temas, 3), 2)
  assert.equal(temaDeCapitulo(temas, 9), null)
})

test('temas: sin ningún tema declarado (o con uno solo) el índice es la tira de números de antes', () => {
  const cap = (id: string, tema?: string) => ({ id, titulo: id, caja: { x: 0, y: 0, width: 10, height: 10 }, ...(tema ? { tema } : {}) })
  assert.deepEqual(temasDe([cap('a'), cap('b')]), [])
  assert.deepEqual(temasDe([cap('a', 'X'), cap('b', 'X')]), [])
  assert.deepEqual(capitulosDe([marco('m1', 0, 0, 500, 500), marco('m2', 600, 0, 500, 500)]).map(c => 'tema' in c), [false, false])
})

test('temas: lo que no declara tema va al final, en «Otros»; un tema que reaparece junta sus capítulos', () => {
  const cap = (id: string, tema?: string) => ({ id, titulo: id, caja: { x: 0, y: 0, width: 10, height: 10 }, ...(tema ? { tema } : {}) })
  const temas = temasDe([cap('a'), cap('b', 'X'), cap('c', 'Y'), cap('d', 'X')])
  assert.deepEqual(temas.map(t => [t.nombre, t.caps]), [['X', [1, 3]], ['Y', [2]], [SIN_TEMA, [0]]])
})

test('capítulo bajo la cámara: dentro de una isla que envuelve a otro, gana el más chico; el actual se queda si sigue dentro', () => {
  const cap = (id: string, x: number, y: number, w: number, h: number) => ({ id, titulo: id, caja: { x, y, width: w, height: h } })
  const caps = [cap('isla', 0, 0, 1000, 1000), cap('dentro', 600, 100, 200, 200), cap('otro', 2000, 0, 100, 100)]
  assert.equal(capituloBajo({ x: 700, y: 200, zoom: 1 }, caps), 1)
  assert.equal(capituloBajo({ x: 100, y: 800, zoom: 1 }, caps), 0)
  assert.equal(capituloBajo({ x: 700, y: 200, zoom: 1 }, caps, 0), 0)        // ya leía la isla: no salta
  assert.equal(capituloBajo({ x: 2050, y: 50, zoom: 1 }, caps, 1), 2)        // salió del actual: el que lo contiene
})

test('nombres (13 nov): «Escribe aquí» de la mano no nombra ni une capítulos, y el elemento queda intacto', () => {
  // Dos filas de tarjetas sueltas y, entre ellas y justo encima de la segunda, un «Escribe aquít» que Daniel dejó.
  const fila = (p: string, x: number) => Array.from({ length: 6 }, (_, i) => caja(`${p}:${i}`, x + (i % 3) * 260, 300 + Math.floor(i / 3) * 160))
  const borrador = aMano(texto('text-mano', 900, 200, 24, 'Escribe aquít', 420))
  const antes = JSON.stringify(borrador)
  const els = [
    marco('m', 0, -2000, 1000, 1200, 'Arriba'),
    texto('a:t', 0, 260, 60, 'El embudo', 300), ...fila('a', 0),
    texto('b:t', 1200, 260, 60, 'Tus números', 300), ...fila('b', 1200),
    borrador,
  ]
  const caps = capitulosDe(els)
  assert.deepEqual(caps.map(c => c.titulo), ['Arriba', 'El embudo', 'Tus números'])
  assert.ok(!caps.some(c => /escribe aqu/i.test(c.titulo)))
  assert.equal(JSON.stringify(borrador), antes)
})

test('nombres: un número o un símbolo no es nombre; una cita tampoco; manda el rótulo sobre la frase larga', () => {
  const zona = { x: 0, y: 0, width: 1000, height: 1000 }
  assert.equal(tituloDe(zona, [texto('n', 0, 10, 110, 'B'), texto('s', 0, 60, 90, '$'), texto('o', 0, 120, 58, 'Sistemas')]), 'Sistemas')
  assert.equal(tituloDe(zona, [texto('q', 0, 10, 300, '«Automatizar la economía en español»', 900), texto('n', 0, 120, 170, 'Mi para qué')]), 'Mi para qué')
  assert.equal(tituloDe(zona, [
    texto('k', 0, 10, 28, 'LA META'),
    texto('t', 0, 50, 38, 'Antes de cualquier piso nuevo, convertir cada video en contactos tuyos', 900),
  ]), 'La meta')
  // Sin rótulo, la frase larga se corta en una palabra.
  const largo = tituloDe(zona, [texto('t', 0, 50, 38, 'Tu cerebro trabajando para ti todos los días y tus primeros clientes en noventa días.', 900)])
  assert.ok(largo.endsWith('…') && largo.length <= 47, largo)
  assert.equal(tituloDe(zona, [texto('n', 0, 10, 64, '5')]), SIN_TITULO)
})

test('nombres: en una isla manda lo suyo; tarjetas hermanas del mismo tamaño y renglón se nombran juntas', () => {
  const zona = { x: 0, y: 0, width: 3000, height: 800 }
  assert.equal(tituloDe(zona, [
    texto('k', 0, 0, 64, 'IR A'), texto('b', 1400, 400, 92, 'La estrategia'), texto('a', 0, 400, 92, 'La competencia'),
  ], undefined, { miembros: new Set(['k', 'a', 'b']) }), 'La competencia · La estrategia')
})

test('nombres: lo escrito a mano solo nombra si nada más lo hace; el titular del vecino no nombra a una sección', () => {
  const zona = { x: 0, y: 0, width: 1000, height: 1000 }
  assert.equal(tituloDe(zona, [aMano(texto('h', 0, 10, 200, 'Mi garabato')), texto('g', 0, 100, 60, 'La parte')]), 'La parte')
  assert.equal(tituloDe(zona, [aMano(texto('h', 0, 10, 200, 'Mi garabato'))]), 'Mi garabato')
  // «El timonel» (de la isla de arriba) cae en la franja de la sección «la meta»: con `ajenos`, no la nombra.
  const els = [texto('vecino', 0, -120, 96, 'El timonel'), texto('k', 0, 20, 28, 'LA META')]
  assert.equal(tituloDe(zona, els), 'El timonel')
  assert.equal(tituloDe(zona, els, undefined, { ajenos: new Set(['vecino']) }), 'La meta')
})

test('capítulos: una sección chica y sin nombre dentro de una isla es detalle de esa parte, no capítulo', () => {
  const isla = Array.from({ length: 12 }, (_, i) => caja(`cj:${i}`, 2300 + (i % 4) * 260, 100 + Math.floor(i / 4) * 300))
  const els = [
    marco('m1', 0, 0, 1000, 1200), texto('t1', 40, 40, 150, 'La oferta'),
    texto('it', 2300, 40, 120, 'La escalera', 600), ...isla,
    marco('det', 2600, 450, 200, 150), texto('det:n', 2650, 480, 64, '5', 60),     // el recuadro «5» de una escala
    marco('m3', 3500, 0, 1000, 1200, 'El plan'),
  ]
  assert.deepEqual(capitulosDe(els).map(c => c.titulo), ['La oferta', 'La escalera', 'El plan'])
})
