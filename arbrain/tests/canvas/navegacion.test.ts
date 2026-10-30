import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  clasificarRueda, DetectorRueda, deltasEnPx, factorDeRueda, siguienteNivel, camaraEntre,
  AnimadorCamara, accionZoomDeTecla,
} from '../../src/features/canvas/input/navegacion'
import { screenToWorld } from '../../src/features/canvas/render/viewport'
import { PointerMachine, type PointerSample } from '../../src/features/canvas/input/pointers'
import type { Camera } from '../../src/features/canvas/model/element'

test('rueda: muesca de ratón vs trackpad vs pellizco', () => {
  // Chrome/Safari: ratón ±120 contra ±100; trackpad cumple wheelDeltaY = -3·deltaY.
  assert.equal(clasificarRueda({ deltaX: 0, deltaY: 100, deltaMode: 0, wheelDeltaY: -120 }), 'raton')
  assert.equal(clasificarRueda({ deltaX: 0, deltaY: 4, deltaMode: 0, wheelDeltaY: -12 }), 'trackpad')
  assert.equal(clasificarRueda({ deltaX: 0, deltaY: 3, deltaMode: 1 }), 'raton')                 // Firefox, en líneas
  assert.equal(clasificarRueda({ deltaX: 2, deltaY: 7, deltaMode: 0 }), 'trackpad')              // sin wheelDelta
  assert.equal(clasificarRueda({ deltaX: 0, deltaY: 1.37, deltaMode: 0, ctrlKey: true }), 'trackpad') // pellizco
  assert.equal(clasificarRueda({ deltaX: 0, deltaY: 100, deltaMode: 0 }), 'raton')
  // WebKit (la app de escritorio): la muesca llega como ±40 con wheelDelta ±120 — también cumple −3·deltaY.
  assert.equal(clasificarRueda({ deltaX: 0, deltaY: 40, deltaMode: 0, wheelDeltaY: -120 }), 'raton')
  // Dedos con delta fraccionario: wheelDelta redondeado, no es múltiplo de 120.
  assert.equal(clasificarRueda({ deltaX: 0, deltaY: 3.25, deltaMode: 0, wheelDeltaY: -10 }), 'trackpad')
  // El pellizco NUNCA se lee como muesca, aunque llegue entero.
  assert.equal(clasificarRueda({ deltaX: 0, deltaY: -3, deltaMode: 0, wheelDeltaY: 120, ctrlKey: true }), 'trackpad')
  // Ctrl/⌘ de verdad con el ratón sigue siendo ratón.
  assert.equal(clasificarRueda({ deltaX: 0, deltaY: 100, deltaMode: 0, wheelDeltaY: -120, ctrlKey: true }), 'raton')
})

test('animador: sin cuadros (pestaña oculta) la cámara llega igual por la red', () => {
  let cam: Camera = { x: 0, y: 0, zoom: 1 }
  let red: (() => void) | null = null
  const an = new AnimadorCamara(c => { cam = c }, () => cam, {
    ahora: () => 0, cuadro: () => 1, cancelar: () => {},
    despues: f => { red = f; return 1 }, olvidar: () => { red = null },
  })
  an.ir({ x: 50, y: 0, zoom: 2 }, 200)
  assert.equal(cam.zoom, 1)
  red!()
  assert.deepEqual(cam, { x: 50, y: 0, zoom: 2 })
  assert.equal(an.animando(), false)
})

test('rueda: la ráfaga conserva su aparato (la inercia no lo voltea)', () => {
  const d = new DetectorRueda(200)
  assert.equal(d.aparato({ deltaX: 0, deltaY: 6, deltaMode: 0, wheelDeltaY: -18 }, 0), 'trackpad')
  // un evento de inercia que, solo, parecería muesca
  assert.equal(d.aparato({ deltaX: 0, deltaY: 100, deltaMode: 0, wheelDeltaY: -120 }, 50), 'trackpad')
  // tras una pausa se vuelve a decidir
  assert.equal(d.aparato({ deltaX: 0, deltaY: 100, deltaMode: 0, wheelDeltaY: -120 }, 600), 'raton')
})

