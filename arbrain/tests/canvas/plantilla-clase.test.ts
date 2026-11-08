import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { BLOQUES_CLASE, plantillaClase } from '../../src/features/canvas/model/plantilla-clase'
import { serverMeasureContext } from '../../src/features/canvas/text/metrics-server'

test('clase: el título y tres bloques con su nota, de izquierda a derecha, sin origen del compilador', () => {
  const { elements, camera } = plantillaClase(serverMeasureContext, 'Clase del lunes · Supernova')
  const [titulo, ...resto] = elements
  assert.equal(titulo.type, 'text')
  assert.equal(titulo.type === 'text' && titulo.text, 'Clase del lunes · Supernova')
  const secciones = resto.filter(e => e.type === 'frame')
  assert.deepEqual(secciones.map(e => e.type === 'frame' && e.title), BLOQUES_CLASE.map(b => b.titulo))
  assert.equal(resto.filter(e => e.type === 'shape').length, 3, 'una nota por bloque')
  for (let i = 1; i < secciones.length; i++) assert.ok(secciones[i].x > secciones[i - 1].x + secciones[i - 1].width, 'en fila, sin encimarse')
  for (const s of secciones) assert.ok(s.y > titulo.y + titulo.height, 'los bloques van debajo del título')
  // Cada nota cae dentro de su bloque (por el centro, como las secciones adoptan).
  resto.filter(e => e.type === 'shape').forEach((n, i) => {
    const s = secciones[i], cx = n.x + n.width / 2, cy = n.y + n.height / 2
    assert.ok(cx > s.x && cx < s.x + s.width && cy > s.y && cy < s.y + s.height)
  })
  assert.equal(new Set(elements.map(e => e.id)).size, elements.length, 'ids únicos')
  assert.ok(elements.every(e => !('origin' in e) || !e.origin), 'nace de la mano')
  assert.ok(camera.zoom > 0 && camera.x > 0 && camera.y > 0, 'la cámara encuadra el centro')
})

test('clase sin nombre se titula «Clase»; el título largo se parte en renglones', () => {
  assert.equal(plantillaClase(serverMeasureContext, '  ').elements[0].type === 'text' && (plantillaClase(serverMeasureContext, '  ').elements[0] as { text: string }).text, 'Clase')
  const largo = plantillaClase(serverMeasureContext, 'Una clase con un título larguísimo que no cabe en un solo renglón del ancho de los tres bloques juntos, ni de broma').elements[0] as { lines?: string[] }
  assert.ok((largo.lines?.length ?? 0) >= 2)
})
