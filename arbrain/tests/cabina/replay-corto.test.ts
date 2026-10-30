import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { recortarReplay } from '../../src/lib/replay'

const b = (s: string) => Buffer.from(s, 'latin1')

test('un replay chico pasa intacto', () => {
  const r = b('hola\r\nmundo')
  assert.equal(recortarReplay(r, 100), r)
})

test('un replay grande sale recortado y arranca en el último borrado de pantalla', () => {
  const viejo = 'x'.repeat(5000)
  const r = recortarReplay(b(viejo + '\x1b[2J\x1b[H' + 'pantalla nueva '.repeat(40)), 1000)
  assert.ok(r.length <= 1004)
  assert.ok(r.toString('latin1').startsWith('\x1b[0m\x1b[2J'))
  assert.ok(!r.toString('latin1').includes('xxxx'))
})

test('sin borrado arranca en un salto de línea, nunca a media secuencia', () => {
  const r = recortarReplay(b('\x1b[38;5;1m' + 'linea\r\n'.repeat(1000)), 500).toString('latin1')
  assert.ok(r.startsWith('\x1b[0mlinea'))
})

test('el replay de 4 MB de un agente de horas baja a menos de 400 KB', () => {
  const ring = Buffer.alloc(4 * 1024 * 1024, 0x61)
  for (let i = 0; i < ring.length; i += 80) ring[i] = 0x0a
  assert.ok(recortarReplay(ring).length < 400 * 1024)
})
