import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { accionPanelAjustes, aplicar, describir, idDeSeccion, leer, migrar, ordenar, OCULTAS_POR_DEFECTO, SECCIONES } from './panel-ajustes.js'
import { clientesVivos, esperarAjustes, sincronizar } from './panel-bus.js'
import { CABINA_TOOLS, ejecutarCabina } from './tools.js'

let dir = '', archivo = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'panel-ajustes-'))
  archivo = path.join(dir, 'panel-ajustes.json')
  process.env.ARBRAIN_PANEL_AJUSTES = archivo
  process.env.ARBRAIN_PANEL_DIR = path.join(dir, 'panel')
  process.env.ARBRAIN_PANEL_ESPERA_MS = '400'
})
afterEach(() => { delete process.env.ARBRAIN_PANEL_AJUSTES; delete process.env.ARBRAIN_PANEL_DIR; delete process.env.ARBRAIN_PANEL_ESPERA_MS; rmSync(dir, { recursive: true, force: true }) })

/** Una app simulada que late cada 20 ms, aplica los ajustes que le llegan y reporta su versión (como bus.ts). */
function app(id = 'w-test', { aplica = true }: { aplica?: boolean } = {}) {
  let rev = 0, recibidos = 0
  const t = setInterval(() => {
    const r = sincronizar({ clientId: id, etiqueta: 'App de prueba', pestanas: [], casa: { tareas: true, taller: true }, ajustesRev: rev })
    if (r.ajustes && aplica) { rev = r.ajustes.rev; recibidos++ }
  }, 20)
  return { parar: () => clearInterval(t), recibidos: () => recibidos, rev: () => rev }
}

describe('ajustes del panel: el archivo es la fuente única', () => {
  it('sin archivo nace con el orden de siempre y Equipo y Lo que llegó ocultos', () => {
    const { ajustes, existe } = leer()
    expect(existe).toBe(false)
    expect(ajustes.orden).toEqual([...SECCIONES])
    expect(ajustes.ocultas).toEqual(OCULTAS_POR_DEFECTO)
    expect(OCULTAS_POR_DEFECTO).toEqual(['equipo', 'reporte'])
  })

  it('entiende nombres como los dice la persona (acentos, mayúsculas, «Lo que llegó»)', () => {
    expect(idDeSeccion('Tareas')).toBe('tareas')
    expect(idDeSeccion('  LO QUE LLEGÓ ')).toBe('reporte')
    expect(idDeSeccion('command center')).toBe('centro')
    expect(idDeSeccion('inventada')).toBeUndefined()
    expect(idDeSeccion(7)).toBeUndefined()
  })

  it('ordenar (lo guardado): lo desconocido se tira, lo repetido se une y lo que falta entra tras su vecina de siempre', () => {
    expect(ordenar(null)).toEqual([...SECCIONES])
    expect(ordenar(['taller', 'xx', 'taller', 'lienzo'])).toEqual(['calendario', 'tareas', 'cohorte', 'taller', 'lienzo', 'negocio', 'reporte', 'centro', 'equipo', 'salud', 'contenido', 'finanzas', 'explorador'])
  })

  it('aplicar: oculta, muestra, ordena y sube rev; escribe un archivo legible', () => {
    const a = aplicar({ ocultar: ['Tareas'] }, 'Levy', { archivo })
    expect(a.rev).toBe(1)
    expect(a.ocultas).toEqual(['equipo', 'reporte', 'tareas'])
    const b = aplicar({ mostrar: ['equipo'], orden: ['taller'] }, 'Daniel', { archivo })
    expect(b.rev).toBe(2)
    expect(b.ocultas).toEqual(['reporte', 'tareas'])
    expect(b.orden[0]).toBe('taller')
    expect(aplicar({ orden: ['salud', 'tareas'] }, 'Daniel', { archivo }).orden.slice(0, 4)).toEqual(['salud', 'tareas', 'taller', 'calendario'])
    expect(JSON.parse(readFileSync(archivo, 'utf8'))).toMatchObject({ version: 1, rev: 3, por: 'Daniel', ocultas: ['reporte', 'tareas'] })
  })

  it('un nombre que no es sección falla y no escribe (Levy no cree haber ocultado algo inexistente)', () => {
    expect(() => aplicar({ ocultar: ['Videos'] }, 'Levy', { archivo })).toThrow(/no es una sección/)
    expect(leer(archivo).existe).toBe(false)
    expect(() => aplicar({ orden: 'tareas' }, 'Levy', { archivo })).toThrow(/lista/)
  })

  it('restablecer vuelve al orden de fábrica con Equipo y Lo que llegó ocultos', () => {
    aplicar({ orden: ['taller', 'tareas'], mostrar: ['equipo'], ocultar: ['salud'] }, 'Daniel', { archivo })
    const r = aplicar({ restablecer: true }, 'Daniel', { archivo })
    expect(r.orden).toEqual([...SECCIONES])
    expect(r.ocultas).toEqual(['equipo', 'reporte'])
    expect(r.rev).toBe(2)
  })

  it('migrar: la primera vez conserva el orden de localStorage; con archivo hecho no pisa nada', () => {
    const m = migrar(['taller', 'lienzo'], 'migración', archivo)
    expect(m.migrado).toBe(true)
    expect(m.ajustes.orden.slice(0, 2)).toEqual(['taller', 'lienzo'])
    expect(m.ajustes.ocultas).toEqual(['equipo', 'reporte'])
    aplicar({ ocultar: ['tareas'] }, 'Daniel', { archivo })
    const otra = migrar(['salud'], 'migración', archivo)
    expect(otra.migrado).toBe(false)
    expect(otra.ajustes.orden[0]).toBe('taller')
  })

  it('un archivo roto cae a lo de siempre en vez de romper', () => {
    writeFileSync(archivo, '{no es json')
    expect(leer(archivo)).toMatchObject({ existe: false })
    writeFileSync(archivo, JSON.stringify({ rev: 'x', orden: 5, ocultas: ['tareas', 'zzz'] }))
    const { ajustes } = leer(archivo)
    expect(ajustes.orden).toEqual([...SECCIONES])
    expect(ajustes.ocultas).toEqual(['tareas'])
    expect(ajustes.rev).toBe(1)
  })

  it('accionPanelAjustes: lo que pide la app', () => {
    expect(accionPanelAjustes({ accion: 'leer' })).toMatchObject({ existe: false })
    expect(accionPanelAjustes({ accion: 'guardar', orden: ['taller'], ocultas: ['tareas'] })).toMatchObject({ existe: true, ajustes: { rev: 1, ocultas: ['tareas'] } })
    expect(accionPanelAjustes({ accion: 'guardar' })).toMatchObject({ status: 400 })
    expect(accionPanelAjustes({ accion: 'guardar', ocultas: ['nada'] })).toMatchObject({ status: 400 })
    expect(accionPanelAjustes({ accion: 'restablecer' })).toMatchObject({ ajustes: { rev: 2, ocultas: ['equipo', 'reporte'] } })
    expect(accionPanelAjustes({ accion: 'otra' })).toMatchObject({ status: 400 })
  })

  it('describir dice qué se ve y qué no', () => {
    const t = describir(aplicar({ ocultar: ['tareas'] }, 'Levy', { archivo }))
    expect(t).toMatch(/Ocultas: Equipo, Lo que llegó, Tareas/)
    expect(t).not.toMatch(/en este orden:.*Tareas.*Ocultas/)
  })
})

