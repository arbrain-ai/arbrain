import { describe, expect, it } from 'vitest'
import { GRACIA_DUENO_MS, GRACIA_NADIE_MS, vencidos } from './barrendero.js'
import type { Proceso } from './procesos.js'

const p = (firma: string, clase: Proceso['clase'], tipo?: 'agente' | 'nadie'): Proceso => ({
  pid: Number(firma.split(':')[0]), puertos: [9000], nombre: 'x', clase, desde: '', web: false, firma,
  ...(tipo ? { dueno: { tipo, nombre: tipo, vivo: false } } : {}),
})

describe('barrendero', () => {
  it('no apaga en la primera vista, sí al cumplir la gracia del dueño cerrado', () => {
    const v = new Map<string, number>()
    expect(vencidos([p('1:1', 'huerfano', 'agente')], v, 0)).toEqual([])
    expect(vencidos([p('1:1', 'huerfano', 'agente')], v, GRACIA_DUENO_MS - 1)).toEqual([])
    expect(vencidos([p('1:1', 'huerfano', 'agente')], v, GRACIA_DUENO_MS).map(x => x.firma)).toEqual(['1:1'])
  })
  it('sin dueño espera la gracia larga', () => {
    const v = new Map<string, number>()
    vencidos([p('2:1', 'huerfano', 'nadie')], v, 0)
    expect(vencidos([p('2:1', 'huerfano', 'nadie')], v, GRACIA_DUENO_MS)).toEqual([])
    expect(vencidos([p('2:1', 'huerfano', 'nadie')], v, GRACIA_NADIE_MS)).toHaveLength(1)
  })
  it('nunca toca lo que no es huérfano y olvida al que recuperó dueño', () => {
    const v = new Map<string, number>()
    vencidos([p('3:1', 'huerfano', 'agente')], v, 0)
    expect(vencidos([p('3:1', 'conversacion'), p('4:1', 'sistema')], v, GRACIA_NADIE_MS)).toEqual([])
    expect(v.size).toBe(0)
    // vuelve a ser huérfano: la cuenta empieza de nuevo
    expect(vencidos([p('3:1', 'huerfano', 'agente')], v, GRACIA_NADIE_MS)).toEqual([])
  })
})
