import { describe, expect, it } from 'vitest'
import { callCabina, parseMostrar, CABINA_TOOLS } from './tools.js'

// 2 oct 2026: Levy encuadra una zona del lienzo y abre Calendario/Lienzo como pestañas del panel.
describe('cabina · zona del lienzo', () => {
  it('acepta zona solo en la vista lienzo', () => {
    expect(parseMostrar({ vista: 'lienzo', paginaId: 'pagina-de-prueba', zona: ' ht:op ' })).toMatchObject({ zona: 'ht:op' })
    expect(parseMostrar({ vista: 'lienzo', paginaId: 'abc', zona: '10,20,300,400', fijar: true })).toMatchObject({ zona: '10,20,300,400', fijar: true })
    expect(() => parseMostrar({ vista: 'calendario', zona: 'ht:op' })).toThrow(/zona solo aplica/)
    expect(parseMostrar({ vista: 'lienzo', paginaId: 'abc' }).zona).toBeUndefined()
  })
  it('la confirmación nombra la zona y el esquema la declara', () => {
    expect(callCabina('mostrar', { vista: 'lienzo', paginaId: 'abc', zona: 'tb:whole', fijar: true }).text).toMatch(/zona «tb:whole».*fijada en el panel/)
    const mostrar = CABINA_TOOLS.find(t => t.name === 'mostrar')!
    expect(Object.keys(mostrar.inputSchema.properties)).toContain('zona')
    expect(mostrar.description).toMatch(/notas\.py notas/)
  })
})