test('rueda: ⇧ vuelve horizontal el delta vertical; líneas se pasan a px', () => {
  assert.deepEqual(deltasEnPx({ deltaX: 0, deltaY: 100, deltaMode: 0, shiftKey: true }, 800), { dx: 100, dy: 0 })
  assert.deepEqual(deltasEnPx({ deltaX: 0, deltaY: 3, deltaMode: 1 }, 800), { dx: 0, dy: 48 })
  // macOS ya lo convirtió: no se toca
  assert.deepEqual(deltasEnPx({ deltaX: 100, deltaY: 0, deltaMode: 0, shiftKey: true }, 800), { dx: 100, dy: 0 })
})

test('zoom de rueda: una muesca es un escalón parejo; el pellizco, continuo y chico', () => {
  assert.ok(Math.abs(factorDeRueda(-100, 'raton') - 1.15) < 1e-9)
  assert.ok(Math.abs(factorDeRueda(100, 'raton') - 1 / 1.15) < 1e-9)
  assert.ok(Math.abs(factorDeRueda(-4, 'raton') - 1.15) < 1e-9)   // Safari: ±4 por muesca
  const p = factorDeRueda(-2, 'trackpad')
  assert.ok(p > 1 && p < 1.05)
  assert.equal(factorDeRueda(0, 'raton'), 1)
})

test('escalones: de un zoom cualquiera al siguiente nivel redondo', () => {
  assert.equal(siguienteNivel(1, 1), 1.25)
  assert.equal(siguienteNivel(1, -1), 0.75)
  assert.equal(siguienteNivel(0.43, 1), 0.5)
  assert.equal(siguienteNivel(0.43, -1), 0.33)
  assert.equal(siguienteNivel(20, 1), 20)
  assert.equal(siguienteNivel(0.02, -1), 0.02)
})

test('cámara entre dos: extremos exactos y el punto fijo no se mueve', () => {
  const vp = { width: 1000, height: 800, dpr: 1 }
  const a: Camera = { x: 0, y: 0, zoom: 1 }
  const b: Camera = { x: 300, y: -120, zoom: 4 }
  assert.deepEqual(camaraEntre(a, b, 0), a)
  assert.deepEqual(camaraEntre(a, b, 1), b)
  // El punto de pantalla fijo de a→b: debe mapear al mismo punto de mundo en todo el camino.
  const inv = 1 / a.zoom - 1 / b.zoom
  const p = { x: vp.width / 2 + (b.x - a.x) / inv, y: vp.height / 2 + (b.y - a.y) / inv }
  const w0 = screenToWorld(p, a, vp)
  for (const t of [0.25, 0.5, 0.8]) {
    const w = screenToWorld(p, camaraEntre(a, b, t), vp)
    assert.ok(Math.abs(w.x - w0.x) < 1e-6 && Math.abs(w.y - w0.y) < 1e-6)
  }
  // El zoom avanza geométrico: a la mitad, la media geométrica.
  assert.ok(Math.abs(camaraEntre(a, b, 0.5).zoom - 2) < 1e-9)
  // Sin cambio de zoom: paneo recto.
  assert.deepEqual(camaraEntre(a, { x: 100, y: 50, zoom: 1 }, 0.5), { x: 50, y: 25, zoom: 1 })
})

test('animador: encadena sobre el destino, termina exacto y la mano lo cancela', () => {
  let ahora = 0
  const cuadros: Array<() => void> = []
  let cam: Camera = { x: 0, y: 0, zoom: 1 }
  const an = new AnimadorCamara(c => { cam = c }, () => cam, {
    ahora: () => ahora, cuadro: f => cuadros.push(f), cancelar: () => { cuadros.length = 0 },
  })
  an.ir({ x: 0, y: 0, zoom: 2 }, 100)
  assert.equal(an.destino().zoom, 2)
  ahora = 50; cuadros.shift()!()
  assert.ok(cam.zoom > 1 && cam.zoom < 2)
  // una segunda pulsación parte del destino pendiente
  an.ir({ ...an.destino(), zoom: an.destino().zoom * 2 }, 100)
  assert.equal(an.destino().zoom, 4)
  ahora = 1000; cuadros.shift()!()
  assert.deepEqual(cam, { x: 0, y: 0, zoom: 4 })
  assert.equal(an.animando(), false)
  an.ir({ x: 10, y: 0, zoom: 4 }, 100)
  an.cancelar()
  assert.equal(an.animando(), false)
  assert.equal(an.destino(), cam)
})

