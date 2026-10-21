import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularZonaLectura } from '../src/features/chat/lib/zona-lectura'

const hilo = { top: 60, bottom: 800 }

test('frase dentro de la zona: cero scroll', () => {
  const r = calcularZonaLectura({ bloque: { top: 300, bottom: 360 }, hilo })
  assert.equal(r.dentro, true)
})

test('composer alto tapa la frase: se pide scroll hacia arriba del borde del composer', () => {
  const r = calcularZonaLectura({ bloque: { top: 600, bottom: 660 }, hilo, composerTop: 500 })
  assert.equal(r.dentro, false)
  assert.equal(r.zona.bottom, 500)
  // Centrada en [60,500]: destino top = 60 + (440-60)/2 = 250
  assert.equal(r.delta, 350)
})

test('la barra de lectura recorta el borde superior', () => {
  const r = calcularZonaLectura({ bloque: { top: 70, bottom: 120 }, hilo, barraBottom: 100 })
  assert.equal(r.dentro, false)
  assert.ok(r.delta < 0)
})

test('bloque más alto que la zona: alinea su inicio', () => {
  const r = calcularZonaLectura({ bloque: { top: 400, bottom: 1400 }, hilo, composerTop: 500, margen: 24 })
  assert.equal(r.delta, 400 - (60 + 24))
})

test('composer ausente o fuera del hilo no reduce la zona', () => {
  const r = calcularZonaLectura({ bloque: { top: 300, bottom: 360 }, hilo, composerTop: 2000 })
  assert.equal(r.zona.bottom, 800)
})
