import { afterAll, describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AdaptadorWindows, huellaFuente } from './windows.js'
import { juzgar, frenar, Freno } from '../freno.js'
import { componerManos, crearAdaptador, adaptadorPorDefecto } from '../registro.js'
import { navegar } from '../navegador.js'
import { MANOS_TOOLS } from '../herramientas.js'
import type { ContextoAccion } from '../contrato.js'

/** ManosWindows falso: mismo protocolo (JSON por líneas por stdio), respuestas fijas. Anota cada pedido en un archivo. */
const dir = mkdtempSync(join(tmpdir(), 'manos-windows-'))
const bitacora = join(dir, 'pedidos.jsonl')
const falso = join(dir, 'ManosWindows-falso.mjs')
writeFileSync(falso, `#!/usr/bin/env node
import { createInterface } from 'node:readline'
import { appendFileSync } from 'node:fs'
const rl = createInterface({ input: process.stdin })
rl.on('line', l => {
  const p = JSON.parse(l)
  appendFileSync(${JSON.stringify(bitacora)}, l + '\\n')
  const r = (() => {
    switch (p.op) {
      case 'observar': return { app: 'Calculator', bundle: 'win32calc', pid: 768, ventana: 327862, titulo: 'Calculator', texto: '[e7] AXButton «7»', total_elementos: 1, cambios: '', ms: 3,
        elementos: [{ ref: 'e7', rol: 'AXButton', etiqueta: '7', acciones: ['presionar'], profundidad: 0, marco: { x: 1, y: 2, w: 3, h: 4 } }] }
      case 'actuar': return p.ref === 'e404' ? null : { ok: true, efecto: 'confirmado', detalle: 'Invoke · la ventana cambió' }
      case 'apps': return [{ nombre: 'Calculator', bundle: 'win32calc', pid: 768, activa: false }, { nombre: 'Microsoft Edge', bundle: 'msedge', pid: 900, activa: false }]
      case 'ventanas': return [{ id: 327862, pid: 768, app: 'Calculator', titulo: 'Calculator', marco: { x: 0, y: 0, w: 200, h: 300 }, en_pantalla: true, z: 3 }]
      case 'abrir_url': return { pid: 900, ventanas: [{ id: 555, pid: 900, app: 'Microsoft Edge', titulo: 'Example Domain - Microsoft Edge', marco: { x: 0, y: 0, w: 900, h: 700 }, en_pantalla: true, z: 9 }] }
      case 'pagina': return { ventana: 555, titulo_pagina: 'Example Domain', url: 'https://example.com/' }
      case 'contexto': return { bundle: 'win32calc', app: 'Calculator', plataforma: 'windows', elemento: { rol: 'AXButton', titulo: '7' } }
      case 'salud': return { ok: true, version: '0.1.0', uia: 'UIA3', windows: '10.0.26100.0', sesion: 2, escritorio_interactivo: true, elevado: false }
      case 'cursor': return { x: 10, y: 20 }
      default: return {}
    }
  })()
  process.stdout.write(JSON.stringify(r === null ? { id: p.id, ok: false, error: 'Ref e404 desconocido o vencido para esa ventana: vuelve a observar.' } : { id: p.id, ok: true, r, ms: 1 }) + '\\n')
})
`)
chmodSync(falso, 0o755)
const pedidos = () => readFileSync(bitacora, 'utf8').trim().split('\n').map(l => JSON.parse(l))

