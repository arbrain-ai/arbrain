import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DUENO, DUENO_M, PERSONA_DUENO, carpetaOriginal } from '../dueno.js'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { clientesVivos, describirPanel, emitir, esperarAcuses, informe, sincronizar, type Pestana } from './panel-bus.js'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'panel-bus-'))
  process.env.ARBRAIN_PANEL_DIR = dir
  process.env.ARBRAIN_ARCHIVERO = path.join(dir, 'archivero.json')
  process.env.ARBRAIN_PANEL_AJUSTES = path.join(dir, 'panel-ajustes.json')
})
afterEach(() => { delete process.env.ARBRAIN_PANEL_DIR; delete process.env.ARBRAIN_ARCHIVERO; delete process.env.ARBRAIN_PANEL_AJUSTES; rmSync(dir, { recursive: true, force: true }) })

const p = (id: string, vista: string, titulo: string, extra: Partial<Pestana> = {}): Pestana => ({ id, vista, titulo, ...extra })
/** Un cliente de la web de hoy: dispositivo estable, sesión de Daniel y la conversación en la que escribió. */
const nuevo = (id: string, extra: Partial<Parameters<typeof sincronizar>[0]> = {}): Parameters<typeof sincronizar>[0] => ({
  clientId: id, etiqueta: 'App de prueba', dispositivo: `disp-${id}`, usuario: 'Daniel', equipo: 'Mac · local', conversacion: 'conv-1', escribio: { 'conv-1': new Date().toISOString() }, pestanas: [], ...extra,
})

/** Una "app" simulada: late cada 20 ms y, si le llega un comando, lo aplica a su panel y lo acusa. */
function appSimulada(inicial: Pestana[], aplicar: (cmd: ReturnType<typeof sincronizar>['comandos'][number], panel: Pestana[]) => { ok: boolean; cerradas?: string[]; abiertas?: string[] }) {
  let panel = [...inicial], vivo = true
  const acuses: Parameters<typeof sincronizar>[0]['acuses'] = []
  const t = setInterval(() => {
    if (!vivo) return
    const r = sincronizar(nuevo('w-test', { dispositivo: 'disp-test', pestanas: panel, acuses: acuses!.splice(0) }))
    for (const cmd of r.comandos) {
      const res = aplicar(cmd, panel)
      acuses!.push({ comando: cmd.id, ok: res.ok, detalle: '', cerradas: res.cerradas ?? [], abiertas: res.abiertas ?? [], pestanas: panel })
    }
  }, 20)
  return { panel: () => panel, ponerPanel: (x: Pestana[]) => { panel = x }, parar: () => { vivo = false; clearInterval(t) } }
}

