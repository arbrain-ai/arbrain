import test from 'node:test'
import assert from 'node:assert/strict'
import { avanceHabitos, diasTejido, moverFoco, racha, rotuloRacha, siguienteMarca } from '../../src/features/planning/habitos-dia'

const marcas = (m: Record<string, boolean | null>) => (f: string) => m[f]

test('la racha de hoy sigue viva aunque hoy aún no se marque', () => {
  const m = marcas({ '2026-10-02': true, '2026-10-03': true, '2026-10-04': true })
  assert.deepEqual(racha(m, '2026-10-05', '2026-10-05', '2026-08-06'), { dias: 3, tope: false })
})

test('marcar hoy la alarga; un hueco sin registro la corta', () => {
  const m = marcas({ '2026-10-01': true, '2026-10-03': true, '2026-10-04': true, '2026-10-05': true })
  assert.equal(racha(m, '2026-10-05', '2026-10-05', '2026-08-06').dias, 3)
})

test('un día pasado no tiene gracia: si no se marcó, su racha es cero', () => {
  const m = marcas({ '2026-10-02': true, '2026-10-03': true })
  assert.equal(racha(m, '2026-10-04', '2026-10-05', '2026-08-06').dias, 0)
  assert.equal(racha(m, '2026-10-03', '2026-10-05', '2026-08-06').dias, 2)
})

test('una racha que llega al borde de lo leído se dice «N+», nunca se inventa', () => {
  const m = () => true
  const r = racha(m, '2026-10-05', '2026-10-05', '2026-10-01')
  assert.deepEqual(r, { dias: 5, tope: true })
  assert.equal(rotuloRacha(r), '5+ d')
  assert.equal(rotuloRacha({ dias: 1, tope: false }), null)
  assert.equal(rotuloRacha({ dias: 12, tope: false }), '12 d')
})

test('el tejido termina en el día y rota sin registro → cumplido → no cumplido', () => {
  const d = diasTejido('2026-10-05', 28)
  assert.equal(d.length, 28)
  assert.equal(d[0], '2026-09-08')
  assert.equal(d.at(-1), '2026-10-05')
  assert.equal(siguienteMarca(undefined), true)
  assert.equal(siguienteMarca(true), false)
  assert.equal(siguienteMarca(false), null)
})

test('el avance cuenta solo cumplidos explícitos', () => {
  assert.deepEqual(avanceHabitos([true, false, null, undefined]), { hechos: 1, total: 4, completo: false })
  assert.deepEqual(avanceHabitos([true, true]), { hechos: 2, total: 2, completo: true })
  assert.equal(avanceHabitos([]).completo, false)
})

test('las flechas recorren la rejilla sin salirse', () => {
  assert.equal(moverFoco(0, 10, 'ArrowRight', 2), 1)
  assert.equal(moverFoco(0, 10, 'ArrowLeft', 2), 0)
  assert.equal(moverFoco(3, 10, 'ArrowDown', 2), 5)
  assert.equal(moverFoco(9, 10, 'ArrowDown', 2), 9)
  assert.equal(moverFoco(4, 10, 'End', 2), 9)
  assert.equal(moverFoco(4, 10, 'a', 2), null)
})
