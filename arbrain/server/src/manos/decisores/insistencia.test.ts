import { describe, it, expect } from 'vitest'
import type { Decisor, PedidoDecidir } from '../contrato.js'
import { Insistencia, PARADA, REGLA_INSISTENCIA, recorrerLista, type Camino } from './insistencia.js'
import { handle } from '../mcp-stdio.js'
import { SISTEMA_CEREBRO } from '../cerebro.js'

/**
 * Lista virtual estilo X: solo están montados los elementos de la ventana visible. `pasoRueda` es cuánto baja
 * una rueda (si es mayor que la ventana, se salta elementos); `caminosVivos` dice qué caminos mueven la lista.
 */
function listaVirtual(total: number, op: { ventana?: number; pasoRueda?: number; pasoTecla?: number; caminosVivos?: Camino[] } = {}) {
  const ventana = op.ventana ?? 5
  let tope = 0
  const vivos = new Set(op.caminosVivos ?? ['rueda', 'teclado', 'extension'])
  const llamadas: Camino[] = []
  return {
    llamadas,
    leer: async () => ({ ids: Array.from({ length: Math.min(ventana, total - tope) }, (_, i) => `p${tope + i + 1}`) }),
    avanzar: async (c: Camino) => {
      llamadas.push(c)
      if (!vivos.has(c)) return true // el camino existe pero no mueve nada (como la rueda en X el 2 oct)
      const paso = c === 'rueda' ? (op.pasoRueda ?? 3) : (op.pasoTecla ?? 2)
      tope = Math.min(Math.max(total - ventana, 0), tope + paso)
      return true
    },
    retroceder: async () => { tope = Math.max(0, tope - 3) },
  }
}

describe('regla de insistencia: listas largas y virtuales', () => {
  it('regresión 2 oct: la rueda no baja en X → prueba el teclado y llega al 6.º (no se rinde en el 3.º)', async () => {
    const l = listaVirtual(30, { ventana: 3, caminosVivos: ['teclado'] })
    const r = await recorrerLista({ objetivo: 6, ...l })
    expect(r.ok).toBe(true)
    expect(r.ids[5]).toBe('p6')
    expect(l.llamadas.slice(0, PARADA.sinAvancePorCamino)).toEqual(['rueda', 'rueda'])
    expect(l.llamadas).toContain('teclado')
  })

  it('un salto de rueda que desmonta elementos no cuenta: retrocede y el 6.º es el verdadero', async () => {
    const l = listaVirtual(40, { ventana: 4, pasoRueda: 7 })
    const r = await recorrerLista({ objetivo: 6, ...l })
    expect(r.ok).toBe(true)
    expect(r.ids.slice(0, 6)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])
  })

  it('parada explícita: la lista solo tiene 4 → para tras agotar cada camino y dice cuáles probó', async () => {
    const l = listaVirtual(4, { ventana: 5 })
    const r = await recorrerLista({ objetivo: 6, ...l })
    expect(r.ok).toBe(false)
    expect(r.ids).toHaveLength(4)
    expect(r.motivo).toMatch(/caminos sin avance/)
    expect(r.intentos.length).toBe(3 * PARADA.sinAvancePorCamino)
    expect(r.resumen).toMatch(/rueda ×2.*teclado ×2.*extension ×2/)
  })

  it('parada por intentos y por presupuesto de tiempo', async () => {
    let ahora = 0
    const lenta = listaVirtual(1000, { ventana: 2, pasoRueda: 1 })
    const r = await recorrerLista({ objetivo: 999, ...lenta, parada: { ...PARADA, intentosMax: 5 } })
    expect(r.motivo).toBe('5 intentos sin lograrlo')
    const r2 = await recorrerLista({ objetivo: 999, ...listaVirtual(1000, { ventana: 2, pasoRueda: 1 }), reloj: () => (ahora += 40_000) })
    expect(r2.motivo).toMatch(/presupuesto/)
  })
})

describe('regla de insistencia: el siguiente camino', () => {
  it('repite el camino que avanza y salta al siguiente tras 2 sin avance', () => {
    const ins = new Insistencia()
    expect(ins.siguiente()).toMatchObject({ seguir: true, camino: 'rueda' })
    ins.registrar({ camino: 'rueda', avance: true })
    expect(ins.siguiente()).toMatchObject({ seguir: true, camino: 'rueda' })
    ins.registrar({ camino: 'rueda', avance: false })
    expect(ins.siguiente()).toMatchObject({ seguir: true, camino: 'rueda' })
    ins.registrar({ camino: 'rueda', avance: false })
    expect(ins.siguiente()).toMatchObject({ seguir: true, camino: 'teclado' })
    expect(ins.siguiente(true)).toEqual({ seguir: false, motivo: 'objetivo verificado' })
  })

  it('URL directa y buscador entran cuando la interfaz no responde', () => {
    const ins = new Insistencia(['rueda', 'buscador', 'url_directa'])
    for (const c of ['rueda', 'rueda', 'buscador', 'buscador'] as Camino[]) ins.registrar({ camino: c, avance: false })
    expect(ins.siguiente()).toMatchObject({ seguir: true, camino: 'url_directa' })
  })

  it('Jev ordena los caminos con opciones cerradas y sin nada de la pantalla', async () => {
    const vistos: PedidoDecidir[] = []
    const jev: Decisor = { nombre: 'jev', decidir: async p => { vistos.push(p); return { eleccion: 'teclado', confianza: 0.9, decisor: 'jev', ms: 1 } as any } }
    const l = listaVirtual(30, { ventana: 3 })
    const r = await recorrerLista({ objetivo: 6, ...l, decisor: jev })
    expect(r.ok).toBe(true)
    expect(l.llamadas[0]).toBe('teclado')
    expect(Object.keys(vistos[0].opciones)).toEqual(['rueda', 'teclado', 'extension'])
    expect(Object.keys(vistos[0].estado as object)).toEqual(['paso'])
    expect(JSON.stringify(vistos[0])).not.toMatch(/p\d/)
  })

  it('si Jev falla, queda el orden por defecto', async () => {
    const roto: Decisor = { nombre: 'jev', decidir: async () => { throw new Error('sin cuota') } }
    const ins = new Insistencia()
    await ins.ordenarCon(roto, { tipo: 'lista' })
    expect(ins.caminos[0]).toBe('rueda')
  })
})

describe('la regla vive en las instrucciones del MCP y en el cerebro', () => {
  it('instrucciones del MCP', async () => {
    const r: any = await handle({ id: 1, method: 'initialize', params: {} })
    expect(r.result.instructions).toContain(REGLA_INSISTENCIA)
  })
  it('sistema del cerebro', () => {
    expect(SISTEMA_CEREBRO).toContain(REGLA_INSISTENCIA)
  })
  it('la regla nombra los cinco caminos y la parada', () => {
    for (const s of ['rueda', 'teclado', 'web_*', 'buscador', 'URL directa', 'Parada explícita', 'freno']) expect(REGLA_INSISTENCIA).toContain(s)
  })
})
