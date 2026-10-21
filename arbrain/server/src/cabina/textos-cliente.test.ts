/**
 * Carril U (11 oct 2026): en la edición cliente, lo que el modelo del alumno lee de la Cabina (descripciones, esquemas,
 * enums y respuestas de error) describe solo lo que existe en su app y nunca el negocio de la instalación original.
 * En la instalación original el texto es exactamente el de siempre (CABINA_TOOLS).
 *
 * Cada prueba carga los módulos de nuevo con la edición fijada ANTES de importarlos, como arranca el proceso real.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Términos del negocio y la operación de la instalación original que nunca deben llegar al alumno. Los nombres de
 * personas no se escriben aquí (esta prueba viaja con la copia del alumno): salen de la configuración de la instalación
 * original (dueño, equipo y personas con reporte), que en la copia del alumno no existe.
 * «calendario» salió de la lista el 21 oct 2026: el alumno tiene su propio calendario local (sin Google ni datos ajenos).
 */
const TERMINOS = ['polar', 'studio', 'todoist', 'saas ?factory', 'saasfactory', 'mission control', 'supabase', 'masterclass', '\\bvps\\b', 'trinity', 'sensei', 'finanzas', 'finance os', 'sfmap', 'sfcal', 'sfterm', 'command center', 'feed-sfc', 'business os', 'artificial-brain', 'mac mini', '\\bHT\\b', '\\bLT\\b', 'runway', 'mrr', 'youtube', 'organigrama', 'mc-event', 'google calendar', 'lanzamiento', 'brunson', 'tailnet']
async function prohibido(): Promise<RegExp> {
  const { instalacionOriginal } = await import('../dueno.js')
  const i = instalacionOriginal()
  const nombres = [i.dueno, ...(i.equipo ?? []), ...(i.personas_reporte ?? [])].filter((x): x is string => typeof x === 'string' && x.length > 2)
  return new RegExp([...TERMINOS, ...nombres.map(n => `\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)].join('|'), 'i')
}
let PROHIBIDO: RegExp
// Antes que nada: dueno.js queda cargado en modo original, y el beforeEach lo descarta antes de cada prueba.
beforeAll(async () => { PROHIBIDO = await prohibido() })

const ENV = ['ARBRAIN_EDICION', 'ARBRAIN_DUENO', 'ARBRAIN_PANEL_AJUSTES', 'ARBRAIN_PANEL_DIR', 'ARBRAIN_PANEL_ESPERA_MS'] as const
let previo: Record<string, string | undefined>
let tmp: string

beforeEach(() => {
  previo = Object.fromEntries(ENV.map(k => [k, process.env[k]]))
  tmp = mkdtempSync(join(tmpdir(), 'cabina-cliente-'))
  process.env.ARBRAIN_PANEL_AJUSTES = join(tmp, 'panel-ajustes.json')
  process.env.ARBRAIN_PANEL_DIR = join(tmp, 'panel')
  process.env.ARBRAIN_PANEL_ESPERA_MS = '50'
  delete process.env.ARBRAIN_DUENO
  vi.resetModules()
})
afterEach(() => {
  for (const k of ENV) { if (previo[k] === undefined) delete process.env[k]; else process.env[k] = previo[k] }
  rmSync(tmp, { recursive: true, force: true })
  vi.resetModules()
})

async function cargar(edicion: 'cliente' | 'original') {
  process.env.ARBRAIN_EDICION = edicion
  return import('./tools.js')
}

describe('Cabina en la edición cliente', () => {
  it('ninguna descripción ni esquema nombra el negocio de la instalación original', async () => {
    const t = await cargar('cliente')
    const visibles = t.cabinaToolsVisibles()
    expect(visibles.map(x => x.name)).toEqual(['mostrar', 'archivero', 'panel', 'abrir', 'despertador'])
    for (const h of [...visibles, ...t.cabinaDynamicTools()]) {
      const texto = JSON.stringify(h)
      expect(texto, h.name).not.toMatch(PROHIBIDO)
    }
    // También con un dueño con nombre propio (ARBRAIN_DUENO): el nombre entra y nada más.
    process.env.ARBRAIN_DUENO = 'alumna de prueba'
    for (const h of t.cabinaToolsCliente()) expect(JSON.stringify(h)).not.toMatch(PROHIBIDO)
    expect(t.textosCabinaCliente('alumna de prueba').mostrar).toContain('Muestra a alumna de prueba')
  })

  it('las vistas y destinos ofrecidos son los de la web del alumno; los demás no se aceptan', async () => {
    const t = await cargar('cliente')
    const props = (n: string) => (t.cabinaToolsVisibles().find(x => x.name === n)!.inputSchema as unknown as { properties: Record<string, { enum?: string[] }> }).properties
    expect(props('mostrar').vista.enum).toEqual(['calendario', 'lienzo', 'memoria', 'documento', 'explorador'])
    for (const k of ['seccion', 'quien', 'agenteId']) expect(props('mostrar')[k]).toBeUndefined()
    // Calendario local (21 oct 2026): alcance y fecha vuelven, solo para esa vista.
    for (const k of ['alcance', 'fecha']) expect(props('mostrar')[k]).toBeDefined()
    expect(props('abrir').destino.enum).toEqual(['lienzo'])
    expect(() => t.parseMostrar({ vista: 'finanzas' })).toThrow(/vista debe ser calendario\|lienzo\|memoria\|documento\|explorador\./)
    expect(() => t.parseAbrir({ destino: 'calendario' })).toThrow(/destino debe ser lienzo\./)
    expect(t.parseMostrar({ vista: 'explorador' }).vista).toBe('explorador')
    const r = t.callCabina('mostrar', { vista: 'salud' })
    expect(r.error).toBe(true)
    expect(r.text).not.toMatch(PROHIBIDO)
  })

  it('el pizarrón y la campana no se listan ni se ejecutan, con un texto limpio', async () => {
    const t = await cargar('cliente')
    for (const n of ['pizarron', 'atender']) {
      const r = await t.ejecutarCabina(n, { accion: 'abrir', tema: 'x', todos: true })
      expect(r.error).toBe(true)
      expect(r.text).not.toMatch(PROHIBIDO)
    }
  })

  it('panel secciones: solo Calendario, Lienzo, Archivos y Taller; nombrar otra es error y la lista no enseña las ocultas', async () => {
    const t = await cargar('cliente')
    const leer = await t.ejecutarCabina('panel', { accion: 'secciones' })
    expect(leer.text).toMatch(/«\+» muestra, en este orden: Calendario, Lienzo, Archivos, Taller\. Ocultas: ninguna\./)
    expect(leer.text).not.toMatch(PROHIBIDO)
    const mal = await t.ejecutarCabina('panel', { accion: 'secciones', ocultar: ['Finanzas'] })
    expect(mal.error).toBe(true)
    expect(mal.text).toMatch(/no es una sección del «\+» en esta edición\. Son: Calendario, Lienzo, Archivos, Taller\./)
    const ok = await t.ejecutarCabina('panel', { accion: 'secciones', ocultar: ['Taller'] })
    expect(ok.text).toMatch(/ocultó Taller/)
    expect(ok.text).not.toMatch(PROHIBIDO)
  })

  it('manos: el ejemplo de bundle id de lienzo no nombra apps de la instalación original', async () => {
    process.env.ARBRAIN_EDICION = 'cliente'
    const { MANOS_LIENZO_TOOLS } = await import('../manos/lienzo/herramientas-lienzo.js')
    for (const h of MANOS_LIENZO_TOOLS) expect(JSON.stringify(h.inputSchema)).not.toMatch(/saasfactory|sfmap/i)
  })
})

describe('Cabina en la instalación original', () => {
  it('cabinaToolsVisibles es CABINA_TOOLS tal cual: mismo texto, mismos esquemas', async () => {
    const t = await cargar('original')
    expect(t.cabinaToolsVisibles()).toEqual([...t.CABINA_TOOLS])
    expect(t.cabinaToolsVisibles().map(x => x.name)).toContain('pizarron')
    expect(t.parseMostrar({ vista: 'finanzas' }).vista).toBe('finanzas')
    expect(t.parseAbrir({ destino: 'calendario' }).destino).toBe('calendario')
    expect(t.DESPERTADOR_DESCRIPTION).toBe(t.textoDespertador((await import('../dueno.js')).DUENO))
  })
})
