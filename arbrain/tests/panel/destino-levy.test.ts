// «Dónde abre Levy» (7 oct 2026): la ventana destino se elige por su posición REAL en la pantalla, no por su número.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describirDestino, elegirVentana } from '../../src/features/cabina/panel/destino-levy'
import { NOMBRE_DUENO } from '../../src/config'

/** Dos monitores de ejemplo: la principal en el izquierdo (x = 0) y la «Ventana 1» en el derecho (x = 2000): ver geometria-ventana.test.ts. */
const NORMAL = [{ ventana: 'principal', izquierda: 0 }, { ventana: 'ventana-1', izquierda: 2000 }]
/** Las ventanas arrastradas al revés: la «Ventana 1» quedó en el monitor de la izquierda (x negativa). */
const AL_REVES = [{ ventana: 'principal', izquierda: 0 }, { ventana: 'ventana-1', izquierda: -1800 }]

test('izquierda es la que está más a la izquierda de la pantalla, sea cual sea su número', () => {
  assert.equal(elegirVentana('izquierda', NORMAL), 'principal')
  assert.equal(elegirVentana('izquierda', AL_REVES), 'ventana-1')
  assert.equal(elegirVentana('derecha', NORMAL), 'ventana-1')
  assert.equal(elegirVentana('derecha', AL_REVES), 'principal')
})

test('el panel principal es siempre el panel principal', () => {
  assert.equal(elegirVentana('principal', AL_REVES), 'principal')
})

test('si la elegida no existe o no se midió, cae en la principal: no se pierde nada', () => {
  assert.equal(elegirVentana('izquierda', []), 'principal')
  assert.equal(elegirVentana('derecha', [{ ventana: 'principal', izquierda: 0 }]), 'principal')
  assert.equal(elegirVentana('izquierda', [{ ventana: 'principal', izquierda: Number.NaN }, { ventana: 'ventana-2', izquierda: 100 }]), 'ventana-2')
  assert.equal(elegirVentana('izquierda', [{ ventana: 'ventana-2', izquierda: Number.NaN }]), 'principal')
})

test('con tres ventanas, la de más a la izquierda; un empate lo gana la principal', () => {
  const tres = [...NORMAL, { ventana: 'ventana-2', izquierda: -1200 }]
  assert.equal(elegirVentana('izquierda', tres), 'ventana-2')
  assert.equal(elegirVentana('derecha', tres), 'ventana-1')
  assert.equal(elegirVentana('izquierda', [{ ventana: 'ventana-1', izquierda: 0 }, { ventana: 'principal', izquierda: 0 }]), 'principal')
})

test('el acuse nombra la ventana y por qué', () => {
  assert.equal(describirDestino('izquierda', 'ventana-1', AL_REVES), 'Ventana 1 (la de la izquierda)')
  assert.equal(describirDestino('derecha', 'ventana-1', NORMAL), 'Ventana 1 (la de la derecha)')
  assert.equal(describirDestino('principal', 'principal', NORMAL), `Panel principal (así lo eligió ${NOMBRE_DUENO()})`)
  assert.match(describirDestino('izquierda', 'principal', [{ ventana: 'principal', izquierda: 0 }]), /Panel principal \(la única ventana/)
})
