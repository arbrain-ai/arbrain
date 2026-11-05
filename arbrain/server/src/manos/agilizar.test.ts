/**
 * Agilizar el flujo web (4 nov 2026, docs/builds/manos-agilizar-2026-11-04/REPORTE.md). Cada bloque es una de las
 * fallas del borrador de Skool de ese día:
 *   (b) la captura salía en px de pantalla y el x,y leído ahí caía en otro post;
 *   (c) el freno trataba como «pestaña de Daniel» la ventana que la extensión abrió para el encargo;
 *   (d) una tarjeta de la bandeja quedó colgada después de que el encargo terminó;
 *   (e) no había receta: la tarea entera dependía del modelo.
 * (a), el clic por texto y los clicables sin rol, viven en la extensión: los prueba `web/prueba-skool.ts` en Chrome.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { createServer, type Server } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Confirmaciones } from '../cliente/confirmaciones.js'
import { rutasBandeja } from '../autonomia/bandeja.js'
import { _politicaAutonomiaParaPruebas } from '../autonomia/politica.js'
import { Freno, juzgar } from './freno.js'
import { fijarContextoToque, pedirToque, tarjetasDelEncargo } from './confirmacion-humana.js'
import { ejecutarEncargar, tarjetasQueQuedan } from './encargar.js'
import { SesionWeb, ejecutarWeb, escalaCaptura } from './web/herramientas-web.js'
import { adoptarVentanaWeb, mismoTitulo } from './web/ventanas-web.js'
import { recetaWebDelPedido, listarRecetasWeb } from './web/recetas-web.js'
import type { Adaptador, ContextoAccion, Ventana } from './contrato.js'
import type { CanalWeb } from './web/cliente.js'

// ---------- (e) La receta reconoce el pedido ----------

describe('receta skool_borrador_post: el pedido', () => {
  const URL = 'https://www.skool.com/skool-accelerator-8190'
  it('saca la URL, la categoría, el título y el cuerpo (el cuerpo puede llevar comillas y saltos)', () => {
    const r = recetaWebDelPedido(`En ${URL} deja un borrador sin publicar: categoría «Wins» · título «Mi primer cliente» · cuerpo «Línea uno con «comillas».\nLínea dos.»`)
    expect(r).toEqual({ nombre: 'skool_borrador_post', parametros: { url: URL, categoria: 'Wins', titulo: 'Mi primer cliente', cuerpo: 'Línea uno con «comillas».\nLínea dos.' } })
  })
  it('el orden de los campos no importa mientras el cuerpo vaya al final', () => {
    expect(recetaWebDelPedido(`draft en ${URL}, título: «A» categoría: «Feedback» cuerpo: «B»`)?.parametros).toMatchObject({ titulo: 'A', categoria: 'Feedback', cuerpo: 'B' })
  })
  it('no aplica si el pedido pide publicar, si falta un dato o si no es Skool', () => {
    expect(recetaWebDelPedido(`En ${URL} escribe el borrador y publícalo: categoría «Wins» · título «A» · cuerpo «B»`)).toBeNull()
    expect(recetaWebDelPedido(`En ${URL} deja un borrador: categoría «Wins» · cuerpo «B»`)).toBeNull()
    expect(recetaWebDelPedido('En https://x.com/home deja un borrador: categoría «Wins» · título «A» · cuerpo «B»')).toBeNull()
    expect(recetaWebDelPedido(`Abre ${URL} y dime qué hay`)).toBeNull()
  })
  it('«sin publicar» no cuenta como pedir publicar', () => {
    expect(recetaWebDelPedido(`Deja en ${URL} un borrador, sin publicar nada: categoría «Wins» · título «A» · cuerpo «B»`)).not.toBeNull()
  })
  it('se lista para el MCP con sus parámetros', () => {
    expect(listarRecetasWeb().map(r => r.nombre)).toContain('skool_borrador_post')
  })
})

// ---------- (b) La captura dice su escala ----------

describe('captura web: coordenadas coherentes con web_actuar', () => {
  const png = (w: number, h: number) => { const b = Buffer.alloc(33); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b.toString('base64') }
  it('la extensión nueva la da en px de la página y la cabecera lo dice', () => {
    const t = escalaCaptura({ png: png(1280, 757), ancho: 1280, alto: 757, escala_original: 2 })
    expect(t).toMatch(/1280×757 px, los mismos de la página/)
    expect(t).toMatch(/2×; ya está reescalada/)
  })
  it('una captura al doble que la página (extensión vieja) avisa cuánto dividir', () => {
    expect(escalaCaptura({ png: png(2560, 1514), ancho: 1280 })).toMatch(/divide x,y de la captura entre 2\.00/)
  })
  it('sin saber el tamaño de la página no deja leer coordenadas a ciegas', () => {
    expect(escalaCaptura({ png: png(3840, 2160) })).toMatch(/índice o texto_visible antes que leer coordenadas/)
  })
})

// ---------- (c) La ventana que abrió la extensión es propia ----------

function adaptadorFalso(ventanas: () => Ventana[]): Adaptador {
  return { nombre: 'falso', ventanas: async () => ventanas(), apps: async () => [], observar: async () => { throw new Error('no') }, actuar: async () => ({ ok: true, efecto: 'confirmado' }), abrir: async () => ({ pid: 1, ventanas: [] }), verificar: async () => ({ cumple: true, detalle: '' }), cursor: async () => ({ x: 0, y: 0 }), salud: async () => ({ ok: true }), cerrar: async () => {} } as unknown as Adaptador
}
const chrome = (id: number, titulo?: string): Ventana => ({ id, pid: 600, app: 'Google Chrome', titulo, marco: { x: 0, y: 0, w: 1200, h: 800 }, en_pantalla: true })
const clicEnChrome = (ventana: number) => ({ p: { accion: 'click' as const, ventana, ref: 'e112' }, c: { bundle: 'com.google.chrome', app: 'Google Chrome', elemento: { rol: 'AXStaticText', titulo: 'Escribe algo' } } as ContextoAccion })

describe('freno: la ventana de la extensión no es una pestaña de Daniel', () => {
  it('antes de adoptarla, un clic nativo ahí es pestana_de_daniel (lo que frenó el encargo dos veces)', () => {
    const { p, c } = clicEnChrome(11605)
    expect(juzgar(p, c, new Set()).categoria).toBe('pestana_de_daniel')
  })

  it('web_abrir adopta la ventana nueva con el título de la pestaña propia; la de Daniel no', async () => {
    let lista = [chrome(100, 'Gmail - Google Chrome - Daniel')]
    const freno = new Freno(adaptadorFalso(() => lista))
    const canal: CanalWeb = {
      llamar: async (metodo: string) => {
        if (metodo === 'abrir') {
          // Mientras abre, aparecen dos ventanas: la de la extensión y una que Daniel abrió a la vez.
          lista = [...lista, chrome(11605, 'Skool Accelerator'), chrome(11606, 'YouTube - Google Chrome - Daniel')]
          return { pestana: 7, titulo: 'Skool Accelerator', ventana_nueva: true } as any
        }
        if (metodo === 'observar') return { nodos: Array.from({ length: 6 }, (_, i) => ({ b: i + 1, rol: 'button', nombre: `b${i}`, prof: 0 })), url: 'https://www.skool.com/x', titulo: 'Skool Accelerator', total_ax: 6, ms_ax: 1 } as any
        return {} as any
      },
      cerrar: async () => {},
    }
    const s = new SesionWeb(canal)
    s.manos = freno
    const r = await ejecutarWeb('web_abrir', { url: 'https://www.skool.com/x', pedido: 'prueba' }, s)
    expect(r.error).toBeFalsy()
    expect([...freno.propias]).toEqual([11605])
    expect([...s.ventanasAdoptadas]).toEqual([11605])
    const { p, c } = clicEnChrome(11605)
    expect(juzgar(p, c, freno.propias).categoria).not.toBe('pestana_de_daniel')
    expect(juzgar(clicEnChrome(11606).p, c, freno.propias).categoria).toBe('pestana_de_daniel')
    // Al terminar el encargo deja de ser propia (pudo quedarse a la vista de Daniel).
    freno.soltarWeb()
    expect(freno.propias.size).toBe(0)
  })

  it('sin títulos solo se adopta si apareció exactamente una ventana', async () => {
    let lista: Ventana[] = []
    const freno = new Freno(adaptadorFalso(() => lista))
    lista = [chrome(5)]
    expect(await adoptarVentanaWeb(freno, new Set(), 'Skool', { intentos: 1 })).toEqual([5])
    // Una franja auxiliar de Chrome (30 px, sin título) no cuenta como ventana nueva.
    const conFranja = new Freno(adaptadorFalso(() => [chrome(6), { ...chrome(7), marco: { x: 0, y: 0, w: 1920, h: 30 } }]))
    expect(await adoptarVentanaWeb(conFranja, new Set(), 'Skool', { intentos: 1 })).toEqual([6])
    const otro = new Freno(adaptadorFalso(() => [chrome(8), chrome(9)]))
    expect(await adoptarVentanaWeb(otro, new Set(), 'Skool', { intentos: 1, esperaMs: 1 })).toEqual([])
  })

  it('el título de la ventana es el de la pestaña con lo que Chrome le añade', () => {
    expect(mismoTitulo('Skool Accelerator - Google Chrome - Daniel', 'Skool Accelerator')).toBe(true)
    expect(mismoTitulo('Skool Accelerator', 'Skool Accelerator')).toBe(true)
    expect(mismoTitulo('Skool Accelerator 2 - Google Chrome', 'Skool Accelerator')).toBe(false)
  })
})

// ---------- (d) Las tarjetas del encargo caducan con él ----------

describe('bandeja: las tarjetas que nacen de un encargo caducan cuando termina', () => {
  const TOKEN = 'token-agilizar'
  let db: Database.Database, store: Confirmaciones, servidor: Server
  const antes = { ...process.env }
  beforeAll(async () => {
    servidor = createServer(async (req, res) => {
      let cuerpo = ''
      for await (const t of req) cuerpo += t
      if ((req.headers.authorization ?? '') !== `Bearer ${TOKEN}`) { res.writeHead(401).end('{}'); return }
      const ruta = new URL(req.url ?? '/', 'http://x').pathname
      const ok = await rutasBandeja(req.method ?? 'GET', ruta, cuerpo ? JSON.parse(cuerpo) : {}, { store: () => store, conPase: false, db: () => db, puedeDecidir: () => false, enviar: (status, c) => { res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(c)) } })
      if (!ok) res.writeHead(404).end('{}')
    })
    await new Promise<void>(r => servidor.listen(0, '127.0.0.1', () => r()))
  })
  afterAll(() => new Promise<void>(r => servidor.close(() => r())))
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'agilizar-'))
    Object.assign(process.env, { MC_SERVER_PORT: String((servidor.address() as { port: number }).port), OPENCLAW_GATEWAY_TOKEN: TOKEN, ARBRAIN_CONFIRMAR_ESPERA_S: '0.3', ARBRAIN_POLITICA_AUTONOMIA: join(dir, 'politica.json'), ARBRAIN_HECHO_SOLO_DIR: join(dir, 'hecho'), MANOS_ENCARGOS_DIR: join(dir, 'encargos'), MANOS_BITACORA_DIR: join(dir, 'bitacora') })
    delete process.env.ARBRAIN_EDICION
    _politicaAutonomiaParaPruebas()
    fijarContextoToque(null)
    db = new Database(':memory:')
    db.exec(`CREATE TABLE chat_runtime_turns (turn_id TEXT, owner TEXT, account TEXT, conversation_id TEXT, native_thread_id TEXT, updated_at INTEGER)`)
    store = new Confirmaciones(db)
  })
  afterEach(() => { process.env = { ...antes }; fijarContextoToque(null) })

  const manos = { nombre: 'falso' } as unknown as Adaptador
  /** Un encargo cuyo cerebro hace clic en un botón sin nombre en Skool (la tarjeta del 4 nov) y termina como `fin`. */
  const encargo = (fin: (id: string) => { estado: 'fallo' | 'requiere_confirmacion'; detalle: string }) => ejecutarEncargar({ pedido: 'borrador en Skool', cita: 'deja el draft alla sin enviar', captura: false }, {
    manos, decisor: () => { throw new Error('sin decisor') },
    pedir: async () => {
      const t = await pedirToque({ categoriaFreno: 'boton_sin_texto', motivo: 'botón sin texto en un chat o compositor: puede enviar', herramienta: 'web:click', partes: [913710547, 4242, 'click', null, null, null], titulo: 'skool.com: botón sin texto' })
      expect(t.ok).toBe(false)
      const id = tarjetasDelEncargo()[0]
      const f = fin(id)
      return { ok: false, estado: f.estado, intentos: [], id: 'b1', ms: 10, detalle: f.detalle, pasos: [] } as any
    },
  })

  it('el encargo falla y su tarjeta sin contestar sale de la bandeja', async () => {
    let id = ''
    await encargo(x => { id = x; return { estado: 'fallo', detalle: 'no pude abrir el editor' } })
    expect(id).toMatch(/^cf_[0-9a-f]{12}$/)
    expect(store.get(id)?.estado).toBe('vencida')
    expect(store.pendientes().map(c => c.id)).not.toContain(id)
  })

  it('si el encargo vuelve preguntando por esa tarjeta, sigue esperando su toque', async () => {
    let id = ''
    await encargo(x => { id = x; return { estado: 'requiere_confirmacion', detalle: `espera el clic de la persona (quedó en su cola, ${x})` } })
    expect(store.get(id)?.estado).toBe('en_cola')
  })

  it('caducar no toca lo que la persona ya contestó ni lo que no es de manos', () => {
    const manosC = store.pedir({ origen: 'manos', categoria: 'enviar', resumen: 'x', huella: 'manos:a', creadaPor: 'peticion' })
    const agente = store.pedir({ origen: 'agente', categoria: 'enviar', resumen: 'y', huella: 'agente:b', creadaPor: 'peticion' })
    store.resolver(manosC.id, 'rechazar')
    expect(store.caducar(manosC.id)).toBeNull()
    expect(store.caducar(agente.id)).toBeNull()
    expect(store.get(agente.id)?.estado).toBe('pendiente')
  })

  it('las que quedan son solo las que el encargo pregunta', () => {
    expect([...tarjetasQueQuedan({ estado: 'requiere_confirmacion', resultado: 'espera cf_0123456789ab', pregunta: '' })]).toEqual(['cf_0123456789ab'])
    expect(tarjetasQueQuedan({ estado: 'fallo', resultado: 'cf_0123456789ab' }).size).toBe(0)
  })
})
