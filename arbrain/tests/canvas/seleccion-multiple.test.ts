import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { decidirPuntero, type EntradaPuntero } from '../../src/features/canvas/input/decision-puntero'
import { PointerMachine } from '../../src/features/canvas/input/pointers'

const base: EntradaPuntero = { hit: null, hitSeleccionado: false, cantidad: 0, dentroDelRecuadro: false, ancla: null, shift: false, meta: false }

test('multiple: apretar un elemento ya seleccionado arrastra TODO y no reduce al apretar', () => {
  const d = decidirPuntero({ ...base, hit: 'hijo', hitSeleccionado: true, cantidad: 182, ancla: 'marco' })
  assert.deepEqual(d, { tipo: 'arrastrar-seleccion', objetivo: 'hijo', alSoltarQuieto: { tipo: 'reducir', id: 'hijo' } })
})
test('multiple: aire dentro del recuadro (cuerpo de marco) arrastra y quieto deselecciona', () => {
  const d = decidirPuntero({ ...base, cantidad: 182, dentroDelRecuadro: true, ancla: 'marco' })
  assert.deepEqual(d, { tipo: 'arrastrar-seleccion', objetivo: 'marco', alSoltarQuieto: { tipo: 'deseleccionar' } })
})
test('fuera de la seleccion y del recuadro: vacio (deselecciona / marquesina)', () => {
  assert.equal(decidirPuntero({ ...base, cantidad: 182, dentroDelRecuadro: false, ancla: 'a' }).tipo, 'vacio')
  assert.equal(decidirPuntero({ ...base, cantidad: 1, dentroDelRecuadro: false }).tipo, 'vacio')
})
test('elemento fuera de la seleccion: lo selecciona (reemplaza)', () => {
  assert.deepEqual(decidirPuntero({ ...base, hit: 'x', cantidad: 5 }), { tipo: 'seleccionar', id: 'x' })
})
test('seleccion de uno: apretar su elemento no entra en modo multiple', () => {
  assert.equal(decidirPuntero({ ...base, hit: 'x', hitSeleccionado: true, cantidad: 1 }).tipo, 'seleccionar')
})
test('shift y meta conservan su logica', () => {
  assert.deepEqual(decidirPuntero({ ...base, hit: 'x', hitSeleccionado: true, cantidad: 5, shift: true }), { tipo: 'alternar', id: 'x' })
  assert.equal(decidirPuntero({ ...base, hit: 'x', hitSeleccionado: true, cantidad: 5, meta: true }).tipo, 'seleccionar')
  assert.equal(decidirPuntero({ ...base, cantidad: 5, dentroDelRecuadro: true, ancla: 'a', shift: true }).tipo, 'vacio')
})

// ── la maquina completa, con callbacks simulados ─────────────────────────────
function armar(sel: string[], hit: string | null, dentro = true) {
  const log: string[] = []
  const m = new PointerMachine({
    onCamera: () => {}, onDrawStart: () => {}, onDrawPoint: () => {}, onDrawEnd: () => {}, onTap: () => {},
    hitTest: () => hit,
    esSeleccionado: id => sel.includes(id),
    estadoSeleccion: () => ({ cantidad: sel.length, ancla: sel[0] ?? null, dentroDelRecuadro: dentro }),
    onSelect: id => log.push(`select:${id}`),
    onSelectOutside: () => log.push('outside'),
    onDragElement: (id, d) => log.push(`drag:${id}:${d.x},${d.y}`),
    onDragEnd: (_id, movio) => log.push(`end:${movio}`),
  }, { getItem: () => null, setItem: () => {} })
  const cam = { x: 0, y: 0, zoom: 1 }, vp = { width: 800, height: 600 } as never
  const p = (x: number, y: number) => ({ id: 1, type: 'mouse', x, y, pressure: 0.5, buttons: 1 }) as never
  return { m, log, cam, vp, p }
}

