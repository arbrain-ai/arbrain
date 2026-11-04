/**
 * El marco y la franja del encargo (3 nov 2026): el encargo enciende el marco al empezar, lo sostiene con un latido, y lo
 * corta si la persona pulsa «Detener» o «Tomar el control» en la franja (ArbrainManos) o en su espejo de la
 * conversación (orden en disco). El agente recibe un error con nombre que le dice no reintentar.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Adaptador } from './contrato.js'
import { ejecutarEncargar } from './encargar.js'

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))
let previo: Record<string, string | undefined>

beforeAll(() => {
  previo = { d: process.env.MANOS_ENCARGOS_DIR, l: process.env.MANOS_LATIDO_MARCO_MS }
  process.env.MANOS_ENCARGOS_DIR = mkdtempSync(join(tmpdir(), 'marco-encargo-'))
  process.env.MANOS_LATIDO_MARCO_MS = '50'
})
afterAll(() => {
  process.env.MANOS_ENCARGOS_DIR = previo.d
  process.env.MANOS_LATIDO_MARCO_MS = previo.l
})

/** Adaptador con `borde` como el de la casa: anota cada llamada; `detener` simula el clic en la franja. */
function conBorde() {
  const llamadas: any[] = []
  let detenida: string | undefined
  const a = {
    nombre: 'falso',
    borde: async (p: any) => { llamadas.push(p); return detenida && !p.apagar ? { esta_detenida: detenida } : { visible: !p.apagar } },
    soltar: async () => { llamadas.push({ soltar: true }) },
  } as unknown as Adaptador
  return { a, llamadas, detener: (m: string) => { detenida = m } }
}

/** Un cerebro que «piensa» hasta que lo corten (o 3 s). */
const lento = async (_p: string, op: any) => {
  const t0 = Date.now()
  while (!op.senal?.aborted && Date.now() - t0 < 3000) await dormir(20)
  return { ok: !op.senal?.aborted, estado: op.senal?.aborted ? 'fallo' : 'hecho', intentos: [], id: 'x', ms: Date.now() - t0, detalle: 'listo', pasos: [] } as any
}

describe('marco del encargo', () => {
  it('se enciende al empezar (nuevo) y se sostiene con latidos; al terminar se suelta', async () => {
    const { a, llamadas } = conBorde()
    const r = await ejecutarEncargar({ pedido: 'algo', cita: 'haz algo' }, { manos: a, decisor: () => ({}) as any, pedir: async (_p, op) => { await dormir(220); return lento('', { senal: { aborted: true } }) } })
    expect(llamadas[0]).toMatchObject({ encender: true, nuevo: true })
    expect(llamadas.filter(l => l.encender && !l.nuevo).length).toBeGreaterThanOrEqual(2)
    expect(llamadas.at(-1)).toEqual({ soltar: true })
    expect(r.respuesta?.detenido_por).toBeUndefined()
  })

  it('«Detener» en la franja corta el encargo con detenido_por_persona', async () => {
    const { a, detener } = conBorde()
    setTimeout(() => detener('detener'), 120)
    const t0 = Date.now()
    const r = await ejecutarEncargar({ pedido: 'algo', cita: 'haz algo' }, { manos: a, decisor: () => ({}) as any, pedir: lento })
    expect(Date.now() - t0).toBeLessThan(1500)
    expect(r.respuesta?.detenido_por).toBe('detenido_por_persona')
    expect(r.respuesta?.resultado).toMatch(/No reintentes/)
  })

  it('«Tomar el control» devuelve persona_tiene_el_control', async () => {
    const { a, detener } = conBorde()
    setTimeout(() => detener('control'), 120)
    const r = await ejecutarEncargar({ pedido: 'algo', cita: 'haz algo' }, { manos: a, decisor: () => ({}) as any, pedir: lento })
    expect(r.respuesta?.detenido_por).toBe('persona_tiene_el_control')
  })

  it('la franja espejada en la conversación (orden en disco) también lo corta y apaga el marco', async () => {
    const { a, llamadas } = conBorde()
    setTimeout(() => {
      const dir = process.env.MANOS_ENCARGOS_DIR!
      const f = readdirSync(dir).find(n => n.endsWith('.json') && readFileSync(join(dir, n), 'utf8').includes('"en_curso"'))!
      writeFileSync(join(process.env.MANOS_ENCARGOS_DIR!, f.replace(/\.json$/, '.detener')), 'detener')
    }, 150)
    const r = await ejecutarEncargar({ pedido: 'algo', cita: 'haz algo' }, { manos: a, decisor: () => ({}) as any, pedir: lento })
    expect(r.respuesta?.detenido_por).toBe('detenido_por_persona')
    expect(llamadas.some(l => l.apagar)).toBe(true)
  })
})
