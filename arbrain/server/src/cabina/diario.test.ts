import { describe, expect, it } from 'vitest'
import { crearLector, pedidoDe, VIDA_MS } from './diario.js'
import { parseMostrar } from './tools.js'
import { PERSONAS, PERSONA_DUENO } from '../dueno.js'

// Personas de la instalación (en la copia del alumno solo existe el dueño).
const D = PERSONA_DUENO, O = PERSONAS[1]

// 5 oct 2026: el reporte de la mañana llega como vista viva «diario» y lee sus datos al abrirse.
describe('cabina · diario', () => {
  it('valida quién y la fecha', () => {
    expect(pedidoDe({})).toEqual({ quien: D, fecha: undefined })
    if (O) expect(pedidoDe({ quien: O, fecha: '2026-10-05' })).toEqual({ quien: O, fecha: '2026-10-05' })
    expect(pedidoDe({ quien: 'fulano' })).toBeNull()
    expect(pedidoDe({ fecha: '5 oct' })).toBeNull()
  })

  it('guarda la lectura su vida y comparte una corrida en curso', async () => {
    let t = 0, corridas = 0
    const leer = crearLector(async () => { corridas++; return { n: corridas } }, () => t)
    const [a, b] = await Promise.all([leer({ quien: D }), leer({ quien: D })])
    expect(a).toEqual({ n: 1 }); expect(b).toEqual({ n: 1 }); expect(corridas).toBe(1)
    t = VIDA_MS - 1; expect(await leer({ quien: D })).toEqual({ n: 1 })
    t = VIDA_MS + 1; expect(await leer({ quien: D })).toEqual({ n: 2 })
    expect(await leer({ quien: D }, true)).toEqual({ n: 3 })
    expect(await leer({ quien: O ?? 'otra' })).toEqual({ n: 4 })
  })

  it('un fallo no se guarda: la siguiente apertura reintenta', async () => {
    let falla = true
    const leer = crearLector(async () => { if (falla) throw new Error('Polar caído'); return { ok: 1 } })
    await expect(leer({ quien: D })).rejects.toThrow('Polar caído')
    falla = false
    expect(await leer({ quien: D })).toEqual({ ok: 1 })
  })

  it('mostrar acepta la vista diario y quien solo ahí', () => {
    expect(parseMostrar({ vista: 'diario', fecha: '2026-10-05', quien: D })).toMatchObject({ vista: 'diario', quien: D })
    expect(() => parseMostrar({ vista: 'calendario', quien: D })).toThrow(/quien solo aplica/)
  })
})