describe('difusión: el latido lleva la config y trae el acuse', () => {
  it('la app que no tiene la versión vigente la recibe; la que ya la tiene, no', () => {
    expect(sincronizar({ clientId: 'a', ajustesRev: 0 }).ajustes).toBeUndefined()
    aplicar({ ocultar: ['tareas'] }, 'Levy', { archivo })
    const r = sincronizar({ clientId: 'a', ajustesRev: 0 })
    expect(r.ajustes?.ocultas).toContain('tareas')
    expect(sincronizar({ clientId: 'a', ajustesRev: r.ajustes!.rev }).ajustes).toBeUndefined()
    expect(clientesVivos()[0].ajustesRev).toBe(1)
  })

  it('esperarAjustes: acusa quien reporta la versión y señala a quien no', async () => {
    sincronizar({ clientId: 'a', etiqueta: 'A', ajustesRev: 0 }); sincronizar({ clientId: 'b', etiqueta: 'B', ajustesRev: 0 })
    const objetivos = clientesVivos()
    const t = setTimeout(() => sincronizar({ clientId: 'a', etiqueta: 'A', ajustesRev: 3 }), 40)
    const r = await esperarAjustes(3, objetivos, { esperaMs: 400, cadaMs: 20 })
    clearTimeout(t)
    expect(r.acusaron.map(c => c.id)).toEqual(['a'])
    expect(r.sinRespuesta.map(c => c.id)).toEqual(['b'])
  })
})

