import { afterEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ConversacionesNuevas, ConversacionInvalida, OrdenesConversacion, TOPES_ENVIO, atenderOrdenes, mensajeEntreConversaciones, ordenarComoLaBarra,
  ordenesPorLaWeb, parseOrden, semaforoDe, type DepsOrdenes, type FilaConversacion, type PedidoWebOrden,
} from './conversaciones.js'
import { etiquetaDespertador } from '../chat-runtime/despertadores.js'
import { esTurnoSintetico } from '../chat-runtime/journal.js'

const ORIGEN = 'aaaaaaaa-0000-4000-8000-000000000001'
const DESTINO = 'd2348403-f5ef-4953-9271-1bfcded6b97b'
const scope = { owner: 'dueno-1', account: 'default', conversationId: ORIGEN }
const log = { info: () => {}, warn: () => {} }

function fila(id: string, extra: Partial<FilaConversacion> = {}): FilaConversacion {
  return { id, title: `T ${id.slice(0, 4)}`, account: null, is_favorite: false, pinned_position: null, last_role: 'assistant', last_message_at: '2026-11-06T18:00:00Z', last_read_at: '2026-11-06T18:10:00Z', updated_at: '2026-11-06T18:00:00Z', archived_at: null, ...extra }
}

/** Una web de mentira con las filas de UN dueño: lo de otro dueño nunca vuelve (como la ruta real). */
function webFalsa(filas: FilaConversacion[], dueno = 'dueno-1') {
  const pedidos: PedidoWebOrden[] = []
  const web = async (p: PedidoWebOrden) => {
    pedidos.push(p)
    if (p.ownerId !== dueno) return { ok: true as const, conversaciones: [] }
    if (p.accion === 'listar') return { ok: true as const, conversaciones: p.ids ? filas.filter(f => p.ids!.includes(f.id)) : filas }
    const f = filas.find(x => x.id === p.id)
    if (!f) return { ok: false as const, motivo: 'Conversación no encontrada.', definitivo: true }
    if (p.accion === 'renombrar') f.title = p.titulo
    else f.is_favorite = p.accion === 'fijar'
    return { ok: true as const, conversacion: f }
  }
  return { web, pedidos }
}

function deps(web: DepsOrdenes['web'], extra: Partial<DepsOrdenes> = {}) {
  const aceptados: Array<{ id: { owner: string; account: string; conversationId: string; turnId: string }; input: Record<string, unknown> }> = []
  const d: DepsOrdenes = {
    web, activos: () => [], turnoExiste: () => false, previo: () => undefined,
    seleccion: async () => ({ claudeSelection: { model: 'por-defecto' } }),
    aceptar: (id, input) => { aceptados.push({ id, input }) },
    ...extra,
  }
  return { d, aceptados }
}

describe('parseOrden', () => {
  it('sin accion o crear es la conversación nueva de siempre', () => {
    expect(parseOrden({ titulo: 'a', mensaje: 'b' })).toBeNull()
    expect(parseOrden({ accion: 'crear', titulo: 'a', mensaje: 'b' })).toBeNull()
  })
  it('valida cada accion', () => {
    expect(parseOrden({ accion: 'listar' })).toEqual({ accion: 'listar' })
    expect(parseOrden({ accion: 'fijar', id: ' D2348403 ' })).toEqual({ accion: 'fijar', id: 'd2348403' })
    expect(parseOrden({ accion: 'renombrar', id: DESTINO, titulo: '  Clases   de la semana ' })).toEqual({ accion: 'renombrar', id: DESTINO, titulo: 'Clases de la semana' })
    expect(parseOrden({ accion: 'enviar', id: DESTINO, mensaje: ' revisa X ' })).toEqual({ accion: 'enviar', id: DESTINO, mensaje: 'revisa X' })
    expect(() => parseOrden({ accion: 'borrar', id: DESTINO })).toThrow(/accion/)
    expect(() => parseOrden({ accion: 'archivar', id: DESTINO })).toThrow(ConversacionInvalida)
    expect(() => parseOrden({ accion: 'fijar' })).toThrow(/id/)
    expect(() => parseOrden({ accion: 'fijar', id: 'd23' })).toThrow(/id inválido/)
    expect(() => parseOrden({ accion: 'renombrar', id: DESTINO })).toThrow(/titulo/)
    expect(() => parseOrden({ accion: 'renombrar', id: DESTINO, titulo: 'x'.repeat(81) })).toThrow(/80/)
    expect(() => parseOrden({ accion: 'enviar', id: DESTINO })).toThrow(/mensaje/)
    expect(() => parseOrden({ accion: 'enviar', id: DESTINO, mensaje: '/compact' })).toThrow(/comando/)
    expect(() => parseOrden({ accion: 'enviar', id: DESTINO, mensaje: 'x'.repeat(6001) })).toThrow(/6000/)
  })
})

