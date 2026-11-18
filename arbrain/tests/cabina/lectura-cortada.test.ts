/**
 * «TypeError: undefined is not an object (evaluating 'e.terminales.filter')» en el iPhone: una lectura del panel que
 * respondió 200 pero cuyo cuerpo no se pudo leer se guardaba como `{}`, y `trabajandoAhora({})` tumbaba la pantalla
 * del chat (y el modo coche con ella).
 */
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { trabajandoAhora, trabajandoEn, type Trabajos } from '../../src/features/cabina/trabajos-modelo'
import { fuenteFresca } from '../../src/features/cabina/datos'

test('trabajandoAhora y trabajandoEn no truenan con una lectura sin «terminales»', () => {
  const rara = {} as Trabajos
  assert.deepEqual(trabajandoAhora(rara), { agentes: 0, procesos: 0, total: 0 })
  assert.equal(trabajandoEn(rara, 'abc'), 0)
  const conInternas = { internas: [{ estado: 'trabajando', conversacion: 'abc' }] } as unknown as Trabajos
  assert.equal(trabajandoAhora(conInternas).agentes, 1)
})

test('una respuesta 200 que no se puede leer no se guarda como dato (antes quedaba «{}»)', async () => {
  const original = globalThis.fetch
  let n = 0
  globalThis.fetch = (async () => {
    n++
    if (n === 1) return new Response(JSON.stringify({ terminales: [], internas: [], servidores: [], servicios: [], sfterm: false, leidoEn: 'x' }), { status: 200 })
    return new Response('{"terminales": [', { status: 200 }) // cuerpo cortado a la mitad
  }) as typeof fetch
  try {
    const url = '/api/cabina/trabajos?prueba=sin-terminales'
    const buena = await fuenteFresca<Trabajos>(url, 0)
    assert.ok(Array.isArray(buena?.terminales))
    const cortada = await fuenteFresca<Trabajos>(url, 0)
    assert.equal(cortada, undefined, 'la lectura cortada no se da por buena')
  } finally {
    globalThis.fetch = original
  }
})
