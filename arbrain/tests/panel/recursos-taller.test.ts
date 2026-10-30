import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { frase, haceUnaHora, jornada, leerLineas, mesa, momentos, salud, trabaja, type LineaVigia } from '../../src/features/cabina/panel/recursos-modelo'
import { indiceCompleto } from '../../src/features/cabina/panel/orden-taller'

const T0 = Date.parse('2026-10-15T08:00:00-06:00')
const linea = (min: number, x: Partial<LineaVigia> = {}): LineaVigia => ({
  ts: new Date(T0 + min * 60_000).toISOString(), presion: 1, libre_pct: 70, swap_gb: 4, cpu_pct: 10, disco_gb: 78, gpu_pct: null,
  comp: { macos: [8000, 120, 700], agentes: [1500, 30, 30], colima: [4800, 20, 3], escritorio: [2500, 40, 13] }, alertas: [], ...x,
})

test('leerLineas tolera la primera línea cortada y líneas rotas', () => {
  const texto = 'a": 1}\n' + JSON.stringify(linea(0)) + '\n{roto\n' + JSON.stringify(linea(1)) + '\n'
  assert.equal(leerLineas(texto).length, 2)
})

test('jornada promedia por intervalo, pasa CPU a % de la máquina y no inventa huecos', () => {
  const ls = [linea(0, { cpu_pct: 10 }), linea(1, { cpu_pct: 30 }), linea(30, { cpu_pct: 50 })]
  const s = jornada(ls, { ramMb: 32768, nucleos: 10, ahora: T0 + 31 * 60_000, horas: 1, pasoMin: 5 })
  assert.equal(s.length, 2)
  assert.equal(s[0].cpu, 20)
  assert.equal(s[0].comp.agentes[1], 3) // 30 % de un núcleo / 10 núcleos
  assert.equal(s[0].usado, Math.round(32768 * 0.3))
  assert.equal(s[0].gpu, null) // sin medir no es cero
})

test('salud usa los umbrales del vigía', () => {
  assert.equal(salud(linea(0), 0).tono, 'sana')
  assert.equal(salud(linea(0, { disco_gb: 30 }), 0).tono, 'atenta')
  assert.equal(salud(linea(0, { disco_gb: 10 }), 0).tono, 'apretada')
  assert.equal(salud(linea(0, { alertas: ['memoria'] }), 0).tono, 'apretada')
  assert.equal(salud(linea(0), 20 * 60_000).tono, 'sin-dato')
})

test('mesa: orden del taller, esfuerzo en % de la máquina; macOS nunca «trabaja»', () => {
  const m = mesa(linea(0), 10)
  assert.deepEqual(m.map(p => p.id), ['agentes', 'escritorio', 'colima', 'macos'])
  assert.equal(m.find(p => p.id === 'macos')!.esfuerzo, 12)
  assert.equal(trabaja(m.find(p => p.id === 'macos')!), false)
  assert.equal(trabaja(m.find(p => p.id === 'escritorio')!), true)
  assert.match(frase(salud(linea(0), 0), linea(0), m), /calma/)
})

test('momentos señala empujones claros, uno por hora, con quién empujó', () => {
  const ls = Array.from({ length: 120 }, (_, i) => linea(i, i === 30 ? { cpu_pct: 70, comp: { agentes: [9000, 600, 40], macos: [8000, 100, 700] } } : {}))
  const s = jornada(ls, { ramMb: 32768, nucleos: 10, ahora: T0 + 120 * 60_000, horas: 3, pasoMin: 1 })
  const m = momentos(s)
  assert.equal(m.length, 1)
  assert.equal(m[0].quien, 'agentes')
})

test('haceUnaHora cuenta lo que cambió (o que nada se movió)', () => {
  const quieto = Array.from({ length: 70 }, (_, i) => linea(i))
  const s = jornada(quieto, { ramMb: 32768, nucleos: 10, ahora: T0 + 70 * 60_000, horas: 2, pasoMin: 1 })
  assert.match(haceUnaHora(s, s.at(-1)!, s.at(-1)!.t)!, /nada se movió/)
  const sube = Array.from({ length: 70 }, (_, i) => linea(i, i > 60 ? { cpu_pct: 60, libre_pct: 50 } : {}))
  const s2 = jornada(sube, { ramMb: 32768, nucleos: 10, ahora: T0 + 70 * 60_000, horas: 2, pasoMin: 1 })
  assert.match(haceUnaHora(s2, s2.at(-1)!, s2.at(-1)!.t)!, /trabaja más/)
})

test('indiceCompleto respeta las secciones ocultas al reordenar', () => {
  const orden = ['taller', 'miembros', 'encendido', 'casa', 'sistema']
  const visibles = ['taller', 'miembros', 'encendido', 'sistema'] // casa sin nada que mostrar
  assert.equal(indiceCompleto(orden, visibles, 'taller', 3), 4) // al final: después de sistema
  assert.equal(indiceCompleto(orden, visibles, 'sistema', 0), 0)
  assert.equal(indiceCompleto(orden, visibles, 'taller', 2), 3) // antes de sistema (casa queda antes)
})
