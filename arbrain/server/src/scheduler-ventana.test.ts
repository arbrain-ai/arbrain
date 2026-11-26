import { describe, expect, it } from 'vitest'
import { ventanaReinicio } from './scheduler.js'

// 15 nov 2026: el restart guard fijo de 30 min se saltaba una corrida sí y una no del pulso del cuartel (HH:07 y HH:37).
describe('ventanaReinicio', () => {
  it('mitad del periodo en rutinas de menos de una hora', () => {
    expect(ventanaReinicio('7,37 * * * *')).toBe(900)
    expect(ventanaReinicio('*/10 * * * *')).toBe(300)
    expect(ventanaReinicio('*/5 * * * *')).toBe(150)
  })
  it('las de una hora o más quedan con los 30 min de siempre', () => {
    expect(ventanaReinicio('0 * * * *')).toBe(1800)
    expect(ventanaReinicio('25 3,9,15,21 * * *')).toBe(1800)
    expect(ventanaReinicio('10 4,16 * * *')).toBe(1800)
  })
  it('una expresión inválida cae a 30 min', () => {
    expect(ventanaReinicio('no es cron')).toBe(1800)
  })
  it('el pulso que arrancó 16:38:05 sí corre a las 17:07:46', () => {
    const ultima = Date.parse('2026-11-15T16:38:05-06:00') / 1000
    const ahora = Date.parse('2026-11-15T17:07:46-06:00') / 1000
    expect(ultima <= ahora - ventanaReinicio('7,37 * * * *')).toBe(true)
  })
})
