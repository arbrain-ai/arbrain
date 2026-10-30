// Detener y Responder desde el tablero (27 oct 2026): validan lo del navegador y usan la misma vía que Levy.
import { describe, it, expect, vi } from 'vitest'
import { accionTablero, MAX_MENSAJE, mensajeComentarios, mensajeDelDueno, pedidoTablero } from './acciones-tablero.js'

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
  it('responder con esfuerzo («Reintentar con más esfuerzo», 29 oct 2026) lo valida y lo pasa a retomar', async () => {
    expect(pedidoTablero({ que: 'responder', agente: 3, texto: 'otra vez', esfuerzo: 'high' })).toEqual({ accion: 'responder', agente: 3, texto: 'otra vez', esfuerzo: 'high' })
    expect(pedidoTablero({ que: 'responder', agente: 3, texto: 'otra vez', esfuerzo: 'turbo' })).toMatchObject({ error: expect.stringMatching(/Esfuerzo desconocido/) })
    const vistos: unknown[] = []
    const r = await accionTablero({ accion: 'responder', agente: 3, texto: 'otra vez', esfuerzo: 'high' }, { detener: async () => ({ estaba: false }), retomar: async (...a) => { vistos.push(a); return { encolado: false, confirmado: true } } })
    expect(vistos).toEqual([[3, mensajeDelDueno('otra vez'), { esfuerzo: 'high' }]])
    expect(r).toEqual({ ok: true, texto: 'Le llegó: empezó un turno nuevo con tu mensaje, con esfuerzo high.' })
  })
})

// Comentarios en lote sobre el entregable y planes versionados (29 oct 2026, ideas 3 y 4 del reporte de Warp).
describe('comentarios en lote', () => {
  const cs = [
    { ruta: 'docs/reporte.md', linea: 40, cita: 'La renta de la idea 5 es menor porque Daniel vive poco en la terminal.', texto: 'Quita esta frase, no aporta.' },
    { ruta: 'arbrain/server/src/a.ts', linea: 12, cita: 'const x = 1', texto: 'Ponle nombre en español.' },
    { ruta: 'docs/reporte.md', linea: 3, texto: 'El título dice 4 ideas, son 5.' },
  ]
  it('valida el lote: archivo y texto en cada uno, tope y que quepa en un mensaje', () => {
    expect(pedidoTablero({ que: 'comentarios', agente: 9, comentarios: cs })).toMatchObject({ accion: 'comentarios', agente: 9, comentarios: expect.arrayContaining([expect.objectContaining({ ruta: 'docs/reporte.md', linea: 3 })]) })
    expect(pedidoTablero({ que: 'comentarios', agente: 9, comentarios: [] })).toEqual({ error: 'No hay comentarios que mandar.' })
    expect(pedidoTablero({ que: 'comentarios', agente: 9, comentarios: [{ ruta: 'a', texto: '' }] })).toMatchObject({ error: expect.stringMatching(/sin archivo o sin texto/) })
    expect(pedidoTablero({ que: 'comentarios', agente: 9, comentarios: Array.from({ length: 31 }, () => cs[0]) })).toMatchObject({ error: expect.stringMatching(/máximo/) })
    expect(pedidoTablero({ que: 'comentarios', agente: 'x', comentarios: cs })).toEqual({ error: 'Falta el agente.' })
  })
  it('UN mensaje, ordenado por archivo y línea, con lo citado y el pedido; dice de quién viene', () => {
    const m = mensajeComentarios(cs)
    expect(m).toMatch(/^\[3 comentarios de .+ desde el Taller sobre tu entregable\] Atiéndelos todos en este turno/)
    expect(m.indexOf('1. arbrain/server/src/a.ts, línea 12')).toBeGreaterThan(0)
    expect(m.indexOf('2. docs/reporte.md, línea 3')).toBeGreaterThan(m.indexOf('1. arbrain'))
    expect(m.indexOf('3. docs/reporte.md, línea 40')).toBeGreaterThan(m.indexOf('2. docs'))
    expect(m).toContain('> La renta de la idea 5 es menor')
    expect(m).toContain('Quita esta frase, no aporta.')
  })
  it('si no cabe con las citas enteras, las recorta antes de rendirse', () => {
    const largos = Array.from({ length: 12 }, (_, i) => ({ ruta: `docs/a${i}.md`, linea: i + 1, cita: 'palabra '.repeat(80), texto: 'Cámbialo por algo más corto y concreto.' }))
    const m = mensajeComentarios(largos)
    expect(m.length).toBeLessThanOrEqual(MAX_MENSAJE)
    expect(m).toContain('12. docs/a9.md')
    expect(() => mensajeComentarios(Array.from({ length: 30 }, (_, i) => ({ ruta: `docs/${'x'.repeat(100)}${i}.md`, texto: 'y'.repeat(200) })))).toThrow(/dos tandas/)
  })
  it('se entrega por retomar (la misma vía que Responder) y dice cuántos llegaron', async () => {
    const puerto = { detener: vi.fn(), retomar: vi.fn(async () => ({ encolado: true, confirmado: true })) }
    const r = await accionTablero({ accion: 'comentarios', agente: 7, comentarios: cs }, puerto as never)
    expect(r).toEqual({ ok: true, texto: 'Tus 3 comentarios quedaron en su cola: los toma al terminar el paso.' })
    expect(puerto.retomar).toHaveBeenCalledTimes(1)
    expect(puerto.retomar).toHaveBeenCalledWith(7, mensajeComentarios(cs))
  })
})

describe('planes desde el Taller', () => {
  it('solo rutas de docs/planes', () => {
    expect(pedidoTablero({ que: 'correr-plan', ruta: 'docs/planes/2026-10-29-x.md' })).toEqual({ accion: 'correr-plan', ruta: 'docs/planes/2026-10-29-x.md' })
    expect(pedidoTablero({ que: 'descartar-plan', ruta: '../CLAUDE.md' })).toMatchObject({ error: expect.stringMatching(/docs\/planes/) })
  })
  it('correr y descartar usan plan.ts por el puerto', async () => {
    const puerto = { detener: vi.fn(), retomar: vi.fn(), correrPlan: vi.fn(async () => ({ id: 900777, commit: 'abc' })), descartarPlan: vi.fn(async () => ({ commit: 'def' })) }
    expect(await accionTablero({ accion: 'correr-plan', ruta: 'docs/planes/a.md' }, puerto as never)).toMatchObject({ ok: true, texto: expect.stringMatching(/agente 900777.*aprobada en git/) })
    expect(await accionTablero({ accion: 'descartar-plan', ruta: 'docs/planes/a.md' }, puerto as never)).toMatchObject({ ok: true, texto: expect.stringMatching(/descartado/) })
    const falla = { ...puerto, correrPlan: vi.fn(async () => { throw new Error('No existe el plan docs/planes/a.md.') }) }
    expect(await accionTablero({ accion: 'correr-plan', ruta: 'docs/planes/a.md' }, falla as never)).toEqual({ ok: false, status: 409, error: 'No existe el plan docs/planes/a.md.' })
  })
})
