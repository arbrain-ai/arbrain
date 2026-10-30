import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { tramosPropios, type NodoLector } from '../../src/features/chat/lib/lector-bloques.ts'
import { buildSpoken } from '../../src/features/chat/lib/chat-speech.ts'

// Árbol mínimo (sin DOM): lo que el lector ve en el mensaje del reporte del 8 oct.
type N = NodoLector & { children?: N[] }
const txt = (t: string): N => ({ nodeType: 3, nodeName: '#text', childNodes: [], textContent: t })
const el = (tag: string, ...kids: N[]): N => ({
  nodeType: 1, nodeName: tag.toUpperCase(), childNodes: kids,
  textContent: kids.map((k) => k.textContent).join(''),
})

const subLista = el('ul',
  el('li', txt('el 17, veinte personas a 3,000;')),
  el('li', txt('con sus resultados, la siguiente cohorte más cara;')),
  el('li', txt('y así hasta los diez mil.')),
)
const liPadre = el('li',
  txt('El precio sigue a la prueba. Iman lo dice claro: subes el precio cuando los clientes te dicen «está barato». El camino es este:'),
  subLista,
)

test('un li con sub-lista entrega su prosa propia como tramo', () => {
  const t = tramosPropios(liPadre)
  assert.equal(t.length, 1)
  assert.match(t[0].map((n) => n.textContent).join(''), /^El precio sigue a la prueba.*El camino es este:$/)
})

test('prosa antes y después de la sub-lista = dos tramos, en orden', () => {
  const li = el('li', txt('Antes de la lista. '), el('strong', txt('Ojo')), txt(' sigue.'), subLista, txt('Después de la lista.'))
  const t = tramosPropios(li).map((r) => r.map((n) => n.textContent).join(''))
  assert.deepEqual(t, ['Antes de la lista. Ojo sigue.', 'Después de la lista.'])
})

test('una hoja (sin bloques dentro) no se toca', () => {
  assert.deepEqual(tramosPropios(el('li', txt('hola '), el('em', txt('mundo')))), [])
})

test('espacios o saltos entre bloques no generan tramos', () => {
  assert.deepEqual(tramosPropios(el('li', txt('\n'), subLista, txt('\n'))), [])
})

test('«3,000;» y la coma de miles no desalinean el mapa texto→palabra', () => {
  const visible = 'el 17, veinte personas a 3,000; con sus resultados «más cara»; y así hasta los diez mil.'
  const { spoken, map } = buildSpoken(visible)
  assert.equal(spoken.length, map.length)
  assert.ok(spoken.includes('3,000;'))
  assert.equal(visible.slice(map[spoken.indexOf('3,000;')]).slice(0, 6), '3,000;')
  assert.ok(map.every((v, i) => i === 0 || v >= map[i - 1]))
})