describe('semáforo y orden de la barra', () => {
  it('gris, amarillo, azul y morado salen de las mismas fuentes que la barra', () => {
    const vista = fila(DESTINO)
    expect(semaforoDe(vista)).toBe('gris')
    expect(semaforoDe({ ...vista, last_read_at: '2026-11-06T17:00:00Z' })).toBe('morado')
    expect(semaforoDe({ ...vista, last_read_at: null })).toBe('morado')
    expect(semaforoDe({ ...vista, last_role: 'user', last_read_at: null })).toBe('gris')
    expect(semaforoDe(vista, 'running')).toBe('amarillo')
    expect(semaforoDe(vista, 'queued')).toBe('amarillo')
    expect(semaforoDe(vista, 'waiting')).toBe('azul')
  })
  it('fijadas primero (recién fijadas arriba, luego por posición) y el resto por último mensaje', () => {
    const r = ordenarComoLaBarra([
      fila('11111111-0000-4000-8000-000000000000', { last_message_at: '2026-11-06T20:00:00Z' }),
      fila('22222222-0000-4000-8000-000000000000', { is_favorite: true, pinned_position: 1 }),
      fila('33333333-0000-4000-8000-000000000000', { is_favorite: true, pinned_position: null }),
      fila('44444444-0000-4000-8000-000000000000', { last_message_at: '2026-11-06T21:00:00Z' }),
      fila('55555555-0000-4000-8000-000000000000', { is_favorite: true, pinned_position: 0 }),
    ])
    expect(r.map(f => f.id.slice(0, 1))).toEqual(['3', '5', '2', '4', '1'])
  })
})

describe('OrdenesConversacion: topes contra bucles', () => {
  it('no se puede enviar a la propia conversación (ni por prefijo)', () => {
    const store = new OrdenesConversacion(new Database(':memory:'))
    expect(() => store.pedir(scope, { accion: 'enviar', id: ORIGEN, mensaje: 'm' })).toThrow(/misma conversación/)
    expect(() => store.pedir(scope, { accion: 'enviar', id: ORIGEN.slice(0, 8), mensaje: 'm' })).toThrow(/misma conversación/)
  })
  it('tope por conversación de origen, por destino y por dueño (que suma lo creado)', () => {
    let ahora = 1_000_000
    const db = new Database(':memory:')
    const store = new OrdenesConversacion(db, () => ahora)
    for (let i = 0; i < TOPES_ENVIO.porHoraPorConversacion; i++) store.pedir(scope, { accion: 'enviar', id: `bbbbbbbb-0000-4000-8000-00000000000${i}`, mensaje: 'm' })
    expect(() => store.pedir(scope, { accion: 'enviar', id: DESTINO, mensaje: 'm' })).toThrow(/tope/)
    // Otra conversación de origen sí puede… hasta el tope del destino.
    for (let i = 0; i < TOPES_ENVIO.porHoraPorDestino; i++) store.pedir({ ...scope, conversationId: `cccccccc-0000-4000-8000-00000000000${i}` }, { accion: 'enviar', id: DESTINO, mensaje: 'm' })
    expect(() => store.pedir({ ...scope, conversationId: 'cccccccc-0000-4000-8000-000000000009' }, { accion: 'enviar', id: DESTINO, mensaje: 'm' })).toThrow(/recibió/)
    // El del dueño suma las conversaciones nuevas.
    const nuevas = new ConversacionesNuevas(db, () => ahora)
    for (let i = 0; i < TOPES_ENVIO.porHoraPorDueno - 12; i++) nuevas.pedir({ ...scope, conversationId: `eeeeeeee-0000-4000-8000-0000000000${String(i).padStart(2, '0')}` }, { titulo: 'T', mensaje: 'M' })
    expect(() => store.pedir({ ...scope, conversationId: 'ffffffff-0000-4000-8000-000000000000' }, { accion: 'enviar', id: 'abababab-0000-4000-8000-000000000000', mensaje: 'm' })).toThrow(/20/)
    ahora += 3_600_001
    expect(store.pedir(scope, { accion: 'enviar', id: DESTINO, mensaje: 'm' }).estado).toBe('pendiente')
  })
  it('sin conversación de origen no hay orden', () => {
    const store = new OrdenesConversacion(new Database(':memory:'))
    expect(() => store.pedir({ ...scope, conversationId: '' }, { accion: 'listar' })).toThrow(/conversación del chat/)
  })
})

