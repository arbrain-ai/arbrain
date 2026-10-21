import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDePoda, CONSERVAR } from '../scripts/podar-respaldos.mjs'

const hora = 60 * 60 * 1000
const e = (nombre: string, mtimeMs: number) => ({ nombre, dir: '/x', mtimeMs })

test('conserva los respaldos más recientes y aparta el resto', () => {
  const respaldos = Array.from({ length: 12 }, (_, i) => e(`Arbrain-${i}.app`, i * hora))
  const plan = planDePoda({ respaldos, restos: [] }, 100 * hora)
  assert.equal(plan.length, 12 - CONSERVAR)
  assert.ok(!plan.some((p: { nombre: string }) => p.nombre === 'Arbrain-11.app'))
})

test('nunca toca la app instalada, la pendiente ni un stage reciente', () => {
  const ahora = 100 * hora
  const restos = [e('Arbrain.app', 0), e('.Arbrain-pendiente.app', 0), e('.Arbrain-pendiente.json', 0), e('.Arbrain-stage-1.app', ahora - 60_000), e('.Arbrain-stage-2.app', 0), e('.Arbrain-failed-3.app', 0), e('.Arbrain-pendiente-4.json.viejo', 0), e('Blender.app', 0)]
  const nombres = planDePoda({ respaldos: [], restos }, ahora).map((p: { nombre: string }) => p.nombre)
  assert.deepEqual(nombres.sort(), ['.Arbrain-failed-3.app', '.Arbrain-pendiente-4.json.viejo', '.Arbrain-stage-2.app'])
})
