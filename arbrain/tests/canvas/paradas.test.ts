/**
 * Las PARADAS INTERIORES del recorrido (17 nov 2026, layout/paradas.ts y piezas/recorrido.ts). Lo que pidió Levy:
 * orden, anclaje al mover el elemento, compatibilidad (una página sin paradas se comporta idéntica) y la ida y vuelta
 * (el campo sobrevive a guardar, leer, editar a mano y fusionar).
 */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { capitulosDe } from '../../src/features/canvas/layout/capitulos'
import { paradasDe, leerParadas, cajaDeParada, camaraDeParada } from '../../src/features/canvas/layout/paradas'
import { moverRecorrido } from '../../src/features/canvas/piezas/recorrido'
import { trasladar } from '../../src/features/canvas/model/from-compiled'
import { mergeElements } from '../../src/features/canvas/state/autosave'
import { fusionar } from '../../src/features/canvas/state/nube'
import type { CanvasElement } from '../../src/features/canvas/model/element'

const base = { rotation: 0, zIndex: 1, opacity: 1, locked: false, version: 1, createdAt: 0, updatedAt: 0 }
const marco = (id: string, x: number, y: number, w: number, h: number, title = '') =>
  ({ ...base, id, type: 'frame', role: 'tray', title, x, y, width: w, height: h }) as unknown as CanvasElement
const caja = (id: string, x: number, y: number, w = 200, h = 100, extra: Record<string, unknown> = {}) =>
  ({ ...base, id, type: 'shape', shape: 'rect', role: 'card', x, y, width: w, height: h, ...extra }) as unknown as CanvasElement

/** Dos capítulos: una columna alta (Oferta) con dos piezas y una caja; y otro capítulo a la derecha. */
function pagina(conParadas: boolean): CanvasElement[] {
  const p = (v: unknown) => (conParadas ? { paradas: v } : {})
  return [
    marco('o', 0, 0, 2000, 6000, 'Oferta'),
    caja('o:escalera', 100, 900, 1800, 600, p([{ orden: 2, zona: { x: 0.5, y: 0, w: 0.5, h: 1 }, titulo: 'Escalera, el pago' },
                                               { orden: 1, zona: { x: 0, y: 0, w: 0.5, h: 1 }, titulo: 'Escalera, el regalo' }])),
    caja('o:bonos', 100, 2000, 1800, 800, p([{ orden: 3, titulo: 'Bonos' }])),
    caja('o:nota', 100, 3200, 900, 300),
    marco('v', 2400, 0, 2000, 6000, 'Vehículo'),
    caja('v:viaje', 2500, 900, 1800, 1000, p([{ orden: 1 }])),
  ]
}

test('paradas: se leen saneadas (orden finito, zona en fracciones, título corto); lo inválido se descarta', () => {
  assert.deepEqual(leerParadas(undefined), [])
  assert.deepEqual(leerParadas('x'), [])
  assert.deepEqual(leerParadas([{ orden: 'uno' }, null, { orden: Infinity }]), [])
  assert.deepEqual(leerParadas([{ orden: 2, zona: { x: -1, y: 0.5, w: 2, h: 0.25 }, titulo: '  Bonos  ' }]),
    [{ orden: 2, zona: { x: 0, y: 0.5, w: 1, h: 0.25 }, titulo: 'Bonos' }])
  // una zona sin ancho no es zona: la parada queda como el elemento entero
  assert.deepEqual(leerParadas([{ orden: 1, zona: { x: 0, y: 0, w: 0, h: 1 } }]), [{ orden: 1 }])
  // una zona que se sale del elemento se recorta a él
  assert.deepEqual(leerParadas([{ orden: 1, zona: { x: 0.75, y: 0, w: 0.5, h: 1 } }]), [{ orden: 1, zona: { x: 0.75, y: 0, w: 0.25, h: 1 } }])
})

test('paradas: cada capítulo con las suyas, en su orden; la zona es una fracción de la caja del elemento', () => {
  const els = pagina(true)
  const caps = capitulosDe(els)
  assert.deepEqual(caps.map(c => c.titulo), ['Oferta', 'Vehículo'])
  const ps = paradasDe(els, caps)
  assert.deepEqual(ps[0].map(p => p.titulo ?? p.elId), ['Escalera, el regalo', 'Escalera, el pago', 'Bonos'])
  assert.deepEqual(ps[0][0].caja, { x: 100, y: 900, width: 900, height: 600 })
  assert.deepEqual(ps[0][1].caja, { x: 1000, y: 900, width: 900, height: 600 })
  assert.deepEqual(ps[1].map(p => p.elId), ['v:viaje'])
  // la cámara de una parada la encuadra entera dentro del área útil
  const vp = { width: 800, height: 600, dpr: 1 }
  // en el recorrido la parada no reserva la barra de herramientas ni el índice: 16 a los lados, 76 arriba, 64 abajo, 12 de aire
  const cam = camaraDeParada(ps[0][0].caja, vp)
  const util = { w: vp.width - 16 - 16 - 24, h: vp.height - 76 - 64 - 24 }
  assert.ok(900 * cam.zoom <= util.w + 0.5 && 600 * cam.zoom <= util.h + 0.5)
  assert.ok(Math.abs(900 * cam.zoom - util.w) < 1 || Math.abs(600 * cam.zoom - util.h) < 1, 'la zona llena el área útil por un lado')
})

