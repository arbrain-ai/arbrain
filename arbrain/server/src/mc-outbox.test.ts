import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { McOutbox, ALERTA_TRAS } from './mc-outbox.js'

function banco(respuestas: Array<{ ok: boolean; status?: number }>) {
  let t = Date.parse('2026-09-30T15:02:00Z')
  const recibidos: string[] = [], alertas: string[] = []
  const box = new McOutbox(new Database(':memory:'), async p => { recibidos.push(String(p.runId)); return respuestas.shift() ?? { ok: true } }, () => t, p => alertas.push(p.runId))
  return { box, recibidos, alertas, avanzar: (min: number) => { t += min * 60_000 } }
}

describe('mc-outbox', () => {
  it('entrega directa: nada queda pendiente', async () => {
    const b = banco([{ ok: true, status: 200 }])
    expect(await b.box.entregar({ runId: 'r1', prompt: 'morning-briefing' })).toBe(true)
    expect(b.box.pendientes()).toHaveLength(0)
  })
  it('webhook caído: queda en cola y se entrega al volver, sin duplicar', async () => {
    const b = banco([{ ok: false, status: 503 }, { ok: false, status: 503 }, { ok: true, status: 200 }])
    expect(await b.box.entregar({ runId: 'r2', prompt: 'morning-briefing' })).toBe(false)
    expect(b.box.pendientes()).toMatchObject([{ runId: 'r2', attempts: 1 }])
    expect(await b.box.procesar()).toBe(0)            // aún no vence la espera
    b.avanzar(1); expect(await b.box.procesar()).toBe(0)  // segundo fallo
    b.avanzar(2); expect(await b.box.procesar()).toBe(1)  // vuelve el webhook
    expect(b.box.pendientes()).toHaveLength(0)
    expect(b.recibidos).toEqual(['r2', 'r2', 'r2'])
    await b.box.entregar({ runId: 'r2', prompt: 'morning-briefing' })   // mismo runId: ya entregado
    expect(b.recibidos).toHaveLength(3)
  })
  it('alerta una sola vez al tercer fallo y muere a las 48 h', async () => {
    const b = banco(Array.from({ length: 50 }, () => ({ ok: false, status: 400 })))
    await b.box.entregar({ runId: 'r3', prompt: 'business-council' })
    for (let i = 0; i < ALERTA_TRAS + 3; i++) { b.avanzar(61); await b.box.procesar() }
    expect(b.alertas).toEqual(['r3'])
    b.avanzar(48 * 60); await b.box.procesar()
    expect(b.box.pendientes()[0].dead).toBe(true)
  })
})