describe('bus del panel: latido, comandos y acuses', () => {
  it('sin ningún cliente conectado lo dice y no da por hecho nada', async () => {
    const { comando, objetivos, destino } = emitir('soltar', { vista: 'finanzas' }, 'conv-1')
    expect(objetivos).toHaveLength(0)
    const r = informe(comando, objetivos, await esperarAcuses(comando.id, objetivos), Date.now(), undefined, destino)
    expect(r.confirmado).toBe(false)
    expect(r.text).toMatch(/NO confirmado.*ningún cliente/)
    expect(describirPanel().conectado).toBe(false)
  })

  it('un cliente con latido aparece vivo y su panel se lista tal cual', () => {
    sincronizar({ clientId: 'w-1', etiqueta: 'App', pestanas: [p('mano-finanzas-1', 'finanzas', 'Finanzas'), p('levy-c1', 'documento', 'Octubre', { deLevy: true, ruta: 'docs/x.html', activa: true })], casa: { tareas: true, taller: true } })
    expect(clientesVivos()).toHaveLength(1)
    const txt = describirPanel().text
    expect(txt).toMatch(new RegExp(`mano-finanzas-1.*abierta por ${DUENO}`))
    expect(txt).toMatch(/levy-c1.*Octubre.*fijada por Levy.*a la vista/)
    expect(txt).toMatch(/Tareas y Taller/)
    // Siempre dice dónde vive cada pestaña (8 oct 2026), aunque sea el panel principal.
    expect(txt).toMatch(/mano-finanzas-1.*en el Panel principal/)
  })

  it('un cliente sin latido reciente se da por desconectado', () => {
    sincronizar({ clientId: 'w-1', pestanas: [] }, Date.now() - 60_000)
    expect(clientesVivos()).toHaveLength(0)
  })

  it('soltar: la app cierra la pestaña que abrió Daniel y el acuse lleva el panel real', async () => {
    const app = appSimulada([p('mano-finanzas-1', 'finanzas', 'Finanzas'), p('mano-contenido-2', 'contenido', 'Contenido')], (cmd, panel) => {
      const fuera = panel.filter(x => x.vista === cmd.input.vista)
      app.ponerPanel(panel.filter(x => x.vista !== cmd.input.vista))
      return { ok: true, cerradas: fuera.map(x => x.titulo) }
    })
    await new Promise(r => setTimeout(r, 50))
    const { comando, objetivos, destino } = emitir('soltar', { vista: 'finanzas' }, 'conv-1')
    expect(objetivos).toHaveLength(1)
    const r = informe(comando, objetivos, await esperarAcuses(comando.id, objetivos, { esperaMs: 2000, cadaMs: 20 }), Date.now(), undefined, destino)
    app.parar()
    expect(r.confirmado).toBe(true)
    expect(r.text).toMatch(/App de prueba confirmó: cerró «Finanzas»/)
    expect(r.text).toMatch(/Panel real ahora: «Contenido»/)
  })

  it('un cliente conectado que no responde NO se da por confirmado', async () => {
    sincronizar(nuevo('w-mudo', { etiqueta: 'App muda' }))
    const { comando, objetivos } = emitir('fijar', { vista: 'finanzas', fijar: true }, 'conv-1')
    const r = informe(comando, objetivos, await esperarAcuses(comando.id, objetivos, { esperaMs: 100, cadaMs: 20 }))
    expect(r.confirmado).toBe(false)
    expect(r.text).toMatch(/no respondió/)
  })

  it('el cliente recibe cada comando una vez y deja de recibirlo al acusarlo; uno vencido no se entrega', () => {
    sincronizar(nuevo('w-1'))
    const { comando } = emitir('soltar', { vista: 'finanzas' }, 'conv-1')
    expect(sincronizar(nuevo('w-1')).comandos.map(c => c.id)).toEqual([comando.id])
    const r = sincronizar(nuevo('w-1', { acuses: [{ comando: comando.id, ok: true, detalle: '', cerradas: [], abiertas: [], pestanas: [] }] }))
    expect(r.comandos).toHaveLength(0)
    emitir('soltar', { vista: 'contenido' }, 'conv-1', Date.now() - 11 * 60_000)
    expect(sincronizar(nuevo('w-1')).comandos.map(c => c.input.vista)).toEqual([])
  })

  it('tres pedidos de fijar en cola (7 oct, videos a/c/b) llegan los tres, en orden, al reconectar', () => {
    const ahora = Date.now()
    const ruta = (x: string) => `~/Developer/labs/god-animation/practicas/2026-10-07-arbrain-un-cerebro-${x}/final.mp4`
    // La app escribió en la conversación y se durmió (ventana oculta): es SU dispositivo, y la cola es suya.
    sincronizar(nuevo('w-7oct', { escribio: { 'conv': new Date(ahora - 60_000).toISOString() }, conversacion: 'conv' }), ahora - 60_000)
    for (const [i, x] of ['a', 'c', 'b'].entries()) {
      const { objetivos } = emitir('fijar', { vista: 'documento', ruta: ruta(x), fijar: true }, 'conv', ahora + i * 60_000)
      expect(objetivos).toEqual([])
    }
    // La app despierta 5 min después con un latido tardío: sigue vigente toda la cola.
    const r = sincronizar(nuevo('w-7oct', { conversacion: 'conv', escribio: { 'conv': new Date(ahora - 1000).toISOString() } }), ahora + 5 * 60_000)
    expect(r.comandos.map(c => c.input.ruta)).toEqual([ruta('a'), ruta('c'), ruta('b')])
    // Acusa los tres: ninguno vuelve a ofrecerse, y un latido tardío de 20 s todavía cuenta como conectada.
    sincronizar(nuevo('w-7oct', { conversacion: 'conv', acuses: r.comandos.map(c => ({ comando: c.id, ok: true, detalle: '', cerradas: [], abiertas: [], pestanas: [] })) }), ahora + 5 * 60_000 + 1000)
    expect(sincronizar(nuevo('w-7oct', { conversacion: 'conv' }), ahora + 5 * 60_000 + 2000).comandos).toEqual([])
    expect(clientesVivos(ahora + 5 * 60_000 + 22_000).map(c => c.id)).toEqual(['w-7oct'])
  })

  it('la herramienta mostrar {soltar} responde con el acuse real, y sin app lo dice sin pintarlo como error (va a la bitácora)', async () => {
    const { ejecutarCabina } = await import('./tools.js')
    const sola = await ejecutarCabina('mostrar', { vista: 'servidores', soltar: true })
    expect(sola.error).toBeUndefined()
    expect(sola.text).toMatch(/NO confirmado/)
    expect(sola.text).not.toMatch(/undefined/)
    // Con un solo cliente que nunca escribió en la conversación (una web anterior al 8 oct), el pedido NO va a «cualquiera conectado».
    sincronizar({ clientId: 'w-viejo', etiqueta: 'Arbrain en el navegador', pestanas: [] })
    const aViejo = await ejecutarCabina('mostrar', { vista: 'servidores', soltar: true })
    expect(aViejo.text).toMatch(/NO confirmado.*no tiene a dónde ir/)
    expect(sincronizar({ clientId: 'w-viejo', pestanas: [] }).comandos).toEqual([])
    expect(readFileSync(path.join(dir, 'bitacora.jsonl'), 'utf8')).toMatch(/mostrar-sin-confirmar/)
    const app = appSimulada([p('mano-servidores-1', 'servidores', 'Servidores')], (cmd, panel) => {
      app.ponerPanel(panel.filter(x => x.vista !== cmd.input.vista))
      return { ok: true, cerradas: panel.filter(x => x.vista === cmd.input.vista).map(x => x.titulo) }
    })
    await new Promise(r => setTimeout(r, 50))
    const conApp = await ejecutarCabina('mostrar', { vista: 'servidores', soltar: true })
    app.parar()
    expect(conApp.error).toBeUndefined()
    // La app es el último cliente donde Daniel escribió: el pedido va a ella (y solo a ella) y confirma.
    expect(conApp.text).toMatch(/App de prueba confirmó/)
    expect(conApp.text).toMatch(/sin pestañas fijadas/)
    expect(app.panel()).toHaveLength(0)
  })

  it('la herramienta panel lista lo que la app reporta', async () => {
    const { ejecutarCabina } = await import('./tools.js')
    expect((await ejecutarCabina('panel', { accion: 'listar' })).error).toBe(true)
    sincronizar({ clientId: 'w-1', etiqueta: 'App', pestanas: [p('mano-contenido-1', 'contenido', 'Contenido')] })
    const r = await ejecutarCabina('panel', { accion: 'listar' })
    expect(r.error).toBeUndefined()
    expect(r.text).toMatch(new RegExp(`mano-contenido-1.*Contenido.*abierta por ${DUENO}`))
  })

  it('mostrar sin fijar/soltar/guardar no toca el panel ni espera', async () => {
    const { ejecutarCabina } = await import('./tools.js')
    const t0 = Date.now()
    const r = await ejecutarCabina('mostrar', { vista: 'finanzas' })
    expect(r.error).toBeUndefined()
    expect(Date.now() - t0).toBeLessThan(500)
  })

  it('un pedido va SOLO al cliente que tiene abierta la conversación; otro conectado (navegador, otra persona) no lo recibe', () => {
    const t = Date.now()
    sincronizar(nuevo('w-app', { conversacion: 'sdk:conv-1', escribio: { 'conv-1': new Date(t - 5000).toISOString() } }), t)
    sincronizar(nuevo('w-nav', { etiqueta: 'Arbrain en el navegador', conversacion: 'otra', escribio: { 'conv-1': new Date(t - 1000).toISOString() } }), t)
    // El navegador escribió más tarde en conv-1, pero la tiene abierta la app: manda «abierta».
    const e = emitir('fijar', { vista: 'documento', ruta: 'x.html', fijar: true }, 'conv-1', t)
    expect(e.destino).toMatchObject({ motivo: 'abierta', vivo: true })
    expect(e.objetivos.map(c => c.id)).toEqual(['w-app'])
    expect(sincronizar(nuevo('w-nav', { etiqueta: 'Arbrain en el navegador', conversacion: 'otra', escribio: { 'conv-1': new Date(t - 1000).toISOString() } }), t).comandos).toEqual([])
    expect(sincronizar(nuevo('w-app', { conversacion: 'sdk:conv-1' }), t).comandos.map(c => c.id)).toEqual([e.comando.id])
  })

  it('si nadie la tiene abierta, va al último cliente donde Daniel escribió en ESA conversación, aunque duerma; un cliente sin historial no', () => {
    const t = Date.now()
    sincronizar(nuevo('w-laptop', { conversacion: 'otra', escribio: { 'conv-1': new Date(t - 90_000).toISOString() } }), t - 60_000)
    sincronizar(nuevo('w-studio', { conversacion: 'otra', escribio: { 'conv-1': new Date(t - 400_000).toISOString() } }), t)
    sincronizar({ clientId: 'w-viejo', etiqueta: 'Arbrain en el navegador', pestanas: [] }, t)
    const e = emitir('fijar', { vista: 'documento', ruta: 'x.html', fijar: true }, 'conv-1', t)
    expect(e.destino).toMatchObject({ motivo: 'escribio', vivo: false })
    expect(e.destino.cliente?.id).toBe('w-laptop')
    expect(e.objetivos).toEqual([])   // dormida: nadie acusa ahora; la cola es de su dispositivo
    expect(sincronizar(nuevo('w-studio', { conversacion: 'otra' }), t).comandos).toEqual([])
    expect(sincronizar({ clientId: 'w-viejo', pestanas: [] }, t).comandos).toEqual([])
    // La laptop reabre la app (otra sesión, mismo dispositivo): el pedido de su cola le llega a ella.
    expect(sincronizar(nuevo('w-laptop-2', { dispositivo: 'disp-w-laptop', conversacion: 'conv-1' }), t + 1000).comandos.map(c => c.id)).toEqual([e.comando.id])
  })

  it('con dos pestañas del mismo dispositivo, solo la de la conversación recibe el pedido', () => {
    const t = Date.now()
    sincronizar(nuevo('w-a', { dispositivo: 'disp-mac', conversacion: 'otra', escribio: {} }), t)
    sincronizar(nuevo('w-b', { dispositivo: 'disp-mac', conversacion: 'conv-1' }), t)
    const e = emitir('fijar', { vista: 'finanzas', fijar: true }, 'conv-1', t)
    expect(e.objetivos.map(c => c.id)).toEqual(['w-b'])
    expect(sincronizar(nuevo('w-a', { dispositivo: 'disp-mac', conversacion: 'otra', escribio: {} }), t).comandos).toEqual([])
    expect(sincronizar(nuevo('w-b', { dispositivo: 'disp-mac', conversacion: 'conv-1' }), t).comandos).toHaveLength(1)
  })

  it('sin conversación conocida va al último cliente donde Daniel escribió; sin ningún escrito, a nadie', () => {
    const t = Date.now()
    sincronizar({ clientId: 'w-viejo', etiqueta: 'Arbrain en el navegador', pestanas: [] }, t)
    expect(emitir('fijar', { vista: 'finanzas', fijar: true }, undefined, t).destino.motivo).toBe('ninguno')
    sincronizar(nuevo('w-app', { escribio: { 'conv-9': new Date(t - 2000).toISOString() } }), t)
    expect(emitir('fijar', { vista: 'finanzas', fijar: true }, undefined, t).destino.cliente?.id).toBe('w-app')
  })

  it('panel listar: nombre legible (app, aparato, sesión), ventana de cada pestaña y a quién le llegan los pedidos', () => {
    const t = Date.now()
    sincronizar(nuevo('w-app', { casaEn: { tareas: 'Ventana 1', taller: 'Ventana 1' }, casa: { tareas: true, taller: true }, pestanas: [p('levy-1', 'documento', 'Video A', { deLevy: true }), p('levy-2', 'documento', 'Video B', { deLevy: true, enVentana: true, ventana: 'Ventana 1' })] }), t)
    sincronizar({ clientId: 'w-viejo', etiqueta: 'Arbrain en el navegador', pestanas: [], usuario: 'Daniel', equipo: 'Mac · Chrome · local' }, t)
    const txt = describirPanel(t, undefined, 'conv-1').text
    expect(txt).toMatch(/App de prueba · Mac · local · sesión de Daniel/)
    expect(txt).toMatch(/Arbrain en el navegador · Mac · Chrome · local · sesión de Daniel/)
    expect(txt).toMatch(/Tareas \(Ventana 1\) y Taller \(Ventana 1\)/)
    expect(txt).toMatch(/levy-1.*en el Panel principal/)
    expect(txt).toMatch(/levy-2.*en la Ventana 1 \(no en el panel principal\)/)
    expect(txt).toMatch(/w-app.*RECIBE lo que abras en esta conversación/)
    expect(txt).toMatch(/w-viejo.*no recibe tus pedidos/)
  })

  it('el acuse dice en qué ventana quedó lo que se abrió', () => {
    const t = Date.now()
    sincronizar(nuevo('w-app'), t)
    const { comando, objetivos, destino } = emitir('fijar', { vista: 'finanzas', fijar: true }, 'conv-1', t)
    sincronizar(nuevo('w-app', { acuses: [{ comando: comando.id, ok: true, detalle: '', cerradas: [], abiertas: ['Finanzas'], donde: 'Ventana 1 (la de la izquierda)', pestanas: [p('levy-1', 'finanzas', 'Finanzas', { deLevy: true, enVentana: true, ventana: 'Ventana 1' })] }] }), t)
    const acuses = JSON.parse(readFileSync(path.join(dir, `cmd-${comando.id}.json`), 'utf8')).acuses
    const r = informe(comando, objetivos, acuses, t, undefined, destino)
    expect(r.confirmado).toBe(true)
    expect(r.text).toMatch(/dejó abierta «Finanzas» en Ventana 1 \(la de la izquierda\)/)
    expect(r.text).toMatch(/«Finanzas» \(Ventana 1\)/)
  })
})