// El helper falso es un script con shebang: corre en macOS y Linux (en Windows se prueba el helper real con windows-e2e.ts).
describe.skipIf(process.platform === 'win32')('adaptador windows (protocolo, sin Windows)', () => {
  const win = new AdaptadorWindows({ exe: falso })
  afterAll(() => win.cerrar())

  it('traduce observar al contrato', async () => {
    const o = await win.observar({ app: 'calc', consulta: '7' })
    expect(o.elementos[0]).toMatchObject({ ref: 'e7', rol: 'AXButton', etiqueta: '7' })
    expect(o.ventana).toBe(327862)
    expect(pedidos().at(-1)).toMatchObject({ op: 'observar', app: 'calc', consulta: '7' })
  })

  it('actuar nunca lanza y la cita del freno no viaja al helper', async () => {
    expect(await win.actuar({ pid: 768, accion: 'click', ref: 'e7', confirmacion: 'Daniel: haz clic en el 7' })).toMatchObject({ ok: true, efecto: 'confirmado' })
    expect(pedidos().at(-1).confirmacion).toBeUndefined()
    const mal = await win.actuar({ pid: 768, accion: 'click', ref: 'e404' })
    expect(mal).toMatchObject({ ok: false, efecto: 'fallo' })
    expect(mal.detalle).toMatch(/vuelve a observar/)
  })

  it('pedidos concurrentes por el mismo proceso no se cruzan', async () => {
    const [c, v, c2] = await Promise.all([win.cursor(), win.ventanas({ pid: 768 }), win.cursor()])
    expect(c).toEqual({ x: 10, y: 20 }); expect(c2).toEqual({ x: 10, y: 20 })
    expect(v[0]).toMatchObject({ id: 327862, en_pantalla: true, z: 3 })
  })

  it('salud dice qué hay debajo', async () => {
    const s = await win.salud()
    expect(s.ok).toBe(true)
    expect(s.detalle).toMatch(/UIA3/)
  })

  it('navegar usa la ventana nueva que abre el adaptador, la adopta y espera la página', async () => {
    const manos = componerManos(win)
    const freno = (manos as any).interno as Freno
    const r = await navegar(freno, { url: 'example.com', navegador: 'edge' })
    expect(r).toMatchObject({ ok: true, pid: 900, ventana: 555, url: 'https://example.com/' })
    expect(freno.propias.has(555)).toBe(true)
    expect(pedidos().some(p => p.op === 'abrir_url' && p.url === 'https://example.com/')).toBe(true)
  })
})

describe('adaptador windows: fuera de Windows y sin binario, el error dice qué hacer', () => {
  it.skipIf(process.platform === 'win32')('salud falla con mensaje claro', async () => {
    const s = await new AdaptadorWindows().salud()
    expect(s.ok).toBe(false)
    expect(s.detalle).toMatch(/solo corre en Windows/)
  })
  it('la huella de las fuentes es estable (misma fuente, mismo binario en caché)', () => {
    expect(huellaFuente()).toMatch(/^[0-9a-f]{12}$/)
    expect(huellaFuente()).toBe(huellaFuente())
  })
})

describe('registro', () => {
  it('MANOS_ADAPTADOR=windows crea el adaptador de Windows; las herramientas MCP no cambian de nombre', () => {
    expect(crearAdaptador('windows').nombre).toBe('windows')
    expect(MANOS_TOOLS.map(t => t.name)).toEqual(['observar', 'actuar', 'navegar', 'mostrar', 'apps', 'ventanas', 'verificar', 'decidir', 'listar_recetas', 'correr_receta', 'grabar_receta'])
  })
  it('sin MANOS_ADAPTADOR: windows en Windows, cua en el resto', () => {
    const antes = process.env.MANOS_ADAPTADOR
    delete process.env.MANOS_ADAPTADOR
    try { expect(adaptadorPorDefecto()).toBe(process.platform === 'win32' ? 'windows' : 'cua') } finally { if (antes !== undefined) process.env.MANOS_ADAPTADOR = antes }
  })
})