describe('atenderOrdenes', () => {
  it('listar: filas del dueño con su estado vivo, en el orden de la barra', async () => {
    const store = new OrdenesConversacion(new Database(':memory:'))
    const { web } = webFalsa([fila(ORIGEN), fila(DESTINO, { title: 'wtf. investiga y ayudame', is_favorite: true, pinned_position: 0, last_read_at: '2026-11-06T17:00:00Z' })])
    const p = store.pedir(scope, { accion: 'listar' })
    expect(await atenderOrdenes(store, deps(web, { activos: () => [{ conversationId: ORIGEN, status: 'running' }] }).d, log)).toBe(1)
    expect(store.get(p.id)!.resultado).toEqual([
      { id: DESTINO, titulo: 'wtf. investiga y ayudame', estado: 'morado', fijada: true, posicion: 0, ultima: '2026-11-06T18:00:00Z', cuenta: 'default' },
      { id: ORIGEN, titulo: 'T aaaa', estado: 'amarillo', fijada: false, posicion: null, ultima: '2026-11-06T18:00:00Z', cuenta: 'default' },
    ])
  })

  it('renombrar, fijar y desfijar resuelven el prefijo contra las del dueño', async () => {
    const store = new OrdenesConversacion(new Database(':memory:'))
    const filas = [fila(ORIGEN), fila(DESTINO)]
    const { web, pedidos } = webFalsa(filas)
    const r = store.pedir(scope, { accion: 'renombrar', id: 'd2348403', titulo: 'Clases' })
    const f = store.pedir(scope, { accion: 'fijar', id: DESTINO })
    await atenderOrdenes(store, deps(web).d, log)
    expect(store.get(r.id)).toMatchObject({ estado: 'hecha', resultado: { id: DESTINO, antes: 'T d234', titulo: 'Clases' } })
    expect(store.get(f.id)).toMatchObject({ estado: 'hecha', resultado: { id: DESTINO, fijada: true, yaEstaba: false } })
    expect(pedidos.filter(x => x.accion !== 'listar')).toEqual([
      { accion: 'renombrar', ownerId: 'dueno-1', id: DESTINO, titulo: 'Clases' },
      { accion: 'fijar', ownerId: 'dueno-1', id: DESTINO },
    ])
    const d = store.pedir(scope, { accion: 'desfijar', id: DESTINO })
    await atenderOrdenes(store, deps(web).d, log)
    expect(store.get(d.id)!.resultado).toMatchObject({ fijada: false })
  })

  it('una conversación de otro dueño no existe para esta orden, y un prefijo ambiguo pide el id completo', async () => {
    const store = new OrdenesConversacion(new Database(':memory:'))
    const { web } = webFalsa([fila(DESTINO), fila('d2348403-0000-4000-8000-000000000000')], 'otro-dueno')
    const a = store.pedir(scope, { accion: 'fijar', id: DESTINO })
    await atenderOrdenes(store, deps(web).d, log)
    expect(store.get(a.id)).toMatchObject({ estado: 'error', intentos: 1 })
    expect(store.get(a.id)!.motivo).toMatch(/No hay una conversación de este dueño/)
    const propia = webFalsa([fila(DESTINO), fila('d2348403-0000-4000-8000-000000000000')])
    const b = store.pedir(scope, { accion: 'fijar', id: 'd2348403' })
    await atenderOrdenes(store, deps(propia.web).d, log)
    expect(store.get(b.id)!.motivo).toMatch(/coincide con 2/)
  })

  it('enviar: acepta un turno sintético en la conversación destino, con su origen visible y sin hablar como el dueño', async () => {
    const store = new OrdenesConversacion(new Database(':memory:'))
    const { web } = webFalsa([fila(ORIGEN, { title: 'Ceo de conversaciones' }), fila(DESTINO, { account: 'bro' })])
    const { d, aceptados } = deps(web)
    const p = store.pedir(scope, { accion: 'enviar', id: 'd2348403', mensaje: 'Investiga la clase 3' })
    await atenderOrdenes(store, d, log)
    expect(store.get(p.id)).toMatchObject({ estado: 'hecha', resultado: { turnId: p.turnId, destino: DESTINO, cuenta: 'bro', desde: ORIGEN, desdeTitulo: 'Ceo de conversaciones' } })
    expect(aceptados).toHaveLength(1)
    const [{ id, input }] = aceptados
    expect(id).toEqual({ owner: 'dueno-1', account: 'bro', conversationId: DESTINO, turnId: p.turnId })
    expect(input).toMatchObject({ source: 'desktop', claudeSelection: { model: 'por-defecto' }, despertador: { tipo: 'conversacion', texto: 'Investiga la clase 3', desde: { id: ORIGEN, titulo: 'Ceo de conversaciones' } } })
    expect(String((input.despertador as { id: string }).id)).toMatch(/^c-/)
    expect(input.message).toBe(mensajeEntreConversaciones('Ceo de conversaciones', ORIGEN, 'Investiga la clase 3'))
    expect(input.message).toMatch(/no escribió este mensaje/)
    // Es sintético: cede el paso al dueño y nunca cuenta como su «sí» (chat-job trata `despertador` así).
    expect(esTurnoSintetico(input)).toBe(true)
    expect(etiquetaDespertador(input.despertador as { texto: string; tipo: string })).toBe('Levy, desde «Ceo de conversaciones»')
  })

  it('enviar hereda modelo y selección del último turno de la conversación destino; un reintento no manda dos veces', async () => {
    const store = new OrdenesConversacion(new Database(':memory:'))
    const { web } = webFalsa([fila(DESTINO)])
    const seleccion = vi.fn(async () => ({}))
    let existe = false
    const { d, aceptados } = deps(web, {
      previo: () => ({ source: 'mobile', overrides: { model: 'x' }, claudeSelection: { model: 'heredado' } }), seleccion,
      turnoExiste: () => existe, aceptar: (id, input) => { aceptados.push({ id, input }); existe = true },
    })
    store.pedir(scope, { accion: 'enviar', id: DESTINO, mensaje: 'm' })
    await atenderOrdenes(store, d, log)
    expect(aceptados[0].input).toMatchObject({ source: 'mobile', overrides: { model: 'x' }, claudeSelection: { model: 'heredado' } })
    expect(seleccion).not.toHaveBeenCalled()
    // Un servidor que se cayó tras aceptar: la orden vuelve a «pendiente» y el turno ya existe.
    const db2 = store as unknown as { db: Database.Database }
    db2.db.prepare(`UPDATE chat_conversaciones_ordenes SET estado = 'pendiente'`).run()
    await atenderOrdenes(store, d, log)
    expect(aceptados).toHaveLength(1)
  })

  it('enviar rechaza una archivada y la propia conversación aunque llegue por prefijo resuelto', async () => {
    const store = new OrdenesConversacion(new Database(':memory:'))
    const { web } = webFalsa([fila(DESTINO, { archived_at: '2026-11-01T00:00:00Z' })])
    const { d, aceptados } = deps(web)
    const a = store.pedir(scope, { accion: 'enviar', id: DESTINO, mensaje: 'm' })
    await atenderOrdenes(store, d, log)
    expect(store.get(a.id)).toMatchObject({ estado: 'error' })
    expect(store.get(a.id)!.motivo).toMatch(/archivada/)
    expect(aceptados).toEqual([])
  })

  it('un fallo de la web se reintenta; sin la ruta (web vieja) se cierra en el acto', async () => {
    const store = new OrdenesConversacion(new Database(':memory:'))
    const a = store.pedir(scope, { accion: 'listar' })
    await atenderOrdenes(store, deps(async () => { throw new Error('web caída') }).d, log)
    expect(store.get(a.id)).toMatchObject({ estado: 'pendiente', motivo: 'web caída' })
    const vieja = ordenesPorLaWeb('https://web', 'tok', (async () => new Response('', { status: 404 })) as unknown as typeof fetch)
    await atenderOrdenes(store, deps(vieja).d, log)
    expect(store.get(a.id)).toMatchObject({ estado: 'error' })
    expect(store.get(a.id)!.motivo).toMatch(/aún no tiene/)
  })
})

