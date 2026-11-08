import test from 'node:test'
import assert from 'node:assert/strict'
import { clavesDeFrase, frasesDe, MovimientoVivo } from '../../src/features/chat/lib/levy-movimiento.ts'
import { SeparadorJson } from '../../src/features/chat/lib/levy-vivo.ts'

test('parpadeo ~15 por minuto (el 3D sembraba ~45), cada uno de 160 ms', () => {
  const m = new MovimientoVivo(7)
  let n = 0, antes = 0
  for (let t = 0; t < 120; t += 1 / 60) { const p = m.tick(t).parpadeo; if (p > 0.5 && antes <= 0.5) n++; antes = p }
  const porMinuto = n / 2
  assert.ok(porMinuto >= 12 && porMinuto <= 18, `${porMinuto} por minuto`)
})

test('las frases salen como en el 3D: por puntuación, pausas o al pasar de 3.5 s', () => {
  const w = (s: string, a: number, b: number) => ({ w: s, s: a, e: b })
  const F = frasesDe([w('Hola,', 0, 0.3), w('soy', 0.35, 0.5), w('Levy.', 0.55, 0.9), w('Mira', 1.0, 1.2), w('bien', 1.6, 1.8)])
  assert.deepEqual(F.map(f => f.texto), ['Hola, soy Levy.', 'Mira', 'bien'])
})

test('cada frase asiente en su palabra fuerte y vuelve al reposo al terminar', () => {
  const pal = [{ w: 'Hoy', s: 0, e: 0.2 }, { w: 'pruebo', s: 0.25, e: 0.6 }, { w: 'caminos', s: 0.7, e: 1.2 }, { w: 'nuevos', s: 1.3, e: 1.7 }]
  const K = clavesDeFrase(2, 'Hoy pruebo caminos nuevos', pal, (s) => (s > 0.6 && s < 0.8 ? 1 : 0.3), false)
  assert.ok(K.some(k => (k.set.cabeceo ?? 0) > 0 && Math.abs(k.t - 0.64) < 0.01), 'asiente en «caminos»')
  const fin = K.find(k => k.set.ceja === 0 && k.set.cabLado === 0)
  assert.ok(fin && Math.abs(fin.t - 1.95) < 0.01, 'reposo 0.25 s tras la última palabra')
})

test('el separador JSON corta objetos aunque lleguen partidos y con llaves dentro de cadenas', () => {
  const s = new SeparadorJson()
  assert.deepEqual(s.push('{"a":"x}{"'), [])
  assert.deepEqual(s.push(',"b":1}\n{"c"'), [{ a: 'x}{', b: 1 }])
  assert.deepEqual(s.push(':[2]}'), [{ c: [2] }])
})
