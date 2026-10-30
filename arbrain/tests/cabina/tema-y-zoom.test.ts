import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { inyectarTema, temaDoc } from '../../src/features/cabina/documento/tema-html'
import { horaMexico, temaPorHora } from '../../src/shared/lib/tema-por-hora'
import { acotar, factorRueda, ZOOM_MAX, ZOOM_MIN } from '../../src/features/cabina/panel/zoom-pestana'

test('tema por hora: claro 06:00-18:59, oscuro 19:00-05:59', () => {
  assert.deepEqual([5, 6, 12, 18, 19, 23, 0].map(temaPorHora), ['dark', 'light', 'light', 'light', 'dark', 'dark', 'dark'])
})
test('tema por hora usa la hora de México, no la del equipo', () => {
  assert.equal(horaMexico(new Date('2026-10-05T01:00:00Z')), 19)
  assert.equal(horaMexico(new Date('2026-10-04T12:00:00Z')), 6)
})
test('HTML del panel: inyecta tema y puente de zoom tras <head>; oscuro por defecto', () => {
  const out = inyectarTema('<!doctype html><html><head><title>x</title></head><body></body></html>', 'claro')
  assert.ok(out.includes('<head><script>') && out.includes('a("claro")') && out.includes('arbrain-rueda') && out.includes('arbrain-zoom'))
  assert.equal(temaDoc(null), 'oscuro')
  assert.equal(temaDoc('x'), 'oscuro')
  assert.ok(inyectarTema('<p>hola</p>', 'oscuro').startsWith('<script>'))
})
test('zoom de pestaña: acotado y parejo', () => {
  assert.equal(acotar(9), ZOOM_MAX); assert.equal(acotar(0.1), ZOOM_MIN)
  assert.ok(factorRueda(100) < 1 && factorRueda(-100) > 1 && factorRueda(500) === factorRueda(50))
})