test('teclado: ⌘ + = − 0 1 2 y sus gemelos con ⇧, por code', () => {
  assert.equal(accionZoomDeTecla({ key: '=', code: 'Equal', metaKey: true }), 'acercar')
  assert.equal(accionZoomDeTecla({ key: '+', code: 'BracketRight', metaKey: true }), 'acercar')  // teclado español
  assert.equal(accionZoomDeTecla({ key: '-', code: 'Minus', ctrlKey: true }), 'alejar')
  assert.equal(accionZoomDeTecla({ key: '0', code: 'Digit0', metaKey: true }), 'cien')
  assert.equal(accionZoomDeTecla({ key: '1', code: 'Digit1', metaKey: true }), 'todo')
  assert.equal(accionZoomDeTecla({ key: '2', code: 'Digit2', metaKey: true }), 'seleccion')
  assert.equal(accionZoomDeTecla({ key: '!', code: 'Digit1', shiftKey: true }), 'todo')
  assert.equal(accionZoomDeTecla({ key: '"', code: 'Digit2', shiftKey: true }), 'seleccion')
  assert.equal(accionZoomDeTecla({ key: '0', code: 'Digit0' }), 'cien')
  assert.equal(accionZoomDeTecla({ key: '1', code: 'Digit1' }), null)            // el 1 suelto no es de cámara
  assert.equal(accionZoomDeTecla({ key: '=', code: 'Equal', metaKey: true, altKey: true }), null)
  // + / − sueltos (Figma): el = inglés, el + español sin Shift, el + inglés con Shift y el numérico.
  assert.equal(accionZoomDeTecla({ key: '=', code: 'Equal' }), 'acercar')
  assert.equal(accionZoomDeTecla({ key: '+', code: 'BracketRight' }), 'acercar')
  assert.equal(accionZoomDeTecla({ key: '+', code: 'Equal', shiftKey: true }), 'acercar')
  assert.equal(accionZoomDeTecla({ key: '+', code: 'NumpadAdd' }), 'acercar')
  assert.equal(accionZoomDeTecla({ key: '-', code: 'Minus' }), 'alejar')
  assert.equal(accionZoomDeTecla({ key: '-', code: 'NumpadSubtract' }), 'alejar')
  assert.equal(accionZoomDeTecla({ key: '-', code: 'Minus', altKey: true }), null)
})

const raton = (x: number, y: number, extra: Partial<PointerSample> = {}): PointerSample =>
  ({ id: 1, type: 'mouse', x, y, pressure: 0.5, buttons: 1, ...extra })

function maquina() {
  const log: string[] = []
  let cam: Camera = { x: 0, y: 0, zoom: 1 }
  const m = new PointerMachine({
    onCamera: c => { cam = c; log.push('camara') },
    hitTest: () => 'el',
    onSelect: (id, meta) => log.push(`select:${id}:${meta ? 'meta' : ''}`),
    onDragElement: () => log.push('drag'),
    onDrawStart: () => log.push('draw'), onDrawPoint: () => {}, onDrawEnd: () => {},
    onTap: () => {},
  }, { getItem: () => null, setItem: () => {} })
  const vp = { width: 800, height: 600, dpr: 1 }
  return { m, log, vp, cam: () => cam }
}

test('botón del medio: panea con cualquier herramienta, aunque haya un elemento debajo', () => {
  const { m, log, vp, cam } = maquina()
  m.down(raton(100, 100, { buttons: 4 }), 'pen', cam(), vp)
  assert.equal(m.currentGesture(), 'pan')
  m.move(raton(140, 100, { buttons: 4 }), cam(), vp)
  assert.equal(cam().x, -40)
  assert.ok(!log.includes('draw'))
})

test('⌘ + arrastrar panea; ⌘ + clic quieto sigue siendo el clic con ⌘ (abrir enlace)', () => {
  const a = maquina()
  a.m.down(raton(100, 100, { meta: true }), 'select', a.cam(), a.vp)
  a.m.move(raton(160, 130, { meta: true }), a.cam(), a.vp)
  assert.equal(a.m.currentGesture(), 'pan')
  assert.deepEqual(a.cam(), { x: -60, y: -30, zoom: 1 })
  a.m.up(raton(160, 130, { meta: true, buttons: 0 }), a.cam(), a.vp)
  assert.ok(!a.log.some(l => l.startsWith('select') || l === 'drag'))
  assert.equal(a.m.currentGesture(), 'none')

  const b = maquina()
  b.m.down(raton(100, 100, { meta: true }), 'select', b.cam(), b.vp)
  b.m.up(raton(101, 100, { meta: true, buttons: 0 }), b.cam(), b.vp)
  assert.deepEqual(b.log, ['select:el:meta'])
})

