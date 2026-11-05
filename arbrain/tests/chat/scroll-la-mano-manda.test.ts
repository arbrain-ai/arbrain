import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Seguimiento } from '../../src/features/chat/lib/seguimiento'

// 4 nov 2026, Daniel: «hago scroll pero por alguna razón me regresa arriba y se siente interminable».
// Medido en el arnés WKWebView (docs/builds/bug-scroll-2026-11-04): con el lector en pausa bajó 1 500 px con la rueda,
// tocó Ctrl+Espacio y el hilo saltó 1 742 px hacia arriba, al párrafo que sonaba. Regla: si la mano movió el hilo, nada
// lo mueve hasta que él vuelva al párrafo con su mano o toque «Seguir» (o navegue el lector: anterior, siguiente, tocar
// un párrafo).

test('pausa, la mano baja, Ctrl+Espacio: la voz sigue y el hilo NO regresa al párrafo', () => {
  const s = new Seguimiento()
  s.mano()
  s.reanudar()
  assert.equal(s.decidir(false), 'quieto')
  assert.equal(s.lleva, false)
})

test('la voz llega sola a un párrafo que se ve: no re-engancha (el siguiente fuera de la vista no se persigue)', () => {
  const s = new Seguimiento()
  s.mano()
  assert.equal(s.decidir(true), 'quieto')
  assert.equal(s.decidir(false), 'quieto')
})

test('Daniel mismo regresa con la mano al párrafo que suena: el lector vuelve a llevar el hilo', () => {
  const s = new Seguimiento()
  s.mano()
  s.manoTermino(true)
  assert.equal(s.lleva, true)
  assert.equal(s.decidir(false), 'mover')
})

test('si el gesto termina lejos del párrafo, sigue suelto', () => {
  const s = new Seguimiento()
  s.mano()
  s.manoTermino(false)
  assert.equal(s.decidir(false), 'quieto')
})

test('«Seguir» (o anterior/siguiente/tocar un párrafo) retoma: el párrafo vuelve a la vista', () => {
  const s = new Seguimiento()
  s.mano()
  s.retomar()
  assert.equal(s.decidir(false), 'mover')
  assert.equal(s.decidir(true), 'anclar')
})

test('sin mano de por medio el lector lleva el hilo como siempre', () => {
  const s = new Seguimiento()
  assert.equal(s.decidir(true), 'anclar')
  assert.equal(s.decidir(false), 'mover')
})
