import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AdaptadorCasa } from './casa.js'

/** ArbrainManos falsa: mismo protocolo (JSON por líneas), respuestas fijas. */
let servidor: Server
const ruta = join(mkdtempSync(join(tmpdir(), 'manos-casa-')), 'manos.sock')
const pedidos: any[] = []

beforeAll(async () => {
  servidor = createServer(s => {
    let bufer = ''
    s.setEncoding('utf8')
    s.on('data', (d: string) => {
      bufer += d
      let i: number
      while ((i = bufer.indexOf('\n')) >= 0) {
        const p = JSON.parse(bufer.slice(0, i)); bufer = bufer.slice(i + 1)
        pedidos.push(p)
        const r = (() => {
          switch (p.op) {
            case 'observar': return { app: 'Calculadora', pid: 7, ventana: 99, titulo: 'Calculadora', texto: '[e1] boton «7»', total_elementos: 1, cambios: '(sin cambios)', ms: 2.1,
              elementos: [{ ref: 'e1', rol: 'AXButton', etiqueta: '7', profundidad: 0, marco: { x: 1, y: 2, w: 3, h: 4 } }] }
            case 'actuar': return p.ref === 'e404' ? null : { ok: true, efecto: 'confirmado', detalle: 'AXPress' }
            case 'ventanas': return [{ id: 99, pid: 7, app: 'Calculadora', marco: { x: 0, y: 0, w: 200, h: 300 }, en_pantalla: true, z: 3 }]
            case 'salud': return { ok: true, accesibilidad: true, grabacion_pantalla: true, version: '0.1.0' }
            case 'cursor': return { x: 10, y: 20 }
            default: return {}
          }
        })()
        const resp = r === null ? { id: p.id, ok: false, error: 'Ref e404 desconocido o vencido para esa app: vuelve a observar.' } : { id: p.id, ok: true, r, ms: 1 }
        s.write(JSON.stringify(resp) + '\n')
      }
    })
  })
  await new Promise<void>(ok => servidor.listen(ruta, ok))
})
afterAll(() => { servidor.close() })

describe('adaptador casa', () => {
  const casa = new AdaptadorCasa({ socket: ruta, app: '/no/existe.app' })

  it('traduce observar al contrato sin filtrar el proveedor', async () => {
    const o = await casa.observar({ app: 'com.apple.calculator', consulta: '7' })
    expect(o.elementos[0]).toMatchObject({ ref: 'e1', rol: 'AXButton', etiqueta: '7' })
    expect(o.ventana).toBe(99)
    expect(o.texto).toContain('[e1]')
    expect(pedidos.at(-1)).toMatchObject({ op: 'observar', app: 'com.apple.calculator', consulta: '7' })
  })

  it('actuar devuelve efecto y nunca lanza: los errores vuelven como fallo', async () => {
    expect(await casa.actuar({ pid: 7, accion: 'click', ref: 'e1' })).toEqual({ ok: true, efecto: 'confirmado', detalle: 'AXPress' })
    const mal = await casa.actuar({ pid: 7, accion: 'click', ref: 'e404' })
    expect(mal.ok).toBe(false)
    expect(mal.efecto).toBe('fallo')
    expect(mal.detalle).toMatch(/vuelve a observar/)
  })

  it('manda el modo por pedido (acotado en crons)', async () => {
    await casa.actuar({ pid: 7, accion: 'click', ref: 'e1' })
    expect(pedidos.at(-1).modo).toBe(process.env.MANOS_MODO || 'estandar')
  })

  it('ventanas, cursor y salud', async () => {
    expect((await casa.ventanas({ pid: 7 }))[0]).toMatchObject({ id: 99, en_pantalla: true, z: 3 })
    expect(await casa.cursor()).toEqual({ x: 10, y: 20 })
    expect((await casa.salud()).ok).toBe(true)
  })

  it('pedidos concurrentes por la misma conexión no se cruzan', async () => {
    const r = await Promise.all([casa.cursor(), casa.ventanas({ pid: 7 }), casa.cursor()])
    expect(r[0]).toEqual({ x: 10, y: 20 })
    expect(Array.isArray(r[1])).toBe(true)
  })

  it('sin app instalada ni socket, el error dice qué hacer', async () => {
    const huerfana = new AdaptadorCasa({ socket: join(tmpdir(), 'no-hay.sock'), app: '/no/existe.app' })
    const s = await huerfana.salud()
    expect(s.ok).toBe(false)
    expect(s.detalle).toMatch(/package\.sh|ArbrainManos/)
  }, 15_000)
})
