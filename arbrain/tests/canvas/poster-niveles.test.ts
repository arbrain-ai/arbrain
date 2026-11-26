import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nivelDePoster, posterParaPintar } from '../../src/features/canvas/render/poster-niveles'

test('de cerca el póster va tal cual (nivel 0)', () => {
  assert.equal(nivelDePoster(3200, 1700), 0)
  assert.equal(nivelDePoster(3200, 2400), 0)
})

test('de lejos baja de nivel sin quedarse con menos px que los que ocupa en pantalla', () => {
  assert.equal(nivelDePoster(3200, 400), 3)        // 3200 → 1600 → 800 → 400 (≥ 400); 200 ya no
  assert.equal(nivelDePoster(3200, 1600), 1)
  assert.equal(nivelDePoster(3200, 100), 5)        // tope: 1/32
  for (const [w, p] of [[3200, 37], [1720, 536], [3400, 1632]]) {
    const n = nivelDePoster(w, p)
    assert.ok(w / 2 ** n >= p || w / 2 ** n >= 16, `${w}/${p} → ${n}`)
  }
})

test('tope y entradas raras', () => {
  assert.equal(nivelDePoster(3200, 1), 5)
  assert.equal(nivelDePoster(0, 100), 0)
  assert.equal(nivelDePoster(3200, 0), 0)
  assert.equal(nivelDePoster(40, 1), 1)            // nunca por debajo de 16 px
})

test('sin documento (fuera del navegador) devuelve el original', () => {
  const falso = { width: 100, height: 50 } as unknown as CanvasImageSource
  assert.equal(posterParaPintar(falso, 4), falso)
})
