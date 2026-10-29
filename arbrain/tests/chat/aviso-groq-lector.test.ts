import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoGroqMostrado, avisoGroqVisible, cerrarAvisoGroq, CLAVE_AVISO_GROQ, marcasFaltan, suscribirAvisoGroq } from '../../src/features/chat/lib/aviso-groq-lector'

// Daniel (29 oct 2026): «asegúrate de que se le diga al usuario cómo conectar su llave, que es gratuita». El lector con
// LemonFox sin llave de Groq lo dice UNA vez; con la llave, la cabecera no llega y nunca aparece.
function almacen() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, m }
}

test('sin llave de Groq el aviso sale una sola vez, y no vuelve en el siguiente tramo ni en la siguiente lectura', () => {
  const a = almacen()
  let avisos = 0
  const soltar = suscribirAvisoGroq(() => { avisos++ })
  marcasFaltan('sin_llave_groq', a)
  assert.equal(avisoGroqVisible(), true)
  avisoGroqMostrado(a) // la barra del lector lo pintó
  assert.ok(a.m.get(CLAVE_AVISO_GROQ), 'quedó anotado al mostrarse')
  marcasFaltan('sin_llave_groq', a) // el tramo siguiente de la misma lectura
  assert.equal(avisos, 1)
  cerrarAvisoGroq() // «Ahora no» o cerrar el lector
  assert.equal(avisoGroqVisible(), false)
  marcasFaltan('sin_llave_groq', a) // otra lectura, otro día
  assert.equal(avisoGroqVisible(), false)
  assert.equal(avisos, 2)
  soltar()
})

test('si nadie lo pintó (lector de un documento del panel), no se gasta: sale en la próxima lectura del chat', () => {
  const a = almacen()
  marcasFaltan('sin_llave_groq', a)
  assert.equal(avisoGroqVisible(), true)
  cerrarAvisoGroq() // el lector del documento terminó sin barra
  marcasFaltan('sin_llave_groq', a)
  assert.equal(avisoGroqVisible(), true)
  avisoGroqMostrado(a)
  cerrarAvisoGroq()
  marcasFaltan('sin_llave_groq', a)
  assert.equal(avisoGroqVisible(), false)
})

test('con la llave ya puesta no hay cabecera y el aviso nunca aparece; tampoco por Groq ocupado o sin red', () => {
  const a = almacen()
  for (const falta of [null, 'groq_saturado', 'groq_sin_red', 'groq_tiempo', 'audio_no_wav']) marcasFaltan(falta, a)
  assert.equal(avisoGroqVisible(), false)
  assert.equal(a.m.size, 0)
})

test('sin almacén (modo privado que lo niega) calla: no se puede prometer «una vez»', () => {
  marcasFaltan('sin_llave_groq', null)
  assert.equal(avisoGroqVisible(), false)
  const roto = { getItem: () => { throw new Error('denegado') }, setItem: () => { throw new Error('denegado') } }
  marcasFaltan('sin_llave_groq', roto)
  assert.equal(avisoGroqVisible(), false)
})
