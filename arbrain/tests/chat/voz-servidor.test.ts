import { test } from 'node:test'
import assert from 'node:assert/strict'
import { palabraEn, tiemposDePalabras } from '../../src/features/chat/lib/voz-servidor'
import { tramosDeVoz } from '../../src/features/chat/lib/chat-speech'

function palabras(s: string) {
  return [...s.matchAll(/\S+/g)].map((m) => ({ from: m.index!, to: m.index! + m[0].length }))
}

test('los tiempos reparten la duración real por caracteres, crecientes y dentro del audio', () => {
  const s = 'Hola Daniel, esta es una prueba de velocidad.'
  const w = palabras(s)
  const t = tiemposDePalabras(s, w, 4)
  assert.equal(t.length, w.length)
  assert.ok(t[0] > 0 && t[0] < 0.1)
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1])
  assert.ok(t[t.length - 1] < 4)
  // Duplicar la duración duplica (casi) cada marca: escala con el audio, no con una velocidad supuesta.
  const t2 = tiemposDePalabras(s, w, 8)
  assert.ok(Math.abs(t2[5] - 2 * t[5]) < 0.1)
})

test('la coma y el punto dejan aire: la palabra que sigue arranca más tarde que sin puntuación', () => {
  const con = 'uno, dos tres'
  const sin = 'uno  dos tres'
  const a = tiemposDePalabras(con, palabras(con), 3)
  const b = tiemposDePalabras(sin, palabras(sin), 3)
  assert.ok(a[1] > b[1])
})

test('palabraEn devuelve la última palabra que ya empezó', () => {
  const t = [0.05, 0.4, 0.9, 1.5]
  assert.equal(palabraEn(t, 0), 0)
  assert.equal(palabraEn(t, 0.39), 0)
  assert.equal(palabraEn(t, 0.4), 1)
  assert.equal(palabraEn(t, 1.2), 2)
  assert.equal(palabraEn(t, 99), 3)
  assert.equal(palabraEn([], 1), -1)
})

test('tramosDeVoz corta en fin de frase pasados ~160 caracteres y cubre todas las palabras sin solaparse', () => {
  const frase = 'Esta es una frase de prueba con suficientes palabras para medir el corte del lector. '
  const s = frase.repeat(6).trim()
  const w = palabras(s)
  const tr = tramosDeVoz(s, w)
  assert.ok(tr.length >= 2)
  assert.equal(tr[0].desde, 0)
  assert.equal(tr[tr.length - 1].hasta, w.length)
  for (let i = 1; i < tr.length; i++) assert.equal(tr[i].desde, tr[i - 1].hasta)
  for (const t of tr) assert.ok(/\.$/.test(t.texto) && t.texto.length <= 330)
})

test('un párrafo corto es un solo tramo con el texto tal cual', () => {
  const s = 'Hola, ¿cómo vas?'
  const tr = tramosDeVoz(s, palabras(s))
  assert.deepEqual(tr, [{ desde: 0, hasta: 3, texto: 'Hola, ¿cómo vas?' }])
})
