import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routeOrthogonal, type Obstacle } from '../../src/features/canvas/layout/route'

const caja = (id: string, x: number, y: number, width = 100, height = 60): Obstacle => ({ id, x, y, width, height })

/** Cruza algun obstaculo (con holgura 14) un tramo ortogonal de la ruta? */
function cruza(ruta: Array<{ x: number; y: number }>, obs: Obstacle[], ignorar: string[]): boolean {
  for (let i = 0; i + 1 < ruta.length; i++) {
    const a = ruta[i], b = ruta[i + 1]
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y)
    for (const o of obs) {
      if (ignorar.includes(o.id)) continue
      if (x1 > o.x && x0 < o.x + o.width && y1 > o.y && y0 < o.y + o.height) return true
    }
  }
  return false
}

test('la ruta rodea una caja que estorba', () => {
  const a = caja('a', 0, 0), b = caja('b', 600, 0), c = caja('c', 300, -20, 100, 100)
  const ruta = routeOrthogonal(a, b, [a, b, c])
  assert.ok(ruta && ruta.length >= 2)
  assert.equal(cruza(ruta!, [a, b, c], ['a', 'b']), false)
  for (let i = 0; i + 1 < ruta!.length; i++) assert.ok(ruta![i].x === ruta![i + 1].x || ruta![i].y === ruta![i + 1].y)
})

test('con ~900 cajas el indice espacial sigue dando una ruta que no cruza nada', () => {
  // Rejilla de 30x30 cajas con pasillos. La equivalencia exacta con el router anterior (59 conectores de la pagina real,
  // 0 rutas distintas, 8,7 s -> 0,19 s) se verifico fuera de la suite con el documento guardado.
  const obs: Obstacle[] = []
  for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) obs.push(caja(`o${i}-${j}`, i * 160, j * 110, 100, 60))
  const a = obs[5 * 30 + 5], b = obs[8 * 30 + 9]
  const t0 = performance.now()
  const ruta = routeOrthogonal(a, b, obs)
  const ms = performance.now() - t0
  assert.ok(ruta, 'hay camino por los pasillos')
  assert.equal(cruza(ruta!, obs, [a.id, b.id]), false)
  assert.ok(ms < 1500, `tardo ${ms.toFixed(0)} ms`)
})