describe('ordenesPorLaWeb', () => {
  it('manda el pedido con el token y devuelve las filas', async () => {
    const llamadas: Array<{ url: string; init: RequestInit }> = []
    const f = (async (url: string, init: RequestInit) => { llamadas.push({ url, init }); return new Response(JSON.stringify({ conversaciones: [fila(DESTINO)] }), { status: 200 }) }) as unknown as typeof fetch
    const r = await ordenesPorLaWeb('https://web', 'tok', f)({ accion: 'listar', ownerId: 'dueno-1', limite: 40 })
    expect(r).toMatchObject({ ok: true, conversaciones: [{ id: DESTINO }] })
    expect(llamadas[0].url).toBe('https://web/api/cabina/conversaciones')
    expect((llamadas[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(await ordenesPorLaWeb('', '', f)({ accion: 'listar', ownerId: 'x' })).toMatchObject({ ok: false, definitivo: true })
  })
})

describe('herramienta conversacion con accion (MCP de la Cabina)', () => {
  const dirs: string[] = []
  const previo = { ...process.env }
  afterEach(() => { process.env = { ...previo }; for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); vi.resetModules() })

  async function cargar() {
    const store = mkdtempSync(join(tmpdir(), 'conv-ord-store-')), panel = mkdtempSync(join(tmpdir(), 'conv-ord-panel-'))
    dirs.push(store, panel)
    Object.assign(process.env, { CLAUDECLAW_STORE_DIR: store, ARBRAIN_PANEL_DIR: panel, ARBRAIN_CABINA_SCOPE: JSON.stringify(scope), ARBRAIN_CONVERSACION_ESPERA_MS: '3000' })
    vi.resetModules()
    const t = await import('./tools.js')
    const db = new Database(join(store, 'claudeclaw.db'))
    return { t, db, store: new OrdenesConversacion(db) }
  }

  it('el esquema acepta accion e id; crear sigue siendo el default', async () => {
    const { t, db } = await cargar()
    const tool = t.CABINA_TOOLS.find(x => x.name === 'conversacion')!
    expect((tool.inputSchema.properties as Record<string, { enum?: string[] }>).accion.enum).toEqual(['crear', 'listar', 'renombrar', 'fijar', 'desfijar', 'enviar'])
    expect(tool.inputSchema.required).toEqual([])
    db.close()
  })

  it('listar responde con id, título, estado en palabras y la marca de esta conversación', async () => {
    const { t, store, db } = await cargar()
    const { web } = webFalsa([fila(ORIGEN, { title: 'Esta' }), fila(DESTINO, { title: 'wtf. investiga y ayudame', is_favorite: true, last_read_at: null })])
    const pulso = setInterval(() => { void atenderOrdenes(store, deps(web, { activos: () => [{ conversationId: ORIGEN, status: 'running' }] }).d, log) }, 50)
    try {
      const r = await t.ejecutarCabina('conversacion', { accion: 'listar' })
      expect(r.error).toBeFalsy()
      expect(r.text).toContain(`${DESTINO} · «wtf. investiga y ayudame» · morado (lista, sin ver) · fijada`)
      expect(r.text).toMatch(new RegExp(`${ORIGEN} · «Esta» · amarillo \\(Levy trabajando\\).*\\(esta\\)`))
    } finally { clearInterval(pulso); db.close() }
  })

  it('enviar confirma el turno y la firma; a sí misma se rechaza sin tocar el store; sin pulso, NO confirmado', async () => {
    process.env.ARBRAIN_CONVERSACION_ESPERA_MS = '400'
    const { t, store, db } = await cargar()
    process.env.ARBRAIN_CONVERSACION_ESPERA_MS = '400'
    try {
      const propia = await t.ejecutarCabina('conversacion', { accion: 'enviar', id: ORIGEN, mensaje: 'hola' })
      expect(propia).toMatchObject({ error: true })
      expect(propia.text).toMatch(/misma conversación/)
      const lenta = await t.ejecutarCabina('conversacion', { accion: 'fijar', id: DESTINO })
      expect(lenta.text).toMatch(/^NO confirmado/)
      const { web } = webFalsa([fila(ORIGEN, { title: 'Ceo' }), fila(DESTINO, { title: 'Clases' })])
      const pulso = setInterval(() => { void atenderOrdenes(store, deps(web).d, log) }, 50)
      try {
        process.env.ARBRAIN_CONVERSACION_ESPERA_MS = '3000'
        const r = await t.ejecutarCabina('conversacion', { accion: 'enviar', id: DESTINO, mensaje: 'Investiga' })
        expect(r.error).toBeFalsy()
        expect(r.text).toMatch(/Mensaje entregado a «Clases».*firmado «Levy, desde «Ceo»»/)
      } finally { clearInterval(pulso) }
    } finally { db.close() }
  })
})

describe('ayuda {tema:"conversaciones"}', () => {
  it('tiene tema propio en las dos ediciones y crear apunta a él', async () => {
    const { ayudaOriginal, ayudaDeCliente } = await import('./ayuda.js')
    for (const texto of [ayudaOriginal('conversaciones'), ayudaDeCliente('la persona', 'conversaciones')]) {
      expect(texto).toMatch(/renombrar/)
      expect(texto).toMatch(/Levy, desde/)
      expect(texto).toMatch(/gris.*amarillo.*morado/)
    }
    expect(ayudaOriginal('conversacion')).toMatch(/tema:"conversaciones"/)
    expect(ayudaOriginal()).toMatch(/conversaciones/)
  })
})
