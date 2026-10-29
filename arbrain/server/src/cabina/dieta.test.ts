/**
 * Sensor de la dieta de contexto (27 oct 2026, BRECHA fila 22): lo que la Cabina manda al modelo en CADA turno
 * (descripciones + schemas serializados, como sale en tools/list y en las dynamicTools de Codex) cabe en TOPE_CABINA,
 * y ninguna descripción ni la ayuda a demanda lleva una fecha fija que se vence («del sáb 17 oct»).
 * Tabla de tamaños: `npm run herramientas:tamano`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FECHA_FIJA, TOPE_CABINA, medirHerramientas, textosDe } from './dieta.js'

const previo = process.env.ARBRAIN_EDICION
afterEach(() => { if (previo === undefined) delete process.env.ARBRAIN_EDICION; else process.env.ARBRAIN_EDICION = previo; vi.resetModules() })

async function cargar(edicion: 'cliente' | 'original') {
  vi.resetModules()
  process.env.ARBRAIN_EDICION = edicion
  const t = await import('./tools.js')
  const { handle } = await import('./mcp-stdio.js')
  const lista = ((await handle({ id: 1, method: 'tools/list' })) as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> } }).result.tools
  return { t, lista }
}

describe('dieta de contexto de la Cabina', () => {
  for (const edicion of ['original', 'cliente'] as const) {
    it(`${edicion}: tools/list cabe en ${TOPE_CABINA} caracteres por turno (y las dynamicTools de Codex también)`, async () => {
      const { t, lista } = await cargar(edicion)
      const claude = medirHerramientas(lista)
      const codex = medirHerramientas(t.cabinaDynamicTools())
      const tabla = claude.filas.map(f => `${f.nombre}=${f.total}`).join(' ')
      expect(claude.total, `total ${claude.total}: ${tabla}`).toBeLessThanOrEqual(TOPE_CABINA)
      expect(codex.total).toBeLessThanOrEqual(TOPE_CABINA)
    })

    it(`${edicion}: ninguna descripción ni campo trae una fecha fija que se vence`, async () => {
      const { lista } = await cargar(edicion)
      for (const h of lista) for (const texto of textosDe(h)) expect(texto, h.name).not.toMatch(FECHA_FIJA)
    })
  }

  it('la ayuda a demanda tampoco trae fechas fijas', async () => {
    const { todaLaAyuda } = await import('./ayuda.js')
    for (const texto of todaLaAyuda()) expect(texto).not.toMatch(FECHA_FIJA)
  })

  it('el patrón atrapa las fechas que se vencieron antes', () => {
    for (const x of ['la masterclass del sáb 17 oct 12:00', 'hasta el mar 20 oct', 'desde el mié 21 de octubre', 'el vie 30 oct']) expect(x).toMatch(FECHA_FIJA)
    for (const x of ['fecha YYYY-MM-DD', 'cada 5 min', 'el 25 oct 2026 se firmó', 'marca 3 casillas']) expect(x).not.toMatch(FECHA_FIJA)
  })

  it('ayuda devuelve el detalle que salió de las descripciones', async () => {
    const { t } = await cargar('original')
    const indice = await t.ejecutarCabina('ayuda', {})
    expect(indice.text).toMatch(/Temas de ayuda/)
    expect((await t.ejecutarCabina('ayuda', { tema: 'cohorte' })).text).toMatch(/Entrega/)
    expect((await t.ejecutarCabina('ayuda', { tema: 'documento' })).text).toMatch(/entrega\.json/)
    expect((await t.ejecutarCabina('ayuda', { tema: 'delegar' })).text).toMatch(/wt\.sh nuevo/)
    expect((await t.ejecutarCabina('ayuda', { tema: 'campos_delegar' })).text).toMatch(/claude-opus-5-5/)
    expect((await t.ejecutarCabina('ayuda', { tema: 'mostrar' })).text).toMatch(/servidores \(/)
    expect((await t.ejecutarCabina('ayuda', { tema: 'nada-de-esto' })).text).toMatch(/No hay ayuda para «nada-de-esto»/)
  })
})
