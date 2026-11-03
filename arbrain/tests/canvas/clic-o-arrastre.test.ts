import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { ClicOArrastre, UMBRAL_PX } from '../../src/features/canvas/state/clic-o-arrastre'

// 1 nov 2026, Daniel: «resuelve esto no puedo abrir lienzos a mano». Secuencia medida con clics nativos en un WKWebView (el
// motor de la app de la Mac) sobre una fila de «¿Qué lienzo?» con el dedo corrido 4 px: pointerdown, mousedown, dragstart,
// pointerup, mouseup… y ningún click. El lienzo no se abría y el menú se quedaba abierto con la fila enfocada.

test('el clic con el dedo corrido 4 px que WebKit volvió arrastre abre el lienzo', () => {
  const g = new ClicOArrastre<string>()
  g.bajar('p:ciber', { x: 956, y: 527 })
  g.arrastrar('p:ciber')
  assert.equal(g.terminar({ x: 960, y: 527 }, false), 'p:ciber')
})

test('en la app el arrastre termina con dragend: se mide con los dragover y un (0, 0) del motor no cuenta', () => {
  const g = new ClicOArrastre<string>()
  g.bajar('p:ciber', { x: 956, y: 527 })
  g.arrastrar('p:ciber')
  g.pasar({ x: 959, y: 529 })
  assert.equal(g.terminar({ x: 0, y: 0 }, false), 'p:ciber')
})

test('arrastrar de verdad a una carpeta no abre nada', () => {
  const lejos = new ClicOArrastre<string>()
  lejos.bajar('p:ciber', { x: 956, y: 527 })
  lejos.arrastrar('p:ciber')
  lejos.pasar({ x: 956, y: 300 })
  assert.equal(lejos.terminar({ x: 958, y: 529 }, false), null, 'se fue lejos y volvió: era un arrastre')

  const soltado = new ClicOArrastre<string>()
  soltado.bajar('p:ciber', { x: 956, y: 527 })
  soltado.arrastrar('p:ciber')
  assert.equal(soltado.terminar({ x: 958, y: 527 }, true), null, 'cayó en un destino: lo atiende su onDrop')

  const justo = new ClicOArrastre<string>()
  justo.bajar('p:ciber', { x: 0.5, y: 0.5 })
  justo.arrastrar('p:ciber')
  assert.equal(justo.terminar({ x: 0.5 + UMBRAL_PX, y: 0.5 }, false), null)
})

test('un clic sin arrastre lo abre onClick: aquí no, para no abrirlo dos veces', () => {
  const g = new ClicOArrastre<string>()
  g.bajar('p:ciber', { x: 956, y: 527 })
  assert.equal(g.terminar({ x: 956, y: 527 }, false), null)
})

test('un gesto se resuelve una sola vez (pointerup y dragend pueden llegar los dos)', () => {
  const g = new ClicOArrastre<string>()
  g.bajar('p:ciber', { x: 10, y: 10 })
  g.arrastrar('p:ciber')
  assert.equal(g.terminar({ x: 12, y: 10 }, false), 'p:ciber')
  assert.equal(g.terminar({ x: 12, y: 10 }, false), null)
})

test('el arrastre que sale de otra fila no es el clic de esta', () => {
  const g = new ClicOArrastre<string>()
  g.bajar('p:ciber', { x: 10, y: 10 })
  g.arrastrar('c:negocio')
  assert.equal(g.terminar({ x: 11, y: 10 }, false), null)
})

test('las filas de lienzo y de carpeta del árbol cierran el gesto en pointerup y en dragend', () => {
  const src = readFileSync(new URL('../../src/features/canvas/ui/lienzos/ArbolLienzos.tsx', import.meta.url), 'utf8')
  for (const tipo of ['p', 'c']) {
    assert.match(src, new RegExp(`onPointerDown=\\{alBajar\\(\`${tipo}:`), `fila ${tipo}: anota dónde bajó el botón`)
    assert.match(src, new RegExp(`alArrastrar\\(\`${tipo}:`), `fila ${tipo}: marca el arrastre en dragstart`)
  }
  assert.match(src, /onPointerUp=\{e => alTerminar\(e, false, \(\) => onAbrir\(x\)\)\}/)
  assert.match(src, /onDragEnd=\{e => \{[^}]*alTerminar\(e, soltado, \(\) => onAbrir\(x\)\)/)
  assert.match(src, /onPointerUp=\{e => alTerminar\(e, false, \(\) => alternar\(n, archivo\)\)\}/)
})
