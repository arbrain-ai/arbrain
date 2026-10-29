import { test } from 'node:test'
import assert from 'node:assert/strict'
import { geometriaEnHost } from '../../src/features/chat/lib/resaltado'

test('la caja cae sobre la palabra en px de layout del hilo, con scroll y con el zoom de la app', () => {
  const host = { left: 100, top: 50, escala: 1, scrollLeft: 0, scrollTop: 0, clientLeft: 0, clientTop: 0 }
  assert.deepEqual(geometriaEnHost({ left: 130, top: 80, width: 40, height: 20 }, host), { x: 30, y: 30, w: 40, h: 20 })
  // Hilo scrolleado 500 px: la caja vive en el contenido, así que suma el scroll (y luego viaja con él sin código).
  assert.deepEqual(geometriaEnHost({ left: 130, top: 80, width: 40, height: 20 }, { ...host, scrollTop: 500 }), { x: 30, y: 530, w: 40, h: 20 })
  // Zoom 1.4 (WKWebView): 1.4 px de rect por px de layout.
  const z = geometriaEnHost({ left: 100 + 42, top: 50 + 28, width: 56, height: 28 }, { ...host, escala: 1.4, scrollTop: 10 })
  assert.ok(Math.abs(z.x - 30) < 1e-9 && Math.abs(z.y - 30) < 1e-9 && Math.abs(z.w - 40) < 1e-9 && Math.abs(z.h - 20) < 1e-9)
})
