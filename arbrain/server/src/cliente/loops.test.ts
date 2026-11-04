/**
 * Loops de negocio (3 nov 2026, prototipo detrás de ARBRAIN_LOOPS=1): catálogo, agregar en un clic, contrato de corrida,
 * excepción a la bandeja (Sí · No · Otro), piso de «pregunta antes», pausa tras tres fallas y la decisión que vuelve al loop.
 * Sobre la base real (SQLite en una carpeta temporal) y la tienda de confirmaciones real.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const store = mkdtempSync(join(tmpdir(), 'arbrain-loops-'))
const previo = { store: process.env.CLAUDECLAW_STORE_DIR, loops: process.env.ARBRAIN_LOOPS }
process.env.CLAUDECLAW_STORE_DIR = store

type L = typeof import('./loops.js')
type Db = typeof import('../db.js')
type C = typeof import('./confirmaciones.js')
let l: L, db: Db, conf: C
let tienda: InstanceType<C['Confirmaciones']>
const ON = { ARBRAIN_LOOPS: '1' } as NodeJS.ProcessEnv

beforeAll(async () => {
  db = await import('../db.js')
  l = await import('./loops.js')
  conf = await import('./confirmaciones.js')
  db.initDatabase()
})
afterAll(() => {
  if (previo.store === undefined) delete process.env.CLAUDECLAW_STORE_DIR; else process.env.CLAUDECLAW_STORE_DIR = previo.store
  if (previo.loops === undefined) delete process.env.ARBRAIN_LOOPS; else process.env.ARBRAIN_LOOPS = previo.loops
  rmSync(store, { recursive: true, force: true })
})
beforeEach(() => {
  const d = db.getDb()
  d.prepare('DELETE FROM scheduled_tasks').run()
  d.exec('DROP TABLE IF EXISTS loops_agregados; DROP TABLE IF EXISTS loops_corridas; DROP TABLE IF EXISTS loops_por_hacer; DROP TABLE IF EXISTS confirmaciones')
  tienda = new conf.Confirmaciones(d)
  tienda.alRetomar(c => { l.alDecidirLoop(c) })
  l.registrarCorredorLoops(() => {})
})

const rutas = (metodo: string, ruta: string, cuerpo: Record<string, unknown> = {}, env = ON) => l.atenderLoops(metodo, ruta, cuerpo, { store: () => tienda, env })!
const agregar = (plantilla: string) => rutas('POST', '/loops/agregar', { plantilla })

const EXCEPCION_COBRO = `Revisé las fichas.

EXCEPCIÓN
**Título:** ¿Le mando el recordatorio a Ferretería Fulano por 1,111 (vencido hace 12 días)?
**Recomiendo:** Sí
**Por qué:** La factura F-104 venció el 22 de octubre y la ficha no registra pago. Un recordatorio hoy evita que se enfríe.
**Exacto:** Para: Fulano (WhatsApp)
Hola Fulano, te escribo por la factura F-104 del 22 de octubre.
¿Me confirmas la fecha de pago?
**Acción:** contactar
**Clave:** cobro-ferreteria-fulano-f104

Nota del loop: Ferretería Fulano debe F-104; Clínica Zutano pagó el 30 oct.`

describe('el catálogo', () => {
  it('trae al menos 6 plantillas de negocio, con ids únicos y las tres prioridades', () => {
    expect(l.PLANTILLAS.length).toBeGreaterThanOrEqual(6)
    expect(new Set(l.PLANTILLAS.map(p => p.id)).size).toBe(l.PLANTILLAS.length)
    expect(new Set(l.PLANTILLAS.map(p => p.prioridad))).toEqual(new Set([1, 2, 3]))
    for (const id of ['cobranza-pendiente', 'leads-sin-responder', 'agenda-manana', 'flujo-caja-semana', 'resenas-nuevas', 'competencia']) expect(l.plantilla(id), id).toBeTruthy()
  })

  it('cada plantilla tiene horario válido para una rutina (cinco campos, no más seguido que cada 15 min), modelo y esfuerzo', async () => {
    const { validarHorario } = await import('./rutinas.js')
    for (const p of l.PLANTILLAS) {
      expect(validarHorario(p.schedule).ok, p.id).toBe(true)
      expect(['haiku', 'sonnet', 'opus']).toContain(p.modelo)
      expect(['low', 'medium', 'high']).toContain(p.esfuerzo)
      expect(p.prompt.split('\n')[0]).toBe(p.nombre)
      expect(p.prompt.length).toBeLessThanOrEqual(2000)
    }
  })

  it('las que contactan, pagan o publican nacen en «pregunta antes» con cualquier preset, aunque se intente bajar a «hacer»', async () => {
    const { armarPolitica, PRESETS } = await import('../autonomia/politica.js')
    const irreversibles = l.PLANTILLAS.filter(p => p.toca)
    expect(irreversibles.map(p => p.id).sort()).toEqual(['cobranza-pendiente', 'leads-sin-responder', 'pagos-por-vencer', 'resenas-nuevas'])
    for (const preset of PRESETS) {
      const forzada = armarPolitica(preset, { contactar: 'hacer', pagar: 'hacer', publicar: 'hacer' }, true).vigente
      for (const p of irreversibles) expect(l.modoLoop(p, forzada), `${p.id} en ${preset}`).not.toBe('solo-revisa')
      for (const p of irreversibles) expect(['pregunta-antes', 'lo-haces-tu']).toContain(l.modoLoop(p, forzada))
    }
    // Las que solo revisan lo dicen.
    expect(l.modoLoop(l.plantilla('agenda-manana')!)).toBe('solo-revisa')
  })
})

describe('agregar en un clic', () => {
  it('apagado: 404 y no crea nada', () => {
    expect(rutas('GET', '/loops', {}, { ARBRAIN_LOOPS: '0' } as NodeJS.ProcessEnv).status).toBe(404)
    expect(rutas('POST', '/loops/agregar', { plantilla: 'cobranza-pendiente' }, { ARBRAIN_LOOPS: '0' } as NodeJS.ProcessEnv).status).toBe(404)
    expect(db.listTasks()).toHaveLength(0)
  })

  it('crea una rutina real activa, con el texto y el horario de la plantilla, y la registra como loop', () => {
    const r = agregar('cobranza-pendiente')
    expect(r.status).toBe(201)
    const id = r.cuerpo.rutina as string
    expect(id).toMatch(/^loop-cobranza-pendiente-[a-z0-9]+$/)
    const t = db.getTask(id)!
    expect(t).toMatchObject({ status: 'active', schedule: '0 9 * * 1-5' })
    expect(t.prompt).toBe(l.plantilla('cobranza-pendiente')!.prompt)
    expect(t.next_run).toBeGreaterThan(Date.now() / 1000)
    expect(l.plantillaDeRutina(id)?.id).toBe('cobranza-pendiente')
    expect(l.opcionesLoop(id)).toEqual({ model: 'sonnet', effort: 'medium' })
  })

  it('una por plantilla: la segunda vez dice cuál ya existe; si el dueño la borró, se puede volver a agregar', () => {
    const id = agregar('agenda-manana').cuerpo.rutina as string
    const otra = agregar('agenda-manana')
    expect(otra.status).toBe(409)
    expect(otra.cuerpo.rutina).toBe(id)
    db.deleteTask(id)
    expect(agregar('agenda-manana').status).toBe(201)
  })

  it('una plantilla que no existe no crea nada', () => {
    expect(agregar('robar-bancos').status).toBe(400)
    expect(db.listTasks()).toHaveLength(0)
  })
})

describe('leer la corrida', () => {
  it('«EN ORDEN» con su nota', () => {
    expect(l.leerResultadoLoop('EN ORDEN: revisé 4 fichas, nadie debe.\nNota del loop: todo pagado al 3 nov.')).toEqual({ tipo: 'en-orden', resumen: 'revisé 4 fichas, nadie debe.', nota: 'todo pagado al 3 nov.' })
  })

  it('la excepción con etiquetas en negritas y un mensaje de varias líneas', () => {
    const r = l.leerResultadoLoop(EXCEPCION_COBRO)
    expect(r).toMatchObject({ tipo: 'excepcion', recomienda: 'si', accion: 'contactar', clave: 'cobro-ferreteria-fulano-f104' })
    if (r.tipo !== 'excepcion') throw new Error('no')
    expect(r.titulo).toMatch(/^¿Le mando el recordatorio a Ferretería Fulano/)
    expect(r.exacto).toContain('Hola Fulano')
    expect(r.exacto).toContain('¿Me confirmas la fecha de pago?')
    expect(r.nota).toMatch(/F-104/)
  })

  it('un «en orden» largo se corta en un fin de frase, con «…», nunca a media palabra', () => {
    const largo = `EN ORDEN: ${'Revisé los tres eventos de mañana y no hay choques. '.repeat(8)}Objetivo principal con su bloque`
    const r = l.leerResultadoLoop(largo)
    if (r.tipo !== 'en-orden') throw new Error(`esperaba en orden, llegó ${r.tipo}`)
    expect(r.resumen.length).toBeLessThanOrEqual(301)
    expect(r.resumen).toMatch(/choques\.…$/)
  })

  it('lo que no respeta el contrato no se toma por «en orden»', () => {
    expect(l.leerResultadoLoop('Listo, revisé todo.').tipo).toBe('sin-contrato')
    expect(l.leerResultadoLoop('EXCEPCIÓN\nPor qué: algo').tipo).toBe('sin-contrato')
  })

  it('la categoría: la acción declarada o, con texto exacto, el piso de la plantilla; «ninguna» sin texto es otra', () => {
    const cobranza = l.plantilla('cobranza-pendiente')!
    expect(l.categoriaDeExcepcion(cobranza, { accion: 'contactar', exacto: 'x' })).toBe('enviar')
    expect(l.categoriaDeExcepcion(cobranza, { accion: null, exacto: 'Hola Fulano' })).toBe('enviar')
    expect(l.categoriaDeExcepcion(cobranza, { accion: 'ninguna', exacto: null })).toBe('otra')
    expect(l.categoriaDeExcepcion(l.plantilla('pagos-por-vencer')!, { accion: null, exacto: '1,111 a Proveedor Zutano' })).toBe('pagar')
    expect(l.categoriaDeExcepcion(l.plantilla('agenda-manana')!, { accion: 'contactar', exacto: 'x' })).toBe('enviar')
  })
})

describe('cerrar una corrida', () => {
  it('en orden se archiva sola: sin tarjeta y sin aviso', () => {
    const id = agregar('agenda-manana').cuerpo.rutina as string
    const c = l.cerrarCorridaLoop(id, { ok: true, texto: 'EN ORDEN: mañana cuadra.' }, { store: () => tienda })!
    expect(c).toMatchObject({ estado: 'en-orden', avisar: false, texto: 'En orden: mañana cuadra.' })
    expect(tienda.pendientes()).toHaveLength(0)
  })

  it('la excepción sube a la bandeja como tarjeta Sí · No · Otro, con el texto exacto, y la misma clave no se apila', async () => {
    const id = agregar('cobranza-pendiente').cuerpo.rutina as string
    const c = l.cerrarCorridaLoop(id, { ok: true, texto: EXCEPCION_COBRO, manual: true }, { store: () => tienda })!
    expect(c).toMatchObject({ estado: 'excepcion', avisar: true })
    const [t] = tienda.pendientes()
    expect(t).toMatchObject({ id: c.decision, tipo: 'decision', origen: 'cron', estado: 'en_cola', categoria: 'enviar', recomienda: 'si', resumen: 'Loop · Cobranza pendiente' })
    expect(t.detalle).toContain('Hola Fulano')
    const { tarjeta } = await import('../autonomia/bandeja.js')
    expect(tarjeta(t)).toMatchObject({ de: 'Loop · Cobranza pendiente', irreversible: true })
    // La siguiente corrida ve lo mismo: la tarjeta se actualiza en su lugar.
    l.cerrarCorridaLoop(id, { ok: true, texto: EXCEPCION_COBRO.replace('12 días', '13 días') }, { store: () => tienda })
    expect(tienda.pendientes()).toHaveLength(1)
    expect(tienda.pendientes()[0].titulo).toContain('13 días')
  })

  it('tres fallas seguidas del agente pausan el loop; no tener llave no cuenta', async () => {
    const { MENSAJE_FALTA_LLAVE } = await import('./llaves.js')
    const id = agregar('competencia').cuerpo.rutina as string
    for (let i = 0; i < 5; i++) l.cerrarCorridaLoop(id, { ok: false, error: MENSAJE_FALTA_LLAVE }, { store: () => tienda })
    expect(db.getTask(id)!.status).toBe('active')
    l.cerrarCorridaLoop(id, { ok: false, error: 'timeout' }, { store: () => tienda })
    l.cerrarCorridaLoop(id, { ok: false, error: 'timeout' }, { store: () => tienda })
    expect(db.getTask(id)!.status).toBe('active')
    const tercera = l.cerrarCorridaLoop(id, { ok: false, error: 'timeout' }, { store: () => tienda })!
    expect(tercera).toMatchObject({ pausado: true, avisar: true })
    expect(db.getTask(id)!.status).toBe('paused')
  })

  it('una rutina que no es loop no se toca', () => {
    expect(l.cerrarCorridaLoop('rutina-resumeme-mi-dia-abc', { ok: true, texto: 'hola' }, { store: () => tienda })).toBeNull()
    expect(l.promptDeCorridaLoop('rutina-x', 'tal cual')).toBe('tal cual')
  })
})

describe('la decisión vuelve al loop', () => {
  it('Sí: se anota, el loop corre ya y su siguiente texto trae la orden una sola vez', () => {
    const correr = vi.fn()
    l.registrarCorredorLoops(correr)
    const id = agregar('cobranza-pendiente').cuerpo.rutina as string
    const c = l.cerrarCorridaLoop(id, { ok: true, texto: EXCEPCION_COBRO }, { store: () => tienda })!
    expect(tienda.resolver(c.decision!, 'permitir').ok).toBe(true)
    expect(correr).toHaveBeenCalledWith(id)
    const texto = l.promptDeCorridaLoop(id, db.getTask(id)!.prompt)
    expect(texto).toContain('Contrato del loop')
    expect(texto).toMatch(/respondió SÍ/)
    expect(texto).toContain('Hola Fulano')
    expect(texto).toMatch(/Nota del loop|Notas de corridas anteriores/)
    // Ya tomada: la siguiente corrida no la repite, pero recuerda que ya se decidió.
    const despues = l.promptDeCorridaLoop(id, db.getTask(id)!.prompt)
    expect(despues).not.toMatch(/respondió SÍ/)
    expect(despues).toMatch(/Lo que el dueño ya decidió[\s\S]*Sí a «¿Le mando/)
  })

  it('No: se anota y no corre nada; Otro viaja con lo que escribió', () => {
    const correr = vi.fn()
    l.registrarCorredorLoops(correr)
    const id = agregar('cobranza-pendiente').cuerpo.rutina as string
    const a = l.cerrarCorridaLoop(id, { ok: true, texto: EXCEPCION_COBRO }, { store: () => tienda })!
    tienda.resolver(a.decision!, 'rechazar')
    expect(correr).not.toHaveBeenCalled()
    const b = l.cerrarCorridaLoop(id, { ok: true, texto: EXCEPCION_COBRO.replace('f104', 'f105') }, { store: () => tienda })!
    tienda.resolver(b.decision!, 'otro', { comentario: 'Mejor le llamo yo el jueves' })
    expect(correr).toHaveBeenCalledTimes(1)
    expect(l.promptDeCorridaLoop(id, 'x')).toMatch(/respondió OTRO: «Mejor le llamo yo el jueves»/)
  })

  it('una decisión que no es de un loop sigue su camino de siempre', () => {
    const c = tienda.pedir({ origen: 'agente', tipo: 'decision', categoria: 'otra', creadaPor: 'peticion', enCola: true, titulo: 'x', resumen: 'x', huella: 'decision:x' })
    expect(l.alDecidirLoop({ ...c, estado: 'permitida', respuesta: 'si' })).toBe(false)
  })
})

describe('lo que ve la app', () => {
  it('catálogo con lo agregado, corridas de 7 días y el resumen: solas contra en tu bandeja', () => {
    const cobro = agregar('cobranza-pendiente').cuerpo.rutina as string
    const agenda = agregar('agenda-manana').cuerpo.rutina as string
    l.cerrarCorridaLoop(agenda, { ok: true, texto: 'EN ORDEN: mañana cuadra.' }, { store: () => tienda })
    l.cerrarCorridaLoop(agenda, { ok: true, texto: 'EN ORDEN: sin choques.' }, { store: () => tienda })
    l.cerrarCorridaLoop(cobro, { ok: true, texto: EXCEPCION_COBRO }, { store: () => tienda })
    const v = rutas('GET', '/loops')
    expect(v.status).toBe(200)
    const cuerpo = v.cuerpo as { plantillas: { id: string; agregado: { rutina: string } | null; modo: string }[]; corridas: { estado: string; tarjeta?: { de?: string } }[]; resumen: Record<string, number> }
    expect(cuerpo.plantillas.find(p => p.id === 'cobranza-pendiente')!.agregado!.rutina).toBe(cobro)
    expect(cuerpo.plantillas.find(p => p.id === 'cobranza-pendiente')!.modo).not.toBe('solo-revisa')
    expect(cuerpo.plantillas.find(p => p.id === 'competencia')!.agregado).toBeNull()
    expect(cuerpo.resumen).toMatchObject({ loops: 2, corridas: 3, solas: 2, enBandeja: 1, fallas: 0 })
    expect(cuerpo.corridas[0]).toMatchObject({ estado: 'excepcion', tarjeta: { de: 'Loop · Cobranza pendiente' } })
  })
})