test('paradas: ancladas al elemento, lo siguen si la mano lo mueve o lo agranda', () => {
  const els = pagina(true)
  const caps = capitulosDe(els)
  const antes = paradasDe(els, caps)[0][0].caja
  // la mano mueve la escalera 300 a la derecha y 200 abajo (el mismo trasladar que usa el lienzo)
  const movidos = els.map(e => (e.id === 'o:escalera' ? trasladar([e], { x: 300, y: 200 })[0] : e))
  const despues = paradasDe(movidos, capitulosDe(movidos))[0][0].caja
  assert.deepEqual(despues, { ...antes, x: antes.x + 300, y: antes.y + 200 })
  // y la agranda al doble de ancho: la zona (la mitad izquierda) crece con ella
  const grande = els.map(e => (e.id === 'o:escalera' ? { ...e, width: 3600 } as CanvasElement : e))
  const cg = cajaDeParada(grande.find(e => e.id === 'o:escalera')!, { orden: 1, zona: { x: 0, y: 0, w: 0.5, h: 1 } })
  assert.deepEqual(cg, { x: 100, y: 900, width: 1800, height: 600 })
  // si la borra, su parada se va con ella
  const sin = els.filter(e => e.id !== 'o:bonos')
  assert.deepEqual(paradasDe(sin, capitulosDe(sin))[0].map(p => p.titulo), ['Escalera, el regalo', 'Escalera, el pago'])
})

test('paradas · compatibilidad: sin paradas, capítulos y recorrido idénticos a antes', () => {
  const con = pagina(true), sin = pagina(false)
  // el campo no cambia lo que es capítulo, su nombre, su caja ni su orden
  assert.deepEqual(capitulosDe(con), capitulosDe(sin))
  const caps = capitulosDe(sin)
  assert.deepEqual(paradasDe(sin, caps), [[], []])
  assert.deepEqual(paradasDe([], []), [])
  // el recorrido sin paradas (o con listas vacías) da los mismos movimientos, con o sin los argumentos nuevos
  const pz = [{ elId: 'o:escalera', caja: { x: 100, y: 900, width: 1800, height: 600 }, pasos: 2 }]
  const pasoDe = () => 0
  for (const [dir, actual] of [[1, null], [1, 0], [1, 1], [-1, 0], [-1, 1]] as Array<[1 | -1, number | null]>) {
    const viejo = moverRecorrido(dir, actual, caps, pz, pasoDe)
    assert.deepEqual(moverRecorrido(dir, actual, caps, pz, pasoDe, [[], []], null), viejo)
    assert.deepEqual(moverRecorrido(dir, actual, caps, pz, pasoDe, undefined, 3), viejo)
  }
})

test('paradas · recorrido: entrada, sus paradas en orden, luego el siguiente capítulo; ← aterriza en la última', () => {
  const els = pagina(true)
  const caps = capitulosDe(els)
  const ps = paradasDe(els, caps)
  const pasoDe = () => 0
  const m = (dir: 1 | -1, actual: number | null, k: number | null) => moverRecorrido(dir, actual, caps, [], pasoDe, ps, k)
  assert.deepEqual(m(1, null, null), { tipo: 'capitulo', i: 0, pasos: [] })
  assert.deepEqual(m(1, 0, null), { tipo: 'parada', i: 0, k: 0 })
  assert.deepEqual(m(1, 0, 0), { tipo: 'parada', i: 0, k: 1 })
  assert.deepEqual(m(1, 0, 1), { tipo: 'parada', i: 0, k: 2 })
  assert.deepEqual(m(1, 0, 2), { tipo: 'capitulo', i: 1, pasos: [] })
  assert.deepEqual(m(1, 1, null), { tipo: 'parada', i: 1, k: 0 })
  assert.deepEqual(m(1, 1, 0), { tipo: 'nada' })
  // atrás: de la primera parada a la entrada; de la entrada al capítulo anterior, en su ÚLTIMA parada
  assert.deepEqual(m(-1, 1, 0), { tipo: 'parada', i: 1, k: -1 })
  assert.deepEqual(m(-1, 1, null), { tipo: 'capitulo', i: 0, pasos: [], parada: 2 })
  assert.deepEqual(m(-1, 0, 1), { tipo: 'parada', i: 0, k: 0 })
  // una parada fuera de rango cuenta como la entrada
  assert.deepEqual(m(1, 0, 9), { tipo: 'parada', i: 0, k: 0 })
})

