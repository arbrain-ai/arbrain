import { describe, it, expect, afterEach } from 'vitest'
import type { Adaptador, Decisor, PedidoDecidir } from './contrato.js'
import { ADAPTADORES, DECISORES, DecisorEncadenado, crearAdaptador, crearDecisor } from './registro.js'
import { CedeDecision } from './decisores/jev.js'
import { MANOS_TOOLS, ejecutarManos } from './herramientas.js'
import { handle } from './mcp-stdio.js'

function adaptadorFalso(nombre = 'falso'): Adaptador {
  return {
    nombre,
    observar: async p => ({ app: p.app ?? 'X', pid: 7, ventana: 3, elementos: [{ ref: 'e1', rol: 'AXButton', etiqueta: 'OK' }], texto: '[e1] AXButton «OK»', total_elementos: 1 }),
    actuar: async p => (p.ref ? { ok: true, efecto: 'confirmado' } : { ok: false, efecto: 'fallo', detalle: 'sin ref' }),
    apps: async () => [{ nombre: 'X', pid: 7, activa: false }],
    abrir: async () => ({ pid: 7, ventanas: [] }),
    ventanas: async () => [],
    verificar: async () => ({ cumple: true, detalle: '' }),
    cursor: async () => ({ x: 1, y: 2 }),
    salud: async () => ({ ok: true, detalle: '' }),
    cerrar: async () => {},
  }
}

const pedido: PedidoDecidir = { pregunta: '¿cuál?', estado: {}, opciones: { a: 'A', b: 'B' } }
const decisorFijo = (nombre: string, eleccion: string): Decisor => ({ nombre, decidir: async () => ({ eleccion, confianza: null, decisor: nombre, ms: 5, costo_usd: 0.001 }) })

afterEach(() => { delete ADAPTADORES.falso; delete DECISORES.fijo; delete DECISORES.cede })

describe('registro: la tecnología se elige por configuración', () => {
  it('crea el adaptador nombrado en MANOS_ADAPTADOR sin tocar a los motores', () => {
    ADAPTADORES.falso = () => adaptadorFalso()
    expect(crearAdaptador('falso').nombre).toBe('falso')
  })
  it('rechaza un adaptador inexistente nombrando los disponibles', () => {
    expect(() => crearAdaptador('nada')).toThrow(/Disponibles: cua/)
  })
  it('el decisor rápido decide si no cede', async () => {
    DECISORES.fijo = () => decisorFijo('fijo', 'a')
    const d = await crearDecisor('fijo', '').decidir(pedido)
    expect(d).toMatchObject({ eleccion: 'a', decisor: 'fijo' })
  })
  it('si el rápido cede, decide el respaldo y queda el motivo y el costo sumado', async () => {
    DECISORES.cede = () => ({ nombre: 'cede', decidir: async () => { throw new CedeDecision('confianza 0.4 < 0.55', { ms: 10, costo_usd: 0.0001 }) } })
    DECISORES.fijo = () => decisorFijo('fijo', 'b')
    const d = await crearDecisor('cede', 'fijo').decidir(pedido)
    expect(d.eleccion).toBe('b')
    expect(d.cedio).toMatch(/0\.4/)
    expect(d.ms).toBe(15)
    expect(d.costo_usd).toBeCloseTo(0.0011)
  })
  it('sin respaldo, el error del rápido sube', async () => {
    const e = new DecisorEncadenado({ nombre: 'x', decidir: async () => { throw new CedeDecision('sin cuota') } }, null)
    await expect(e.decidir(pedido)).rejects.toThrow(/sin cuota/)
  })
})

describe('herramientas: contrato estable', () => {
  it('expone exactamente los verbos del contrato y los de recetas', () => {
    expect(MANOS_TOOLS.map(t => t.name)).toEqual(['observar', 'actuar', 'navegar', 'mostrar', 'apps', 'ventanas', 'verificar', 'decidir', 'listar_recetas', 'correr_receta', 'grabar_receta'])
  })
  it('observar devuelve cabecera y árbol con refs', async () => {
    const r = await ejecutarManos('observar', { app: 'X' }, adaptadorFalso(), () => decisorFijo('f', 'a'))
    expect(r.text).toMatch(/pid 7 · ventana 3/)
    expect(r.text).toMatch(/\[e1\] AXButton «OK»/)
  })
  it('un error del adaptador vuelve como error de herramienta, no como excepción', async () => {
    const roto = { ...adaptadorFalso(), apps: async () => { throw new Error('permisos pendientes') } }
    const r = await ejecutarManos('apps', {}, roto, () => decisorFijo('f', 'a'))
    expect(r).toEqual({ text: 'permisos pendientes', error: true })
  })
  it('el servidor MCP responde initialize y tools/list', async () => {
    const init = await handle({ id: 1, method: 'initialize', params: {} })
    expect((init as any).result.serverInfo.name).toBe('manos')
    const lista = await handle({ id: 2, method: 'tools/list' })
    // 11 nativas + 7 web (extensión Arbrain, docs/builds/manos-web-extension-2026-10-02/INTEGRACION.md)
    // + 9 de lienzo (docs/builds/manos-lienzo-2026-10-02/) + encargar (el pedido completo al cerebro, nodo E)
    expect((lista as any).result.tools).toHaveLength(28)
  })
})
