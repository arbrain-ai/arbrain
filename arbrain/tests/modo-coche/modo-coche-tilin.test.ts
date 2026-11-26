// El tilín del modo coche: la grabación corre antes del tilín y el detector no lo toma por tu voz.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { DetectorHabla, CALIBRA_MS } from '../../src/features/modo-coche/vad'

const RUIDO = 0.008, VOZ = 0.3, TILIN = 0.5

test('el tilín (fuerte, en su ventana) no cuenta como voz ni ensucia el piso de ruido', () => {
  const d = new DetectorHabla(0)
  // 150 ms de colchón con ruido de cabina, luego el tilín 580 ms (ignorado), luego silencio.
  for (let t = 0; t <= 150; t += 50) d.paso(t, RUIDO)
  d.ignorar(150, 580)
  for (let t = 200; t <= 700; t += 50) assert.equal(d.paso(t, TILIN), 'sigue')
  for (let t = 750; t <= 2000; t += 50) d.paso(t, RUIDO)
  assert.equal(d.hablaVista, false, 'el tilín no se oyó como voz')
  assert.equal(d.vozMs, 0)
})

test('si hablas en cuanto termina el tilín, se oye desde la primera medición', () => {
  const d = new DetectorHabla(0)
  for (let t = 0; t <= 150; t += 50) d.paso(t, RUIDO)
  d.ignorar(150, 580)
  for (let t = 200; t <= 700; t += 50) d.paso(t, TILIN)
  // 730: primera medición fuera de la ventana; la calibración ya tiene su colchón y apenas le falta un poco.
  let primera = -1
  for (let t = 750; t <= 2500; t += 50) { d.paso(t, VOZ); if (d.hablaVista && primera < 0) primera = t }
  assert.ok(primera > 0 && primera <= 750 + CALIBRA_MS, `voz vista a los ${primera} ms`)
  assert.ok(d.vozMs >= 1400, `voz contada ${d.vozMs} ms`)
})

test('un «Termina.» corto dicho encima del tilín cuenta entero (no se tira como tos) y se mira adelante', () => {
  const d = new DetectorHabla(0)
  for (let t = 0; t <= 150; t += 50) d.paso(t, RUIDO)
  d.ignorar(150, 580)
  // Hablas 900 ms desde que empieza el tilín (la ventana mide tilín + voz) y callas.
  const pasos: string[] = []
  for (let t = 200; t <= 6000; t += 50) {
    const p = d.paso(t, t < 1050 ? (t < 730 ? TILIN + VOZ : VOZ) : RUIDO)
    pasos.push(p)
    if (p === 'terminaste' || p === 'empezar-de-nuevo') break
  }
  assert.ok(d.vozMs >= 800, `voz contada ${d.vozMs} ms (antes del arreglo: ~300)`)
  assert.ok(pasos.includes('mirar-adelante'), 'se mira adelante para notar «termina»')
  assert.equal(pasos[pasos.length - 1], 'terminaste', 'y al silencio se entrega (no se tira)')
})

test('si dejaste de hablar antes de que acabe el tilín, ese pedacito no se acredita (no se adivina)', () => {
  const d = new DetectorHabla(0)
  for (let t = 0; t <= 150; t += 50) d.paso(t, RUIDO)
  d.ignorar(150, 580)
  for (let t = 200; t <= 700; t += 50) d.paso(t, t < 400 ? TILIN + VOZ : TILIN * 0.01)
  for (let t = 750; t <= 2000; t += 50) d.paso(t, RUIDO)
  assert.equal(d.hablaVista, false)
})

test('sin ventana ignorada, el detector se comporta igual que antes (fluido y por turnos)', () => {
  const d = new DetectorHabla(0)
  for (let t = 0; t <= 300; t += 50) d.paso(t, RUIDO)
  d.paso(350, VOZ)
  assert.equal(d.hablaVista, true)
})