test('paradas · recorrido: los pasos de una pieza se revelan en SU parada; los demás, en la entrada', () => {
  const els = pagina(true)
  const caps = capitulosDe(els)
  const ps = paradasDe(els, caps)
  const piezas = [
    { elId: 'o:bonos', caja: { x: 100, y: 2000, width: 1800, height: 800 }, pasos: 1 },
    { elId: 'o:nota', caja: { x: 100, y: 3200, width: 900, height: 300 }, pasos: 1 },
  ]
  const pasos = new Map<string, number>()
  const pasoDe = (id: string) => pasos.get(id) ?? 0
  const m = (dir: 1 | -1, k: number | null) => moverRecorrido(dir, 0, caps, piezas, pasoDe, ps, k)
  // en la entrada se revela la nota (no tiene parada), no los bonos
  assert.deepEqual(m(1, null), { tipo: 'paso', elId: 'o:nota', paso: 1 })
  pasos.set('o:nota', 1)
  assert.deepEqual(m(1, null), { tipo: 'parada', i: 0, k: 0 })
  assert.deepEqual(m(1, 1), { tipo: 'parada', i: 0, k: 2 })
  // en la parada de los bonos, primero su paso
  assert.deepEqual(m(1, 2), { tipo: 'paso', elId: 'o:bonos', paso: 1 })
  pasos.set('o:bonos', 1)
  assert.deepEqual(m(1, 2), { tipo: 'capitulo', i: 1, pasos: [] })
  assert.deepEqual(m(-1, 2), { tipo: 'paso', elId: 'o:bonos', paso: 0 })
  // volver al capítulo anterior lo deja completo y en su última parada
  const atras = moverRecorrido(-1, 1, caps, piezas, pasoDe, ps, null)
  assert.deepEqual(atras, { tipo: 'capitulo', i: 0, pasos: [{ elId: 'o:bonos', paso: 1 }, { elId: 'o:nota', paso: 1 }], parada: 2 })
})

test('paradas · ida y vuelta: sobreviven a guardar y leer, a editar a mano y a fusionar con la nube', () => {
  const els = pagina(true)
  // guardar y leer: el documento viaja como JSON (api/canvas/pages guarda `elements` tal cual)
  const doc = JSON.parse(JSON.stringify({ schemaVersion: 4, elements: els, camera: { x: 0, y: 0, zoom: 1 } }))
  const leidos = doc.elements as CanvasElement[]
  assert.deepEqual(leidos.find(e => e.id === 'o:escalera')!.paradas, els.find(e => e.id === 'o:escalera')!.paradas)
  assert.deepEqual(paradasDe(leidos, capitulosDe(leidos)), paradasDe(els, capitulosDe(els)))
  // editar a mano: mover, cambiar el color y el texto conservan el campo (el lienzo edita con `{ ...el, … }`)
  const esc = leidos.find(e => e.id === 'o:escalera')!
  const editado = { ...trasladar([esc], { x: 10, y: 0 })[0], color: { fill: '#fff', explicit: true }, updatedAt: 5 } as CanvasElement
  assert.deepEqual(editado.paradas, esc.paradas)
  // fusionar con la nube (los dos caminos del lienzo) conserva el que gana, con su campo
  const local = leidos.map(e => (e.id === 'o:escalera' ? editado : e))
  const remoto = JSON.parse(JSON.stringify(els)) as CanvasElement[]
  assert.deepEqual(mergeElements(local, remoto).find(e => e.id === 'o:escalera')!.paradas, esc.paradas)
  assert.deepEqual(fusionar(local, remoto, 1).find(e => e.id === 'o:escalera')!.paradas, esc.paradas)
  // una app que no conoce el campo (lo lee como dato opaco) no se rompe: el resto del elemento es el mismo
  const { paradas: _ignorado, ...sinCampo } = esc as CanvasElement & { paradas?: unknown }
  void _ignorado
  assert.deepEqual(capitulosDe(leidos.map(e => (e.id === 'o:escalera' ? sinCampo as CanvasElement : e))), capitulosDe(leidos))
})
