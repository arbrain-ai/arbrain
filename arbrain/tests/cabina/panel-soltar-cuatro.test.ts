import { test } from 'node:test'
import { strict as assert } from 'node:assert'

const mem = new Map<string, string>()
const g = globalThis as unknown as Record<string, unknown>
g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) }, removeItem: (k: string) => { mem.delete(k) }, clear: () => mem.clear(), key: () => null, length: 0 }
g.sessionStorage = g.localStorage

const RUTA_ABS = '/Users/tu-usuario/Developer/artificial-brain/docs/guardados/plan-octubre-2026/index.html'
const RUTA_REL = 'docs/guardados/plan-octubre-2026/index.html'

async function panelDelCinco() {
  const { usePanelFijadas } = await import('../../src/features/cabina/panel/fijadas')
  const bus = await import('../../src/features/cabina/panel/bus')
  const st = () => usePanelFijadas.getState()
  mem.clear()
  usePanelFijadas.setState({ fijadas: [], orden: ['tareas'], taller: true, activa: 'tareas', cargado: true })
  // 5 oct 07:43: dos «Calendario» (uno vino de Objetivos), el documento Octubre y el lienzo Customer Journey.
  usePanelFijadas.setState({ fijadas: [
    { id: 'mano-cal-a', input: { vista: 'calendario', alcance: 'mes' } as never, en: 1 },
    { id: 'levy-cal-b', input: { vista: 'calendario', alcance: 'semana' } as never, en: 2, deLevy: true },
    { id: 'levy-octubre', input: { vista: 'documento', ruta: RUTA_ABS, titulo: 'Octubre' } as never, en: 3, deLevy: true },
    { id: 'levy-journey', input: { vista: 'lienzo', paginaId: 'customer-journey', titulo: 'Customer Journey' } as never, en: 4, deLevy: true },
  ], orden: ['tareas', 'mano-cal-a', 'levy-cal-b', 'levy-octubre', 'levy-journey'], activa: 'levy-octubre' })
  return { st, ...bus }
}

test('caso del 5 oct: soltar el documento Octubre (ruta relativa) solo cierra esa pestaña', async () => {
  const { st, aplicar } = await panelDelCinco()
  const a = aplicar({ id: 'c1', accion: 'soltar', input: { vista: 'documento', ruta: RUTA_REL, soltar: true } as never })
  assert.equal(a.ok, true)
  assert.deepEqual(a.cerradas, ['Octubre'])
  assert.deepEqual(st().fijadas.map(f => f.id), ['mano-cal-a', 'levy-cal-b', 'levy-journey'])
  assert.deepEqual(a.pestanas.map(p => p.titulo), ['Calendario', 'Calendario', 'Customer Journey'])
  assert.notEqual(st().activa, 'levy-octubre')
})

test('soltar sin coincidencia no toca nada y lo dice', async () => {
  const { st, aplicar } = await panelDelCinco()
  const antes = st().fijadas.map(f => f.id)
  const a = aplicar({ id: 'c2', accion: 'soltar', input: { vista: 'documento', ruta: 'docs/otro/index.html', soltar: true } as never })
  assert.equal(a.ok, true); assert.deepEqual(a.cerradas, [])
  assert.match(a.detalle, /no había ninguna pestaña que coincida.*no cerré nada/)
  assert.deepEqual(st().fijadas.map(f => f.id), antes)
  // un lienzo de otra página tampoco cierra el Customer Journey
  const b = aplicar({ id: 'c3', accion: 'soltar', input: { vista: 'lienzo', paginaId: 'otra-pagina', soltar: true } as never })
  assert.deepEqual(b.cerradas, []); assert.deepEqual(st().fijadas.map(f => f.id), antes)
})

test('soltar por id de pestaña cierra solo esa, aunque haya dos con el mismo título', async () => {
  const { st, aplicar } = await panelDelCinco()
  const a = aplicar({ id: 'c4', accion: 'soltar', input: { vista: 'calendario', pestana: 'levy-cal-b', soltar: true } as never })
  assert.deepEqual(a.cerradas, ['Calendario'])
  assert.deepEqual(st().fijadas.map(f => f.id), ['mano-cal-a', 'levy-octubre', 'levy-journey'])
  // id inexistente o de otra vista: nada
  const b = aplicar({ id: 'c5', accion: 'soltar', input: { vista: 'calendario', pestana: 'levy-octubre', soltar: true } as never })
  assert.deepEqual(b.cerradas, []); assert.equal(st().fijadas.length, 3)
  const c = aplicar({ id: 'c6', accion: 'soltar', input: { vista: 'calendario', pestana: 'no-existe', soltar: true } as never })
  assert.deepEqual(c.cerradas, []); assert.equal(st().fijadas.length, 3)
})

test('fijar una vista ya abierta la enfoca en vez de duplicarla (también un documento con otra forma de ruta)', async () => {
  const { st, aplicar } = await panelDelCinco()
  const a = aplicar({ id: 'c7', accion: 'fijar', input: { vista: 'documento', ruta: RUTA_REL, titulo: 'Octubre', fijar: true } as never })
  assert.equal(a.ok, true)
  assert.equal(st().fijadas.filter(f => f.input.vista === 'documento').length, 1)
  assert.equal(st().activa, 'levy-octubre'); assert.equal(st().fijadas.length, 4)
  aplicar({ id: 'c8', accion: 'fijar', input: { vista: 'lienzo', paginaId: 'customer-journey', fijar: true } as never })
  assert.equal(st().fijadas.filter(f => f.input.vista === 'lienzo').length, 1)
  assert.equal(st().activa, 'levy-journey')
})

test('sinDuplicadas funde los dos Calendario guardados (Objetivos + Calendario)', async () => {
  const { sinDuplicadas } = await import('../../src/features/cabina/panel/fijadas')
  const r = sinDuplicadas([
    { id: 'a', input: { vista: 'calendario' } as never, en: 1 }, { id: 'b', input: { vista: 'calendario', alcance: 'mes' } as never, en: 2 },
    { id: 'c', input: { vista: 'documento', ruta: RUTA_ABS } as never, en: 3 }, { id: 'd', input: { vista: 'documento', ruta: RUTA_REL } as never, en: 4 },
  ])
  assert.deepEqual(r.map(f => f.id), ['a', 'c'])
})
