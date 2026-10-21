import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { crearCamaraViva } from '../../src/features/canvas/ui/CamaraViva'
import { ordenPorZ, ordenPorZDesc } from '../../src/features/canvas/model/orden'

const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

test('cámara viva: un cambio suelto llega a React al instante y no cuenta como gesto', () => {
  const asentadas: number[] = []
  const v = crearCamaraViva({ x: 0, y: 0, zoom: 1 }, c => asentadas.push(c.x), 40)
  v.fijar({ x: 10, y: 0, zoom: 1 })
  assert.deepEqual(asentadas, [10])
  assert.equal(v.enGesto(), false)
})

test('cámara viva: una ráfaga se pinta cuadro a cuadro pero React solo recibe la última, al detenerse', async () => {
  const asentadas: number[] = []
  let avisos = 0
  const v = crearCamaraViva({ x: 0, y: 0, zoom: 1 }, c => asentadas.push(c.x), 40)
  v.suscribir(() => { avisos++ })
  for (let i = 1; i <= 10; i++) v.fijar(c => ({ ...c, x: i }))
  assert.equal(v.ref.current.x, 10)          // la cámara de ahora siempre al día
  assert.equal(avisos, 10)                   // el lienzo se entera de cada cuadro
  assert.deepEqual(asentadas, [1])           // React: solo el primer cambio...
  assert.equal(v.enGesto(), true)
  await espera(70)
  assert.deepEqual(asentadas, [1, 10])       // ...y el último al soltar
  assert.equal(v.enGesto(), false)
  assert.equal(avisos, 11)                   // un aviso más: repintar nítido
})

test('cámara viva: fijar la misma cámara no avisa a nadie', () => {
  let avisos = 0
  const v = crearCamaraViva({ x: 1, y: 2, zoom: 1 }, () => {}, 40)
  v.suscribir(() => { avisos++ })
  v.fijar({ x: 1, y: 2, zoom: 1 })
  assert.equal(avisos, 0)
})

test('orden por z: se recuerda por documento y respeta los empates en los dos sentidos', () => {
  const els = [{ id: 'a', zIndex: 2 }, { id: 'b', zIndex: 1 }, { id: 'c', zIndex: 2 }] as never[]
  assert.deepEqual(ordenPorZ(els).map((e: { id: string }) => e.id), ['b', 'a', 'c'])
  assert.deepEqual(ordenPorZDesc(els).map((e: { id: string }) => e.id), ['a', 'c', 'b'])
  assert.equal(ordenPorZ(els), ordenPorZ(els))   // misma identidad: no se vuelve a ordenar
})

test('puntoLocal: sin zoom CSS es la resta de siempre; con --ui-zoom reescala a px de layout', async () => {
  const { puntoLocal } = await import('../../src/features/canvas/render/viewport')
  assert.deepEqual(puntoLocal(150, 80, { left: 100, top: 50, width: 800, height: 600 }, 800, 600), { x: 50, y: 30 })
  // Zoom CSS 1.25: el lienzo de 800x600 de layout ocupa 1000x750 visuales.
  assert.deepEqual(puntoLocal(225, 87.5, { left: 100, top: 50, width: 1000, height: 750 }, 800, 600), { x: 100, y: 30 })
})