test('maquina: apretar y arrastrar un hijo mueve la seleccion entera y NO la reduce', () => {
  const { m, log, cam, vp, p } = armar(['marco', 'hijo'], 'hijo')
  m.down(p(100, 100), 'select', cam, vp)
  assert.deepEqual(log, [])                       // nada se toca al apretar
  m.move(p(120, 100), cam, vp)
  m.up(p(120, 100), cam, vp)
  assert.deepEqual(log, ['drag:hijo:20,0', 'end:true'])
})
test('maquina: clic quieto (bajo el umbral) sobre un hijo reduce al soltar', () => {
  const { m, log, cam, vp, p } = armar(['marco', 'hijo'], 'hijo')
  m.down(p(100, 100), 'select', cam, vp)
  m.move(p(101, 101), cam, vp)
  m.up(p(101, 101), cam, vp)
  assert.deepEqual(log, ['end:false', 'select:hijo'])
})
test('maquina: clic quieto en el cuerpo de un marco seleccionado sigue deseleccionando', () => {
  const { m, log, cam, vp, p } = armar(['marco', 'hijo'], null)
  m.down(p(100, 100), 'select', cam, vp)
  m.up(p(100, 100), cam, vp)
  assert.deepEqual(log, ['end:false', 'select:null', 'outside'])
})
test('maquina: clic en vacio FUERA del recuadro deselecciona al instante', () => {
  const { m, log, cam, vp, p } = armar(['marco', 'hijo'], null, false)
  m.down(p(900, 900), 'select', cam, vp)
  assert.deepEqual(log, ['select:null', 'outside'])
})

import { reroute, rerouteAll, viajaRigido } from '../../src/features/canvas/model/connect'
test('conector que viaja con sus dos extremos no se re-rutea (mover todo no deforma flechas)', () => {
  const con = { id: 'c', type: 'connector', fromId: 'a', toId: 'b', points: [{ x: 0, y: 0 }, { x: 5, y: 9 }], zIndex: 1 } as never
  const a = { id: 'a', type: 'shape', x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 1 } as never
  const b = { id: 'b', type: 'shape', x: 100, y: 0, width: 10, height: 10, rotation: 0, zIndex: 1 } as never
  const todos = new Set(['a', 'b', 'c'])
  assert.equal(viajaRigido(con, todos), true)
  assert.equal(viajaRigido(con, new Set(['a', 'b'])), false)     // el conector no se movio: hay que rutearlo
  assert.equal(reroute([a, b, con], todos)[2], con)              // misma referencia = intacto
  assert.equal(rerouteAll([a, b, con], todos)[2], con)
})

import { objetivosDeArrastre } from '../../src/features/canvas/model/arrastre'
test('objetivosDeArrastre: la seleccion entera, el grupo, lo bloqueado se queda y la seccion lleva su contenido', () => {
  const el = (id: string, x: number, extra: object = {}) =>
    ({ id, type: 'shape', x, y: 0, width: 10, height: 10, rotation: 0, zIndex: 1, ...extra }) as never
  const sec = { id: 's', type: 'frame', x: 500, y: 0, width: 200, height: 200, rotation: 0, zIndex: -30, title: '', role: 'tray' } as never
  const hijo = el('h', 520, {})
  const els = [el('a', 0, { groupId: 'g' }), el('b', 20, { groupId: 'g' }), el('c', 40, { locked: true }), sec, hijo]
  assert.deepEqual([...objetivosDeArrastre(els, 'a', new Set(['a']))].sort(), ['a', 'b'])            // un clic en el grupo
  assert.deepEqual([...objetivosDeArrastre(els, 'a', new Set(['a']), 'g')], ['a'])                   // grupo abierto: suelto
  assert.deepEqual([...objetivosDeArrastre(els, 'a', new Set(['a', 'c', 's']))].sort(), ['a', 'b', 'h', 's']) // c bloqueado; s lleva a h
  assert.deepEqual([...objetivosDeArrastre(els, 'h', new Set(['a', 'c']))], ['h'])                   // fuera de la seleccion: solo el
})
