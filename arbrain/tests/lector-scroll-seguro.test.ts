import test from 'node:test'
import assert from 'node:assert/strict'
import { acotarScroll, curvaDeslizar, razonEscala, usarMarcador } from '../src/features/chat/lib/desplazar'
import { lateParaSiempre } from '../src/shared/lib/reposo'

// 12 oct 2026: con la página escalada, scrollTop/scrollBy instantáneo deja a WKWebView en blanco; se salta por marcador.
test('el salto por marcador solo se usa con la página escalada y un contenedor posicionado', () => {
  assert.equal(usarMarcador(1.4, 'absolute'), true)
  assert.equal(usarMarcador(0.9, 'relative'), true)
  assert.equal(usarMarcador(1, 'absolute'), false) // teléfono y web sin zoom: scrollTop de siempre
  assert.equal(usarMarcador(1.4, 'static'), false) // el marcador no se movería con el contenido
})

test('el destino del scroll queda dentro del contenido', () => {
  assert.equal(acotarScroll(-40, 5000, 800), 0)
  assert.equal(acotarScroll(9999, 5000, 800), 4200)
  assert.equal(acotarScroll(1234.6, 5000, 800), 1235)
  assert.equal(acotarScroll(300, 500, 800), 0) // contenido más corto que la vista
})

test('el deslizado sale y llega exacto, sin pasarse', () => {
  assert.equal(curvaDeslizar(0), 0)
  assert.equal(curvaDeslizar(1), 1)
  assert.equal(curvaDeslizar(2), 1)
  for (let t = 0; t < 1; t += 0.1) assert.ok(curvaDeslizar(t + 0.1) >= curvaDeslizar(t))
})

// La barra del lector y los mensajes nuevos nacen con animación de entrada (opacidad 0): pausarla los dejaba invisibles.
test('en reposo solo se pausan las animaciones infinitas', () => {
  assert.equal(lateParaSiempre(Infinity), true)
  assert.equal(lateParaSiempre(1), false)
  assert.equal(lateParaSiempre(undefined), false)
})

// Medido en WKWebView con zoom 1.4: scrollTop −300 movió el rect +420. La zona se mide en rects; el scroll, en layout.
test('la razón rect/scroll convierte el paso del lector', () => {
  assert.equal(razonEscala(1120, 800), 1.4)
  assert.equal(razonEscala(800, 800), 1)
  assert.equal(razonEscala(0, 800), 1) // oculto: no se inventa una escala
  assert.equal(razonEscala(500, 0), 1)
})