describe('herramienta panel {accion:"secciones"}', () => {
  it('está declarada con sus campos y se documenta en la descripción', () => {
    const t = CABINA_TOOLS.find(x => x.name === 'panel')!
    expect(t.inputSchema.properties.accion.enum).toEqual(['listar', 'secciones'])
    expect(Object.keys(t.inputSchema.properties)).toEqual(expect.arrayContaining(['ocultar', 'mostrar', 'orden', 'restablecer']))
    expect(t.description).toMatch(/Ajustes › Panel/)
    expect(t.description).toMatch(/NO confirmado/)
  })

  it('sin cambios lista la config', async () => {
    const r = await ejecutarCabina('panel', { accion: 'secciones' })
    expect(r.error).toBeUndefined()
    expect(r.text).toMatch(/Ocultas: Equipo/)
  })

  it('ocultar con una app conectada: escribe la config y confirma con el acuse', async () => {
    const a = app()
    await new Promise(r => setTimeout(r, 60))
    const r = await ejecutarCabina('panel', { accion: 'secciones', ocultar: ['Tareas'] })
    a.parar()
    expect(r.error).toBeUndefined()
    expect(r.text).toMatch(/ocultó Tareas/)
    expect(r.text).toMatch(/Confirmado por App de prueba/)
    expect(r.text).toMatch(/cerró las pestañas/)
    expect(leer().ajustes.ocultas).toContain('tareas')
    expect(a.rev()).toBe(leer().ajustes.rev)
  })

  it('sin ninguna app conectada: queda escrita pero dice NO confirmado', async () => {
    const r = await ejecutarCabina('panel', { accion: 'secciones', ocultar: ['salud'] })
    expect(r.error).toBe(true)
    expect(r.text).toMatch(/NO confirmado/)
    expect(r.text).toMatch(/no hay ninguna app/)
    expect(leer().ajustes.ocultas).toContain('salud')
  })

  it('app conectada que no responde: NO confirmado, nombra a quién', async () => {
    const a = app('w-muda', { aplica: false })
    await new Promise(r => setTimeout(r, 60))
    const r = await ejecutarCabina('panel', { accion: 'secciones', mostrar: ['equipo'] })
    a.parar()
    expect(r.error).toBe(true)
    expect(r.text).toMatch(/Sin respuesta: App de prueba/)
  })

  it('nombre inexistente o campo mal formado: error claro y nada escrito', async () => {
    const r = await ejecutarCabina('panel', { accion: 'secciones', ocultar: ['Videos'] })
    expect(r.error).toBe(true)
    expect(r.text).toMatch(/no es una sección/)
    expect(leer().existe).toBe(false)
    expect((await ejecutarCabina('panel', { accion: 'secciones', ocultar: 'tareas' })).error).toBe(true)
    expect((await ejecutarCabina('panel', { accion: 'nada' })).text).toMatch(/listar o secciones/)
  })
})

describe('«Dónde abre Levy» (7 oct 2026)', () => {
  it('por defecto abre en la izquierda, se guarda en el mismo archivo y entiende cómo lo dice Daniel', () => {
    expect(leer().ajustes.donde).toBe('izquierda')
    expect(aplicar({ donde: 'la ventana de la derecha' }, 'Daniel · Ajustes').donde).toBe('derecha')
    expect(JSON.parse(readFileSync(archivo, 'utf8')).donde).toBe('derecha')
    expect(leer().ajustes.donde).toBe('derecha')
    expect(aplicar({ donde: 'Panel principal' }, 'Levy').donde).toBe('principal')
    expect(() => aplicar({ donde: 'arriba' }, 'Levy')).toThrow(/no es una opción/)
    expect(aplicar({ restablecer: true }, 'Levy').donde).toBe('izquierda')
  })

  it('un archivo anterior (sin donde) sigue valiendo y abre en la izquierda', () => {
    writeFileSync(archivo, JSON.stringify({ version: 1, rev: 3, orden: [...SECCIONES], ocultas: ['equipo'], actualizado: new Date().toISOString(), por: 'Daniel' }))
    expect(leer().ajustes).toMatchObject({ rev: 3, donde: 'izquierda' })
  })

  it('la app lo guarda por la misma puerta que el orden y viaja en el latido; la herramienta de Levy lo cambia y lo dice', async () => {
    const r = accionPanelAjustes({ accion: 'guardar', donde: 'derecha' })
    expect('error' in r).toBe(false)
    expect('ajustes' in r && r.ajustes.donde).toBe('derecha')
    expect(sincronizar({ clientId: 'w-1', ajustesRev: 0 }).ajustes?.donde).toBe('derecha')
    expect(describir(leer().ajustes)).toMatch(/cae en la ventana de la derecha/)
    const a = app('w-donde')
    await new Promise(r => setTimeout(r, 60))
    const t = await ejecutarCabina('panel', { accion: 'secciones', donde: 'izquierda' })
    a.parar()
    expect(t.text).toMatch(/ahora lo que abres cae en la ventana de la izquierda/)
    expect(leer().ajustes.donde).toBe('izquierda')
    expect(CABINA_TOOLS.find(x => x.name === 'panel')?.inputSchema.properties.donde.enum).toEqual(['izquierda', 'derecha', 'principal'])
  })
})

