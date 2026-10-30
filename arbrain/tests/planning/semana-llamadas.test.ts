import test from 'node:test'
import assert from 'node:assert/strict'
import { diaEnHoras, lugarEnColumna, repartir, type Bloque } from '../../src/features/planning/semana-horas'

// Lun 19 oct 2026 en la Semana (Daniel 19 oct: «¿por qué se ve tan amontonado mi día de hoy en la vista semanal??»).
const D = '2026-10-19'
const ms = (h: number, m = 0) => new Date(2026, 9, 19, h, m).getTime()
const b = (id: string, titulo: string, a: [number, number], z: [number, number], extra: Partial<Bloque> = {}): Bloque =>
  ({ id, titulo, inicio: ms(...a), fin: ms(...z), color: null, movible: true, ...extra })
const tarea = (id: string, titulo: string, h: number, m = 0, extra: Partial<Bloque> = {}) => b(id, titulo, [h, m], [h, m + 30], { tarea: true, sinDuracion: true, ...extra })

const lunes = [
  b('v1', 'Llamadas con aplicantes', [10, 0], [14, 30]),
  b('l1', 'Llamada · Persona Uno · Cerebro Artificial', [10, 0], [10, 45]),
  b('b1', 'Brief · Persona Uno', [10, 0], [10, 45]),
  b('l2', 'Llamada · Persona Tres · Cerebro Artificial', [11, 30], [12, 15]),
  b('b2', 'Brief · Persona Tres', [11, 30], [12, 15]),
  b('v2', 'Llamadas con aplicantes', [15, 15], [19, 45]),
  b('l3', 'Llamada · Persona Cuatro · Cerebro Artificial', [15, 15], [16, 0]),
  b('b3', 'Brief · Persona Cuatro', [15, 15], [16, 0]),
  tarea('t1', 'Responder los 6 «¿Entra?»', 15, 15), tarea('t2', 'Purgar caché de Cloudflare', 15, 20), tarea('t3', 'Aprobar el aviso', 15, 25),
  tarea('t4', 'Comentar los posts de los fundadores', 13, 0),
  b('t5', 'Bloque de trabajo con duración', [13, 0], [14, 0], { tarea: true }),
]

test('la ventana es banda, el brief se pliega en su llamada y la llamada no comparte columna con nadie', () => {
  const r = diaEnHoras(lunes, D)
  assert.deepEqual(r.bandas?.map(p => p.bloque.id), ['v1', 'v2'])
  const ids = r.piezas.map(p => p.bloque.id)
  assert.ok(!ids.includes('v1') && !ids.includes('b1') && !ids.includes('b2') && !ids.includes('b3'), 'ni ventanas ni briefs como columnas')
  for (const id of ['l1', 'l2', 'l3']) {
    const p = r.piezas.find(x => x.bloque.id === id)!
    assert.equal(p.cols, 1, `${id} a todo lo ancho`)
    assert.ok(p.bloque.brief, `${id} trae su brief`)
    assert.equal(p.bloque.corto, p.bloque.titulo.split(' · ')[1])
  }
})

test('las tareas sin duración son chips del borde; las que caen juntas, uno solo; las de duración siguen siendo bloque', () => {
  const r = diaEnHoras(lunes, D)
  assert.ok(!r.piezas.some(p => ['t1', 't2', 't3', 't4'].includes(p.bloque.id)))
  assert.ok(r.piezas.some(p => p.bloque.id === 't5'))
  assert.deepEqual(r.chips?.map(g => g.bloques.map(x => x.id)), [['t4'], ['t1', 't2', 't3']])
  assert.equal(r.piezas.find(p => p.bloque.id === 'l3')!.resguardo, true, 'la llamada de las 15:15 deja el borde al chip')
  assert.equal(r.piezas.find(p => p.bloque.id === 'l1')!.resguardo, undefined)
})

test('las tareas nunca entran al reparto de llamadas', () => {
  const r = repartir([b('x', 'Llamadas con aplicantes', [9, 0], [10, 0], { tarea: true }), b('y', 'Brief · Elena', [9, 0], [9, 30], { tarea: true })])
  assert.deepEqual(r.bandas, [])
  assert.deepEqual(r.tarjetas.map(t => t.id), ['x', 'y'])
})

test('los encimados van siempre lado a lado, a partes iguales (Riel, 25 oct)', () => {
  assert.deepEqual(lugarEnColumna(1, 2, 200), { left: 100, width: 100 })
  assert.deepEqual(lugarEnColumna(1, 2, 96), { left: 48, width: 48 })
  assert.deepEqual(lugarEnColumna(0, 1, 120), { left: 0, width: 120 })
})
