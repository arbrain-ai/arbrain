import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seleccionarBloques } from '../../src/features/cabina/documento/lector-seleccion'
import { SCRIPT_LECTOR } from '../../src/features/cabina/documento/lector-agente'
import { inyectarTema } from '../../src/features/cabina/documento/tema-html'

const b = (t: string, extra: object = {}) => ({ t, ...extra })

test('un pie repetido (aunque cambie el número) no se lee, el resto sí', () => {
  const crudos = [b('Pergamino · Cerebro artificial · 1/10'), b('Primera idea del documento.'), b('Pergamino · Cerebro artificial · 2/10'), b('Segunda idea.'), b('Pergamino · Cerebro artificial · 3/10')]
  assert.deepEqual(seleccionarBloques(crudos), [1, 3])
})

test('dos repeticiones todavía son contenido; un párrafo largo repetido tampoco se toca', () => {
  const largo = 'x'.repeat(200)
  assert.deepEqual(seleccionarBloques([b('Sí.'), b('Sí.'), b(largo), b(largo), b(largo)]), [0, 1, 2, 3, 4])
})

test('«Paso 1», «Paso 2», «Paso 3» y los encabezados repetidos son contenido, no pies', () => {
  assert.deepEqual(seleccionarBloques([b('Paso 1'), b('Paso 2'), b('Paso 3'), b('Ejemplo', { enc: true }), b('Ejemplo', { enc: true }), b('Ejemplo', { enc: true })]), [0, 1, 2, 3, 4, 5])
})

test('aplica las reglas del chat: tablas, fuentes al final y URLs sueltas fuera', () => {
  const crudos = [b('Intro'), b('celda', { tabla: true }), b('https://a.com/x'), b('Cuerpo'), b('Fuentes', { enc: true }), b('Algo citado')]
  assert.deepEqual(seleccionarBloques(crudos), [0, 3])
})

test('conserva los índices originales aunque se descarten bloques', () => {
  assert.deepEqual(seleccionarBloques([b('   '), b('Hola mundo'), b('Pergamino del cerebro artificial · 1'), b('Pergamino del cerebro artificial · 2'), b('Pergamino del cerebro artificial · 3')]), [1])
})

test('el agente viaja serializado en cada HTML servido y es JS autocontenido', () => {
  assert.ok(SCRIPT_LECTOR.startsWith('<script>') && SCRIPT_LECTOR.endsWith('</script>'))
  assert.equal(SCRIPT_LECTOR.slice(8, -9).includes('</script'), false, 'no cierra su propio script')
  // Sintaxis que el compilador reescribiría con ayudantes de módulo: no puede aparecer en lo que se serializa.
  assert.doesNotMatch(SCRIPT_LECTOR, /_async_to_generator|_object_spread|_to_consumable_array|__awaiter|\bawait\b|\?\./)
  const js = SCRIPT_LECTOR.slice(8, -9)
  assert.doesNotThrow(() => new Function(js), 'es JavaScript válido')
})

test('inyectarTema agrega el lector junto al tema', () => {
  const out = inyectarTema('<html><head></head><body><p>hola</p></body></html>', 'oscuro')
  assert.match(out, /arbrain-lector-pedir/)
  assert.match(out, /data-tema/)
})