describe('freno en Windows: los mismos peligros con los atajos de Windows', () => {
  const W = (x: ContextoAccion): ContextoAccion => ({ plataforma: 'windows', ...x })
  const pid = 1
  it('Ctrl+W y Alt+F4 sobre una ventana de Daniel frenan; sobre una propia pasan', () => {
    expect(juzgar({ pid, ventana: 7, accion: 'tecla', tecla: 'w', modificadores: ['ctrl'] }, W({ bundle: 'notepad' })).categoria).toBe('ventana_de_daniel')
    expect(juzgar({ pid, ventana: 7, accion: 'tecla', tecla: 'f4', modificadores: ['alt'] }, W({ bundle: 'notepad' })).categoria).toBe('ventana_de_daniel')
    expect(juzgar({ pid, ventana: 7, accion: 'tecla', tecla: 'f4', modificadores: ['alt'] }, W({ bundle: 'notepad' }), new Set([7])).irreversible).toBe(false)
  })
  it('Ctrl+Enter en un campo de texto envía (Outlook, Teams); Ctrl+Q sale', () => {
    expect(juzgar({ pid, accion: 'tecla', tecla: 'return', modificadores: ['ctrl'], ref: 'e1' }, W({ bundle: 'olk', elemento: { rol: 'AXTextArea' } })).categoria).toBe('enviar')
    expect(juzgar({ pid, accion: 'tecla', tecla: 'q', modificadores: ['ctrl'] }, W({ bundle: 'notepad' })).categoria).toBe('salir')
  })
  it('Ctrl+H y Ctrl+M no esconden nada en Windows (en macOS ⌘H sí frena)', () => {
    expect(juzgar({ pid, accion: 'tecla', tecla: 'h', modificadores: ['ctrl'] }, W({ bundle: 'notepad' })).irreversible).toBe(false)
    expect(juzgar({ pid, accion: 'tecla', tecla: 'h', modificadores: ['cmd'] }, { bundle: 'com.apple.TextEdit' }).categoria).toBe('ventana_de_daniel')
  })
  it('Enter en el compositor de Slack o WhatsApp de Windows envía', () => {
    expect(juzgar({ pid, accion: 'tecla', tecla: 'return' }, W({ bundle: 'slack', app: 'Slack' })).categoria).toBe('enviar')
    expect(juzgar({ pid, accion: 'tecla', tecla: 'return', ref: 'e2' }, W({ bundle: 'whatsapp', elemento: { rol: 'AXTextArea' } })).categoria).toBe('enviar')
  })
  it('«Sí» en «¿Desea reemplazarlo?» frena (guardar encima de un archivo lo pierde); con cita pasa', () => {
    const c = W({ bundle: 'notepad', elemento: { rol: 'AXButton', titulo: 'Yes' }, dentro_de: ['dialogo'], dialogo: { tipo: 'dialogo', texto: 'hola.txt already exists. Do you want to replace it?' } })
    expect(frenar({ pid, accion: 'click', ref: 'e3' }, c)).toMatchObject({ pasa: false, freno: { categoria: 'confirmar_peligro' } })
    expect(frenar({ pid, accion: 'click', ref: 'e3', confirmacion: 'sí, guárdalo encima de hola.txt' }, c)).toMatchObject({ pasa: true, freno: { paso: true } })
    const es = W({ ...c, elemento: { rol: 'AXButton', titulo: 'Sí' }, dialogo: { tipo: 'dialogo', texto: 'hola.txt ya existe. ¿Desea reemplazarlo?' } })
    expect(juzgar({ pid, accion: 'click', ref: 'e3' }, es).categoria).toBe('confirmar_peligro')
  })
  it('«Enviar» frena igual que en macOS; los «Clear» de la Calculadora no', () => {
    expect(juzgar({ pid, accion: 'click', ref: 'e1' }, W({ bundle: 'powershell', elemento: { rol: 'AXButton', titulo: 'Enviar' } })).categoria).toBe('enviar')
    for (const t of ['Clear', 'Clear entry', 'Backspace', 'Memory clear']) expect(juzgar({ pid, accion: 'click', ref: 'e1' }, W({ bundle: 'win32calc', elemento: { rol: 'AXButton', titulo: t } })).irreversible).toBe(false)
  })
  it('una ventana de Edge o Chrome que no abrieron las manos son pestañas de Daniel', () => {
    expect(juzgar({ pid, ventana: 9, accion: 'click', ref: 'e1' }, W({ bundle: 'msedge', elemento: { rol: 'AXButton', titulo: 'Más' } })).categoria).toBe('pestana_de_daniel')
    expect(juzgar({ pid, ventana: 9, accion: 'click', ref: 'e1' }, W({ bundle: 'chrome', elemento: { rol: 'AXButton', titulo: 'Más' } }), new Set([9])).irreversible).toBe(false)
  })
})
