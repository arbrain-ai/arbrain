import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  conAncladas, esVentana, etiquetaDeVentana, fueraDe, indiceEnOrden, limitarIndice, moverA, moverAVentana, moverUno, nombreVentana, normalizarAcomodo, normalizarEnVentana,
  pestanaActiva, podarFuera, porCerrar, PRINCIPAL, rutaDeVentana, tiraDe, todasFuera, todasLasClaves, vaciadas, ventanaDe, ventanaDeParametro, ventanaNueva, ventanasCon, visibles,
} from '../../src/features/cabina/panel/pestanas-fuera'
import { blancoBajo, indiceEnBlanco, sobreTira, type Blanco } from '../../src/features/cabina/panel/arrastre-geom'

test('las pestañas van en el orden de Daniel y el Taller fijo a la derecha (si está abierto)', () => {
  assert.deepEqual(todasLasClaves(['a', 'tareas', 'b']), ['a', 'tareas', 'b', 'taller'])
  assert.deepEqual(todasLasClaves(['a'], false), ['a'])
  assert.deepEqual(todasLasClaves(['taller', 'a']), ['a', 'taller'])
})

test('visibles quita las que viven en su ventana; con todas fuera la columna se cierra sola, sin pestañas no', () => {
  const claves = todasLasClaves(['tareas', 'a'])
  assert.deepEqual(visibles(claves, ['taller']), ['tareas', 'a'])
  assert.equal(todasFuera(claves, ['tareas', 'taller']), false)
  assert.equal(todasFuera(claves, ['tareas', 'a', 'taller']), true)
  assert.equal(todasFuera([], []), false)
  assert.equal(todasFuera([], ['tareas']), false)
})

test('el acomodo: sin recuerdo Tareas primero; lo roto se limpia; lo nuevo de Levy va al final', () => {
  assert.deepEqual(normalizarAcomodo(undefined, ['a', 'b']), { orden: ['tareas', 'a', 'b'], taller: true, ancladas: [] })
  assert.deepEqual(normalizarAcomodo({ orden: ['b', 'x', 3, 'b'], taller: false }, ['a', 'b']), { orden: ['b', 'a'], taller: false, ancladas: [] })
  assert.deepEqual(normalizarAcomodo({ orden: [] }, []), { orden: [], taller: true, ancladas: [] })
})