// ── Táctil (5 oct 2026): un dedo panea, un toque selecciona, el pellizco hace zoom ─────────────
const dedo = (id: number, x: number, y: number): PointerSample => ({ id, type: 'touch', x, y, pressure: 0.5, buttons: 1 })

function maquinaTactil(seleccionados: string[] = [], hit: string | null = 'el') {
  const log: string[] = []
  let cam: Camera = { x: 0, y: 0, zoom: 1 }
  const m = new PointerMachine({
    onCamera: c => { cam = c; log.push('camara') },
    hitTest: () => hit,
    esSeleccionado: id => seleccionados.includes(id),
    onSelect: id => log.push(`select:${id}`),
    onSelectOutside: () => log.push('fuera'),
    onActivate: id => log.push(`activa:${id}`),
    onMarquee: () => log.push('marquee'),
    onDragElement: () => log.push('drag'),
    onDrawStart: () => {}, onDrawPoint: () => {}, onDrawEnd: () => {},
    onTap: () => {},
  }, { getItem: () => null, setItem: () => {} })
  return { m, log, vp: { width: 390, height: 700, dpr: 3 }, cam: () => cam }
}

test('táctil: un dedo que arrastra en el vacío mueve el lienzo (no hay marquesina)', () => {
  const t = maquinaTactil([], null)
  t.m.down(dedo(1, 100, 100), 'select', t.cam(), t.vp)
  t.m.move(dedo(1, 140, 100), t.cam(), t.vp)
  t.m.up(dedo(1, 140, 100), t.cam(), t.vp)
  assert.equal(t.cam().x, -40)
  assert.ok(!t.log.includes('marquee')); assert.ok(!t.log.some(l => l.startsWith('select')))
})

test('táctil: un toque en el vacío deselecciona; un toque sobre algo lo selecciona', () => {
  const v = maquinaTactil([], null)
  v.m.down(dedo(1, 50, 50), 'select', v.cam(), v.vp); v.m.up(dedo(1, 50, 50), v.cam(), v.vp)
  assert.deepEqual(v.log, ['select:null', 'fuera'])
  const e = maquinaTactil()
  e.m.down(dedo(1, 50, 50), 'select', e.cam(), e.vp); e.m.up(dedo(1, 50, 50), e.cam(), e.vp)
  assert.deepEqual(e.log, ['select:el'])
})

test('táctil: arrastrar algo NO seleccionado panea; arrastrar lo ya seleccionado lo mueve', () => {
  const a = maquinaTactil()
  a.m.down(dedo(1, 50, 50), 'select', a.cam(), a.vp); a.m.move(dedo(1, 90, 50), a.cam(), a.vp)
  assert.equal(a.cam().x, -40); assert.ok(!a.log.includes('drag'))
  const b = maquinaTactil(['el'])
  b.m.down(dedo(1, 50, 50), 'select', b.cam(), b.vp); b.m.move(dedo(1, 90, 50), b.cam(), b.vp)
  assert.equal(b.m.currentGesture(), 'drag'); assert.equal(b.cam().x, 0)
})

test('táctil: doble toque sobre algo lo activa; dos dedos hacen pellizco', () => {
  const a = maquinaTactil()
  for (let i = 0; i < 2; i++) { a.m.down(dedo(1, 50, 50), 'select', a.cam(), a.vp); a.m.up(dedo(1, 50, 50), a.cam(), a.vp) }
  assert.deepEqual(a.log, ['select:el', 'select:el', 'activa:el'])
  const p = maquinaTactil([], null)
  p.m.down(dedo(1, 100, 100), 'select', p.cam(), p.vp); p.m.down(dedo(2, 200, 100), 'select', p.cam(), p.vp)
  assert.equal(p.m.currentGesture(), 'pinch')
  p.m.move(dedo(2, 300, 100), p.cam(), p.vp)
  assert.ok(p.cam().zoom > 1)
})

test('el puntero (escritorio) sigue igual: arrastrar en vacío hace marquesina', () => {
  const t = maquinaTactil([], null)
  t.m.down(raton(100, 100), 'select', t.cam(), t.vp)
  assert.equal(t.m.currentGesture(), 'marquee')
})
