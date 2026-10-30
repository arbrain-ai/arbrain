// «Ir al final» dentro del hilo (21 oct 2026: «no puedo hacer scroll con esta UI»). Era un hermano absoluto
// encima del hilo: la rueda o el dedo sobre él no tenían contenedor con scroll en su cadena y el hilo no se movía
// (bitácora hilo-rueda del 21 oct: los dos atascos con el puntero sobre este botón). Prueba de navegador: rueda y toque
// sobre el botón a 1280 y 390 px, con y sin teclado simulado, mueven el hilo.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const panel = readFileSync(join(import.meta.dirname, '../../src/features/chat/components/ChatPanel.tsx'), 'utf8')

test('el botón «Ir al final» vive dentro del contenedor con scroll del hilo', () => {
  const inicioHilo = panel.indexOf('ref={messagesContainerRef}')
  const fondo = panel.indexOf('<div ref={bottomRef} />', inicioHilo)
  assert.ok(inicioHilo > 0 && fondo > inicioHilo)
  // El cierre del contenedor del hilo es el primer `</div>` a su sangría tras el ancla del fondo.
  const cierreHilo = panel.indexOf('\n          </div>', fondo)
  const boton = panel.indexOf('title="Ir al final"')
  assert.ok(boton > fondo && boton < cierreHilo, '«Ir al final» debe estar entre el ancla del fondo y el cierre del hilo')
})

test('el botón se pega al fondo con sticky y una fila de alto 0, nunca absoluto encima del hilo', () => {
  const boton = panel.indexOf('title="Ir al final"')
  const tramo = panel.slice(panel.lastIndexOf('{showScrollBtn && (', boton), boton)
  assert.match(tramo, /sticky bottom-3/)
  assert.match(tramo, /\bh-0\b/)
  assert.match(tramo, /pointer-events-none/)
  assert.doesNotMatch(tramo, /absolute bottom-3/)
})