test('mover pestañas: arrastrar a una posición y ⌥←/⌥→', () => {
  assert.deepEqual(moverA(['tareas', 'cal', 'doc'], 'cal', 0), ['cal', 'tareas', 'doc'])
  assert.deepEqual(moverA(['tareas', 'cal', 'doc'], 'tareas', 2), ['cal', 'doc', 'tareas'])
  assert.deepEqual(moverA(['tareas', 'cal'], 'tareas', 99), ['cal', 'tareas'])
  assert.deepEqual(moverA(['tareas'], 'nada', 0), ['tareas'])
  assert.deepEqual(moverUno(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c'])
  assert.deepEqual(moverUno(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c'])
  assert.deepEqual(moverUno(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c'])
})

test('se cierra solo lo de Levy sin guardar, de otra conversación y que no está a la vista', () => {
  const f = [
    { id: 'l1', deLevy: true, conversacion: 'c1' },
    { id: 'l2', deLevy: true, conversacion: 'c1', guardada: true },
    { id: 'l3', deLevy: true, conversacion: 'c2' },
    { id: 'l4', deLevy: true, conversacion: 'c1' },
    { id: 'm1', conversacion: 'c1' },
  ]
  assert.deepEqual(porCerrar(f, 'c2', ['l4']), ['l1'])
  assert.deepEqual(porCerrar(f, null, []), [])
})

test('pestanaActiva: la activa si sigue en la columna; si se fue, la primera que queda; si no queda ninguna, null', () => {
  assert.equal(pestanaActiva('taller', ['tareas', 'taller']), 'taller')
  assert.equal(pestanaActiva('taller', ['tareas', 'a']), 'tareas')
  assert.equal(pestanaActiva('a', []), null)
})

test('podarFuera tira las pestañas que ya no están abiertas', () => {
  assert.deepEqual(podarFuera(['tareas', 'a', 'b', 'taller'], ['tareas', 'a', 'taller']), ['tareas', 'a', 'taller'])
  assert.deepEqual(podarFuera(['tareas', 'a'], ['a']), ['a'])
  assert.deepEqual(podarFuera(['b'], []), [])
})

test('el índice del arrastre (entre visibles) se traduce al orden guardado (con las que viven fuera)', () => {
  // «b» vive en su ventana: la tira muestra tareas, cal, doc.
  const orden = ['tareas', 'b', 'cal', 'doc']
  assert.equal(indiceEnOrden(orden, ['tareas', 'cal', 'doc'], 'cal', 0), 0)
  assert.equal(moverA(orden, 'cal', indiceEnOrden(orden, ['tareas', 'cal', 'doc'], 'cal', 0)).join(), 'cal,tareas,b,doc')
  assert.equal(moverA(orden, 'tareas', indiceEnOrden(orden, ['tareas', 'cal', 'doc'], 'tareas', 2)).join(), 'b,cal,doc,tareas')
  assert.equal(indiceEnOrden(['a'], ['a'], 'a', 0), 0)
})

// ── Ventanas con su propia tira (5 oct 2026, modelo de Chrome) ──

test('cada ventana pinta su tramo del orden global; lo que no figura vive en el panel principal', () => {
  const claves = ['cal', 'tareas', 'doc', 'fin', 'taller'], en = { doc: 'ventana-1', taller: 'ventana-1', fin: 'ventana-2' }
  assert.deepEqual(tiraDe(claves, en, PRINCIPAL), ['cal', 'tareas'])
  assert.deepEqual(tiraDe(claves, en, 'ventana-1'), ['doc', 'taller'])
  assert.deepEqual(tiraDe(claves, en, 'ventana-2'), ['fin'])
  assert.equal(ventanaDe(en, 'cal'), PRINCIPAL)
  assert.deepEqual(fueraDe(en).sort(), ['doc', 'fin', 'taller'])
  assert.deepEqual(ventanasCon({ a: 'ventana-10', b: 'ventana-2', c: 'ventana-2' }), ['ventana-2', 'ventana-10'])
})

test('la ventana nueva toma el primer número libre (reusa el lugar que la app recuerda de esa etiqueta)', () => {
  assert.equal(ventanaNueva({}), 'ventana-1')
  assert.equal(ventanaNueva({ a: 'ventana-1', b: 'ventana-3' }), 'ventana-2')
  assert.equal(ventanaNueva({ a: 'ventana-1' }, ['ventana-2']), 'ventana-3')
})

test('etiquetas y rutas de ventana dentro de la lista blanca de Rust (vista-[a-z0-9-], /panel?)', () => {
  assert.equal(etiquetaDeVentana('ventana-2'), 'vista-ventana-2')
  assert.match(etiquetaDeVentana('ventana-999'), /^vista-[a-z0-9-]+$/)
  assert.equal(rutaDeVentana('ventana-2'), '/panel?ventana=2')
  assert.equal(ventanaDeParametro('2'), 'ventana-2')
  for (const malo of [null, '', '0', 'x', '1000', '../1', '-1']) assert.equal(ventanaDeParametro(malo), null)
  assert.ok(esVentana('ventana-1') && !esVentana('principal') && !esVentana('ventana-0'))
  assert.equal(nombreVentana('ventana-3'), 'Ventana 3')
  assert.equal(nombreVentana(PRINCIPAL), 'Panel principal')
})

test('lo recordado de las ventanas se limpia: solo pestañas abiertas y ventanas válidas', () => {
  assert.deepEqual(normalizarEnVentana({ a: 'ventana-1', b: 'principal', c: 'ventana-x', zz: 'ventana-2', d: 3 }, ['a', 'b', 'c', 'd']), { a: 'ventana-1' })
  assert.deepEqual(normalizarEnVentana(['a'], ['a']), {})
  assert.deepEqual(normalizarEnVentana(null, ['a']), {})
})

test('una ventana que se queda sin pestañas se cierra (vaciadas)', () => {
  assert.deepEqual(vaciadas({ a: 'ventana-1', b: 'ventana-2' }, { b: 'ventana-2' }), ['ventana-1'])
  assert.deepEqual(vaciadas({ a: 'ventana-1', b: 'ventana-1' }, { b: 'ventana-1' }), [])
  assert.deepEqual(vaciadas({ a: 'ventana-1' }, { a: 'ventana-2' }), ['ventana-1'])
})

test('mover a otra ventana inserta en el lugar de su tira; sin lugar, al final; de vuelta al panel, también', () => {
  const st = { orden: ['tareas', 'cal', 'doc', 'fin'], enVentana: { doc: 'ventana-1', fin: 'ventana-1' }, ancladas: [] as string[], taller: true }
  // «cal» entre doc y fin en la ventana 1
  let r = moverAVentana(st, 'cal', 'ventana-1', 1)
  assert.deepEqual(tiraDe(r.orden, r.enVentana, 'ventana-1'), ['doc', 'cal', 'fin'])
  assert.deepEqual(tiraDe(r.orden, r.enVentana, PRINCIPAL), ['tareas'])
  // sin índice: al final
  r = moverAVentana(st, 'tareas', 'ventana-1')
  assert.deepEqual(tiraDe(r.orden, r.enVentana, 'ventana-1'), ['doc', 'fin', 'tareas'])
  // de regreso al panel, primera
  r = moverAVentana(st, 'fin', PRINCIPAL, 0)
  assert.deepEqual(tiraDe(r.orden, r.enVentana, PRINCIPAL), ['fin', 'tareas', 'cal'])
  assert.deepEqual(r.enVentana, { doc: 'ventana-1' })
  // a una ventana nueva (vacía)
  r = moverAVentana(st, 'cal', 'ventana-2', 0)
  assert.deepEqual(tiraDe(r.orden, r.enVentana, 'ventana-2'), ['cal'])
  // el Taller no está en el orden: solo cambia de ventana
  r = moverAVentana(st, 'taller', 'ventana-1', 0)
  assert.deepEqual(r.orden, st.orden)
  assert.equal(r.enVentana.taller, 'ventana-1')
})

test('ancladas: primero en su tira; solo se acomodan entre ancladas y las sueltas no las brincan', () => {
  assert.deepEqual(conAncladas(['a', 'cal', 'b', 'doc'], ['doc', 'cal']), ['cal', 'doc', 'a', 'b'])
  assert.equal(limitarIndice(3, true, 1, 4), 1)
  assert.equal(limitarIndice(0, false, 2, 4), 2)
  assert.equal(limitarIndice(9, false, 2, 4), 4)
  const st = { orden: ['cal', 'tareas', 'doc'], enVentana: {}, ancladas: ['cal'], taller: true }
  // una suelta pedida en el lugar 0 queda tras la anclada
  const r = moverAVentana(st, 'doc', PRINCIPAL, 0)
  assert.deepEqual(r.orden, ['cal', 'doc', 'tareas'])
  // una anclada que se va a otra ventana sigue anclada y primera allá
  const r2 = moverAVentana({ ...st, enVentana: { doc: 'ventana-1' } }, 'cal', 'ventana-1', 1)
  assert.deepEqual(tiraDe(r2.orden, r2.enVentana, 'ventana-1'), ['cal', 'doc'])
})

test('el acomodo recuerda las ancladas (y tira las que ya no existen)', () => {
  const a = normalizarAcomodo({ orden: ['tareas', 'x', 'cal'], ancladas: ['cal', 'zzz', 'cal'] }, ['x', 'cal'])
  assert.deepEqual(a.ancladas, ['cal'])
  assert.deepEqual(a.orden, ['cal', 'tareas', 'x'])
  assert.deepEqual(normalizarAcomodo(null, ['x']).ancladas, [])
})

test('soltar en otra ventana: gana la de foco más reciente; sobre la tira, el lugar del cursor; en el resto, al final', () => {
  const tira = { left: 1000, right: 1600, top: 40, bottom: 70 }
  const d1: Blanco = { ventana: 'ventana-1', area: { left: 1000, right: 1800, top: 0, bottom: 900 }, tira, foco: 5,
    pestanas: [{ clave: 'a', centro: 1050 }, { clave: 'b', centro: 1150 }, { clave: 'c', centro: 1250 }] }
  const d2: Blanco = { ventana: PRINCIPAL, area: { left: 0, right: 1500, top: 0, bottom: 900 }, tira: null, foco: 9, pestanas: [] }
  assert.equal(blancoBajo({ x: 1700, y: 50 }, [d1, d2])?.ventana, 'ventana-1')
  assert.equal(blancoBajo({ x: 1200, y: 50 }, [d1, d2])?.ventana, PRINCIPAL)
  assert.equal(blancoBajo({ x: 3000, y: 50 }, [d1, d2]), null)
  assert.ok(sobreTira({ x: 1100, y: 80 }, d1))
  assert.equal(indiceEnBlanco({ x: 1100, y: 55 }, d1, 'z'), 1)
  assert.equal(indiceEnBlanco({ x: 1100, y: 500 }, d1, 'z'), 3)
  // la arrastrada no se cuenta a sí misma
  assert.equal(indiceEnBlanco({ x: 1300, y: 55 }, d1, 'a'), 2)
})
