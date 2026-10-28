// Detener y Responder desde el tablero (27 oct 2026): validan lo del navegador y usan la misma vía que Levy.
import { describe, it, expect, vi } from 'vitest'
import { accionTablero, mensajeDelDueno, pedidoTablero } from './acciones-tablero.js'

describe('acciones del tablero', () => {
  it('valida agente y texto', () => {
    expect(pedidoTablero({ que: 'detener', agente: 900300 })).toEqual({ accion: 'detener', agente: 900300 })
    expect(pedidoTablero({ que: 'detener', agente: 'x' })).toEqual({ error: 'Falta el agente.' })
    expect(pedidoTablero({ que: 'responder', agente: 1, texto: '  ' })).toEqual({ error: 'Escribe el mensaje para el agente.' })
    expect(pedidoTablero({ que: 'responder', agente: 1, texto: 'a'.repeat(4001) })).toMatchObject({ error: expect.stringMatching(/demasiado largo/) })
    expect(pedidoTablero({ que: 'borrar', agente: 1 })).toEqual({ error: 'Acción desconocida.' })
  })
  it('detener y responder llaman a detener/retomar; el mensaje dice que viene del dueño', async () => {
    const puerto = { detener: vi.fn(async () => ({ estaba: true })), retomar: vi.fn(async () => ({ encolado: false, confirmado: true, enVivo: true })) }
    expect(await accionTablero({ accion: 'detener', agente: 7 }, puerto)).toEqual({ ok: true, texto: 'Detenido. Su sesión sigue: un mensaje lo reanuda.' })
    expect(puerto.detener).toHaveBeenCalledWith(7)
    const r = await accionTablero({ accion: 'responder', agente: 7, texto: 'usa la rama B' }, puerto)
    expect(r).toMatchObject({ ok: true, texto: expect.stringMatching(/turno en curso/) })
    expect(puerto.retomar).toHaveBeenCalledWith(7, mensajeDelDueno('usa la rama B'))
    expect(mensajeDelDueno('x')).toMatch(/^\[Mensaje de .+ desde el Taller\] x$/)
  })
  it('un error del registro (no es de Levy, ya cerró) vuelve como 409 con su texto', async () => {
    const puerto = { detener: async () => { throw new Error('Ese subagente no es de Levy, no es sin pantalla o ya se cerró.') }, retomar: vi.fn() }
    expect(await accionTablero({ accion: 'detener', agente: 7 }, puerto)).toEqual({ ok: false, status: 409, error: 'Ese subagente no es de Levy, no es sin pantalla o ya se cerró.' })
  })
})
