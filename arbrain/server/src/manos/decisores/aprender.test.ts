import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Adaptador, Elemento, Observacion, PedidoActuar } from '../contrato.js'
import { AlmacenRecetas, Grabadora, correrReceta } from '../recetas.js'
import { aprender, plantilla } from './aprender.js'
import { elegirReceta } from './atajos.js'

/** App de notas falsa: lista de notas y un campo de texto; escribir agrega al valor. */
class Notas implements Adaptador {
  readonly nombre = 'falsa'
  abierta = 'Compras'
  valor: Record<string, string> = {}
  private arbol(): Elemento[] {
    return [
      { ref: 'e1', rol: 'AXWindow', etiqueta: 'Notas', profundidad: 0 },
      { ref: 'e2', rol: 'AXList', etiqueta: 'Notas', profundidad: 1 },
      ...['Compras', 'Ideas', 'Viajes'].map((n, i) => ({ ref: `e${10 + i}`, rol: 'AXButton', etiqueta: n, profundidad: 2 })),
      { ref: 'e20', rol: 'AXTextArea', etiqueta: 'Cuerpo', valor: this.valor[this.abierta] ?? '', profundidad: 1 },
    ]
  }
  async observar(): Promise<Observacion> { const e = this.arbol(); return { app: 'Notas', pid: 7, ventana: 70, elementos: e, texto: e.map(x => `[${x.ref}] ${x.rol} «${x.etiqueta}»`).join('\n'), total_elementos: e.length } }
  async actuar(p: PedidoActuar) {
    const e = this.arbol().find(x => x.ref === p.ref)
    if (p.accion === 'click' && e?.rol === 'AXButton') this.abierta = e.etiqueta!
    if (p.accion === 'escribir') this.valor[this.abierta] = (this.valor[this.abierta] ?? '') + p.texto
    return { ok: true, efecto: 'confirmado' as const }
  }
  async apps() { return [{ nombre: 'Notas', bundle: 'com.ejemplo.notas', pid: 7, activa: false }] }
  async abrir() { return { pid: 7, ventanas: [] } }
  async ventanas() { return [{ id: 70, pid: 7, app: 'Notas', marco: { x: 0, y: 0, w: 800, h: 600 }, en_pantalla: true }] }
  async verificar() { return { cumple: true as const, detalle: '' } }
  async cursor() { return { x: 0, y: 0 } }
  async salud() { return { ok: true, detalle: '' } }
  async cerrar() {}
}

async function hacerAMano(g: Grabadora, nota: string, texto: string) {
  let o = await g.observar({ pid: 7 })
  await g.actuar({ pid: 7, ventana: 70, accion: 'click', ref: o.elementos.find(e => e.etiqueta === nota)!.ref })
  o = await g.observar({ pid: 7 })
  await g.actuar({ pid: 7, ventana: 70, accion: 'escribir', ref: 'e20', texto })
}

describe('recetas aprendidas tras el 2.º uso', () => {
  it('plantilla: las citas pasan a parámetros', () => {
    expect(plantilla('En Notas escribe «leche» en la nota «Compras»')).toEqual({ texto: 'en notas escribe «{{p1}}» en la nota «{{p2}}»', parametros: { p1: 'leche', p2: 'Compras' } })
  })

  it('1.ª vez deja huella, 2.ª graba la receta y la 3.ª corre sin modelo con otros parámetros', async () => {
    const app = new Notas()
    const g = new Grabadora(app)
    const almacen = new AlmacenRecetas(mkdtempSync(join(tmpdir(), 'aprender-')))
    const pedido = (t: string, n: string) => `En Notas escribe «${t}» en la nota «${n}»`

    let desde = g.historial.length
    await hacerAMano(g, 'Compras', 'leche')
    expect(await aprender(g, almacen, pedido('leche', 'Compras'), desde)).toEqual({ estado: 'huella', veces: 1 })
    expect(almacen.listar()).toHaveLength(0)

    desde = g.historial.length
    await hacerAMano(g, 'Ideas', 'robot')
    const r = await aprender(g, almacen, pedido('robot', 'Ideas'), desde)
    expect(r.estado).toBe('receta')
    expect(almacen.listar()).toHaveLength(1)

    const tercera = pedido('pan', 'Viajes')
    const cand = await elegirReceta(tercera, almacen.listar())
    expect(cand?.parametros).toEqual({ p1: 'pan', p2: 'Viajes' })
    const corrida = await correrReceta(g, () => { throw new Error('sin decisor: no debe hacer falta') }, almacen, cand!.receta.nombre, { parametros: cand!.parametros })
    expect(corrida.estado).toBe('hecho')
    expect(app.valor.Viajes).toBe('pan')
  })

  it('no aprende si un parámetro no lo usa ningún paso (la nota ya estaba abierta: escribiría en la equivocada)', async () => {
    const app = new Notas()
    const g = new Grabadora(app)
    const almacen = new AlmacenRecetas(mkdtempSync(join(tmpdir(), 'aprender-')))
    for (const t of ['uno', 'dos']) {
      const desde = g.historial.length
      await g.observar({ pid: 7 })
      await g.actuar({ pid: 7, ventana: 70, accion: 'escribir', ref: 'e20', texto: t })
      expect(await aprender(g, almacen, `En Notas escribe «${t}» en la nota «Compras»`, desde)).toMatchObject({ estado: 'nada', motivo: expect.stringMatching(/p2/) })
    }
    expect(almacen.listar()).toHaveLength(0)
  })

  it('no aprende lo sensible ni lo que no puede verificar', async () => {
    const g = new Grabadora(new Notas())
    const almacen = new AlmacenRecetas(mkdtempSync(join(tmpdir(), 'aprender-')))
    let o = await g.observar({ pid: 7 })
    await g.actuar({ pid: 7, ventana: 70, accion: 'click', ref: o.elementos.find(e => e.etiqueta === 'Ideas')!.ref })
    expect((await aprender(g, almacen, 'abre la nota «Ideas»', 0)).estado).toBe('nada')
    const desde = g.historial.length
    o = await g.observar({ pid: 7 })
    await g.actuar({ pid: 7, ventana: 70, accion: 'tecla', tecla: 'return', ref: 'e20' })
    expect(await aprender(g, almacen, 'escribe y dale enter', desde)).toMatchObject({ estado: 'nada' })
  })
})
