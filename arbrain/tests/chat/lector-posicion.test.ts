import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { MemoriaLector, huellaDeTexto, resolverPosicion, CLAVE, TOPE, type PosicionStorage } from '../../src/features/chat/lib/lector-posicion.ts'

const almacen = (): PosicionStorage & { datos: Map<string, string> } => {
  const datos = new Map<string, string>()
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v) }
}
const base = { msgId: 'm1', idx: 3, total: 26, offset: 41, huella: huellaDeTexto('hola mundo'), firmaBloque: 'párrafo 4', rate: 1.5 }
const actual = (o: Partial<{ huella: string; firmas: string[]; longitudes: number[] }> = {}) => ({
  huella: base.huella,
  firmas: Array.from({ length: 26 }, (_, i) => `párrafo ${i + 1}`),
  longitudes: Array.from({ length: 26 }, () => 200),
  ...o,
})

test('cada conversación recuerda la suya: mensaje, párrafo 4/26, palabra y velocidad', () => {
  const m = new MemoriaLector(almacen())
  m.guardar('A', base)
  m.guardar('B', { ...base, msgId: 'm9', idx: 0, total: 5 })
  assert.equal(m.obtener('A')?.idx, 3)
  assert.equal(m.obtener('A')?.total, 26)
  assert.equal(m.obtener('A')?.offset, 41)
  assert.equal(m.obtener('A')?.rate, 1.5)
  assert.equal(m.obtener('B')?.msgId, 'm9')
})

test('sobrevive a recargar (Cmd+R): otra instancia sobre el mismo almacén lee lo guardado', () => {
  const a = almacen()
  new MemoriaLector(a).guardar('A', base)
  const tras = new MemoriaLector(a)
  assert.deepEqual({ ...tras.obtener('A')!, seq: 0 }, { ...base, seq: 0 })
})

test('parar olvida; el almacén ilegible o con basura no rompe nada', () => {
  const a = almacen()
  const m = new MemoriaLector(a)
  m.guardar('A', base)
  m.olvidar('A')
  assert.equal(new MemoriaLector(a).obtener('A'), undefined)
  a.datos.set(CLAVE, '{no es json')
  assert.equal(new MemoriaLector(a).obtener('A'), undefined)
  a.datos.set(CLAVE, JSON.stringify({ A: { msgId: 5 }, B: { ...base, seq: 1 } }))
  const l = new MemoriaLector(a)
  assert.equal(l.obtener('A'), undefined)
  assert.equal(l.obtener('B')?.msgId, 'm1')
  assert.doesNotThrow(() => new MemoriaLector(null).guardar('A', base))
})

test(`tope de ${TOPE} conversaciones: se desaloja la más vieja`, () => {
  const m = new MemoriaLector(almacen())
  for (let i = 0; i < TOPE + 3; i++) m.guardar(`s${i}`, base)
  assert.equal(m.obtener('s0'), undefined)
  assert.equal(m.obtener('s2'), undefined)
  assert.ok(m.obtener('s3'))
  assert.ok(m.obtener(`s${TOPE + 2}`))
})

test('mismo mensaje: reanuda exacto en el párrafo y la palabra guardados', () => {
  const g = { ...base, seq: 1 }
  assert.deepEqual(resolverPosicion(g, actual()), { idx: 3, offset: 41, motivo: 'exacta' })
})

test('mensaje editado o regenerado (otra huella): vuelve al inicio del mensaje', () => {
  const g = { ...base, seq: 1 }
  assert.deepEqual(resolverPosicion(g, actual({ huella: huellaDeTexto('hola mundo editado') })), { idx: 0, offset: 0, motivo: 'inicio' })
})

test('fragmento inválido: menos párrafos, párrafo distinto u offset fuera de rango → inicio', () => {
  const g = { ...base, seq: 1 }
  const inicio = { idx: 0, offset: 0, motivo: 'inicio' }
  assert.deepEqual(resolverPosicion(g, actual({ firmas: ['a', 'b'], longitudes: [1, 1] })), inicio)
  assert.deepEqual(resolverPosicion(g, actual({ firmas: Array.from({ length: 26 }, (_, i) => `otro ${i}`) })), inicio)
  assert.deepEqual(resolverPosicion(g, actual({ longitudes: Array.from({ length: 26 }, () => 10) })), inicio)
})

test('la huella ignora espacios y saltos pero distingue el texto', () => {
  assert.equal(huellaDeTexto('hola   mundo\n'), huellaDeTexto(' hola mundo'))
  assert.notEqual(huellaDeTexto('hola mundo'), huellaDeTexto('hola mundos'))
})
