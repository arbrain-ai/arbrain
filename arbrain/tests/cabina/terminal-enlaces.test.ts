import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { enlacesEnCeldas, esWeb, MANEJADOR_OSC8, type Celda } from '../../src/features/cabina/terminal/enlaces'

// Pone un texto en renglones de `cols` celdas, como lo envuelve la terminal.
const envolver = (texto: string, cols: number, filaInicial = 0): Celda[] =>
  [...texto].map((ch, i) => ({ ch, fila: filaInicial + Math.floor(i / cols), x: i % cols }))

const LOGIN = 'https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&state=xYz_789'

test('el enlace del login partido en varios renglones sale entero, con su primera y última celda', () => {
  const pre = "If the browser didn't open, visit: "
  const [e, ...resto] = enlacesEnCeldas(envolver(pre + LOGIN, 80, 3))
  assert.equal(resto.length, 0)
  assert.equal(e.url, LOGIN)
  assert.deepEqual(e.inicio, { fila: 3, x: pre.length })
  const ultima = pre.length + LOGIN.length - 1
  assert.deepEqual(e.fin, { fila: 3 + Math.floor(ultima / 80), x: ultima % 80 })
  assert.ok(e.fin.fila - e.inicio.fila >= 2, 'ocupa al menos tres renglones')
})

test('la puntuación que cierra la frase no es parte del enlace', () => {
  assert.deepEqual(enlacesEnCeldas(envolver('visita https://ejemplo.com/ayuda.', 80)).map(e => e.url), ['https://ejemplo.com/ayuda'])
  assert.deepEqual(enlacesEnCeldas(envolver('(ver https://ejemplo.com/a?b=1)', 80)).map(e => e.url), ['https://ejemplo.com/a?b=1'])
})

test('varios enlaces en la misma línea y nada que no sea http(s)', () => {
  const urls = enlacesEnCeldas(envolver('a http://127.0.0.1:3000 b https://x.ai/c javascript:alert(1) file:///etc/passwd', 30)).map(e => e.url)
  assert.deepEqual(urls, ['http://127.0.0.1:3000', 'https://x.ai/c'])
  assert.deepEqual(enlacesEnCeldas(envolver('https:// y nada más', 80)), [])
})

test('un carácter ancho antes del enlace no corre sus celdas', () => {
  // «界» ocupa dos celdas (x 0 y 1): la terminal da una sola celda con texto y el enlace empieza en la x 3.
  const celdas: Celda[] = [{ ch: '界', fila: 0, x: 0 }, { ch: ' ', fila: 0, x: 2 }, ...envolver('https://x.ai', 80).map(c => ({ ...c, x: c.x + 3 }))]
  assert.deepEqual(enlacesEnCeldas(celdas)[0].inicio, { fila: 0, x: 3 })
})

test('solo se abren direcciones web', () => {
  assert.equal(esWeb('https://claude.com/x'), true)
  assert.equal(esWeb('HTTP://a.b'), true)
  assert.equal(esWeb('javascript:alert(1)'), false)
  assert.equal(esWeb('file:///etc/passwd'), false)
  assert.equal(MANEJADOR_OSC8.allowNonHttpProtocols, false)
})
