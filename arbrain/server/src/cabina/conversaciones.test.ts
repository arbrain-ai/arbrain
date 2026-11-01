import { afterEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConversacionesNuevas, ConversacionInvalida, TOPES_CONVERSACION, atenderConversaciones, enviarPorLaWeb, parseConversacion, type EnvioConversacion } from './conversaciones.js'

const scope = { owner: 'dueno-1', account: 'default', conversationId: 'conv-origen' }
const log = { info: () => {}, warn: () => {} }

describe('parseConversacion', () => {
  it('pide titulo y mensaje; abrir es opcional y booleano', () => {
    expect(parseConversacion({ titulo: '  Estilo   Fulano ', mensaje: ' haz X ' })).toEqual({ titulo: 'Estilo Fulano', mensaje: 'haz X', abrir: false })
    expect(parseConversacion({ titulo: 'a', mensaje: 'b', abrir: true }).abrir).toBe(true)
    expect(() => parseConversacion({ mensaje: 'b' })).toThrow(/titulo/)
    expect(() => parseConversacion({ titulo: 'a' })).toThrow(/mensaje/)
    expect(() => parseConversacion({ titulo: 'x'.repeat(81), mensaje: 'b' })).toThrow(/80/)
    expect(() => parseConversacion({ titulo: 'a', mensaje: '/compact' })).toThrow(/comando/)
    expect(() => parseConversacion({ titulo: 'a', mensaje: 'b', abrir: 'sí' })).toThrow(/abrir/)
  })
})

describe('ConversacionesNuevas', () => {
  it('el pedido nace con id de conversación y de turno propios, y se toma una sola vez', () => {
    const store = new ConversacionesNuevas(new Database(':memory:'))
    const p = store.pedir(scope, { titulo: 'T', mensaje: 'M' })
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(p.turnId).toMatch(/^[0-9a-f-]{36}$/)
    expect(p.turnId).not.toBe(p.id)
    expect(p.estado).toBe('pendiente')
    const [tomado] = store.tomar()
    expect(tomado).toMatchObject({ id: p.id, estado: 'creando', intentos: 1 })
    expect(store.tomar()).toEqual([])
  })

  it('sin conversación de origen no hay pedido', () => {
    const store = new ConversacionesNuevas(new Database(':memory:'))
    expect(() => store.pedir({ ...scope, conversationId: '' }, { titulo: 'T', mensaje: 'M' })).toThrow(ConversacionInvalida)
  })

  it('tope por hora desde la misma conversación (contra bucles)', () => {
    let ahora = 1_000_000
    const store = new ConversacionesNuevas(new Database(':memory:'), () => ahora)
    for (let i = 0; i < TOPES_CONVERSACION.porHoraPorConversacion; i++) store.pedir(scope, { titulo: `T${i}`, mensaje: 'M' })
    expect(() => store.pedir(scope, { titulo: 'otra', mensaje: 'M' })).toThrow(/tope/)
    // Otra conversación del mismo dueño sí puede.
    expect(store.pedir({ ...scope, conversationId: 'otra' }, { titulo: 'T', mensaje: 'M' }).estado).toBe('pendiente')
    ahora += 3_600_001
    expect(store.pedir(scope, { titulo: 'T', mensaje: 'M' }).estado).toBe('pendiente')
  })

  it('un «creando» que dejó un servidor anterior se retoma pasado un minuto', () => {
    let ahora = 1_000_000
    const store = new ConversacionesNuevas(new Database(':memory:'), () => ahora)
    store.pedir(scope, { titulo: 'T', mensaje: 'M' })
    expect(store.tomar()).toHaveLength(1)
    expect(store.tomar()).toHaveLength(0)
    ahora += 61_000
    expect(store.tomar()[0].intentos).toBe(2)
  })
})

describe('atenderConversaciones', () => {
  it('manda a la web lo que pidió Levy, con el mismo id y turno, y la marca hecha', async () => {
    const store = new ConversacionesNuevas(new Database(':memory:'))
    const p = store.pedir({ ...scope, account: 'bro' }, { titulo: 'Estilo Fulano', mensaje: 'Toma el relevo' })
    const enviados: EnvioConversacion[] = []
    expect(await atenderConversaciones(store, async e => { enviados.push(e); return { ok: true } }, log)).toBe(1)
    expect(enviados).toEqual([{ id: p.id, ownerId: 'dueno-1', account: 'bro', title: 'Estilo Fulano', message: 'Toma el relevo', turnId: p.turnId }])
    expect(store.get(p.id)!.estado).toBe('hecha')
  })

  it('reintenta lo que falla hasta agotar los intentos, y un rechazo definitivo lo cierra en el acto', async () => {
    const store = new ConversacionesNuevas(new Database(':memory:'))
    const a = store.pedir(scope, { titulo: 'A', mensaje: 'M' })
    for (let i = 1; i < TOPES_CONVERSACION.intentos; i++) {
      await atenderConversaciones(store, async () => { throw new Error('web caída') }, log)
      expect(store.get(a.id)).toMatchObject({ estado: 'pendiente', motivo: 'web caída' })
    }
    await atenderConversaciones(store, async () => ({ ok: false, motivo: 'otra vez' }), log)
    expect(store.get(a.id)).toMatchObject({ estado: 'error', motivo: 'otra vez' })
    const b = store.pedir(scope, { titulo: 'B', mensaje: 'M' })
    await atenderConversaciones(store, async () => ({ ok: false, motivo: 'Cuenta de chat desconocida.', definitivo: true }), log)
    expect(store.get(b.id)).toMatchObject({ estado: 'error', intentos: 1 })
  })
})

describe('enviarPorLaWeb', () => {
  const envio: EnvioConversacion = { id: 'i', ownerId: 'o', account: 'default', title: 't', message: 'm', turnId: 'u' }
  it('POST a /api/cabina/conversacion con el Bearer servidor-a-servidor', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ session: {} }), { status: 200 }))
    expect(await enviarPorLaWeb('http://web', 'tok', f as unknown as typeof fetch)(envio)).toEqual({ ok: true })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://web/api/cabina/conversacion')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(String(init.body))).toEqual(envio)
  })
  it('400/401/403 son definitivos; 5xx se reintenta; sin token ni dirección no se intenta', async () => {
    const con = (status: number) => enviarPorLaWeb('http://web', 'tok', (async () => new Response(JSON.stringify({ error: 'x' }), { status })) as unknown as typeof fetch)(envio)
    expect(await con(400)).toMatchObject({ ok: false, definitivo: true })
    expect(await con(401)).toMatchObject({ ok: false, definitivo: true })
    expect(await con(502)).toMatchObject({ ok: false, definitivo: false })
    expect(await enviarPorLaWeb('', 'tok')(envio)).toMatchObject({ ok: false, definitivo: true })
  })
})

describe('herramienta conversacion (MCP de la Cabina)', () => {
  const dirs: string[] = []
  const previo = { ...process.env }
  afterEach(() => { process.env = { ...previo }; for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); vi.resetModules() })

  async function cargar() {
    const store = mkdtempSync(join(tmpdir(), 'conv-store-')), panel = mkdtempSync(join(tmpdir(), 'conv-panel-'))
    dirs.push(store, panel)
    Object.assign(process.env, { CLAUDECLAW_STORE_DIR: store, ARBRAIN_PANEL_DIR: panel, ARBRAIN_CABINA_SCOPE: JSON.stringify(scope), ARBRAIN_CONVERSACION_ESPERA_MS: '3000', ARBRAIN_PANEL_ESPERA_MS: '300' })
    vi.resetModules()
    const t = await import('./tools.js')
    const db = new Database(join(store, 'claudeclaw.db'))
    return { t, db, store: new ConversacionesNuevas(db), panel }
  }

  it('está en la lista (las dos ediciones) pero no en las dynamicTools de Codex, que no reciben la conversación', async () => {
    const { t } = await cargar()
    expect(t.CABINA_TOOLS.some(x => x.name === 'conversacion')).toBe(true)
    expect(t.cabinaToolsCliente('la persona').some(x => x.name === 'conversacion')).toBe(true)
    expect(t.cabinaDynamicTools().some(x => x.name === 'cabina_conversacion')).toBe(false)
  })

  it('crea el pedido, espera al pulso y devuelve el id; sin app conectada lo dice', async () => {
    const { t, store, db } = await cargar()
    const enviados: EnvioConversacion[] = []
    const pulso = setInterval(() => { void atenderConversaciones(store, async e => { enviados.push(e); return { ok: true } }, log) }, 50)
    try {
      const r = await t.ejecutarCabina('conversacion', { titulo: 'Estilo Fulano × Arbrain', mensaje: 'Toma el relevo del subagente' })
      expect(r.error).toBeFalsy()
      expect(enviados).toHaveLength(1)
      expect(r.text).toContain(`id ${enviados[0].id}`)
      expect(r.text).toContain(`turno ${enviados[0].turnId}`)
      expect(r.text).toMatch(/Ninguna app la confirmó/)
      expect(enviados[0]).toMatchObject({ ownerId: 'dueno-1', account: 'default', title: 'Estilo Fulano × Arbrain' })
    } finally { clearInterval(pulso); db.close() }
  })

  it('si el servidor no la crea a tiempo responde NO confirmado; si la web la rechaza, el motivo', async () => {
    process.env.ARBRAIN_CONVERSACION_ESPERA_MS = '400'
    const { t, store, db } = await cargar()
    process.env.ARBRAIN_CONVERSACION_ESPERA_MS = '400'
    try {
      const lenta = await t.ejecutarCabina('conversacion', { titulo: 'A', mensaje: 'M' })
      expect(lenta).toMatchObject({ error: true })
      expect(lenta.text).toMatch(/^NO confirmado/)
      const pulso = setInterval(() => { void atenderConversaciones(store, async () => ({ ok: false, motivo: 'Cuenta de chat desconocida.', definitivo: true }), log) }, 50)
      try {
        const r = await t.ejecutarCabina('conversacion', { titulo: 'B', mensaje: 'M' })
        expect(r).toMatchObject({ error: true })
        expect(r.text).toMatch(/NO se creó.*Cuenta de chat desconocida/)
      } finally { clearInterval(pulso) }
    } finally { db.close() }
  })

  it('sin conversación de origen no hace nada', async () => {
    const { t, db } = await cargar()
    delete process.env.ARBRAIN_CABINA_SCOPE
    const r = await t.ejecutarCabina('conversacion', { titulo: 'A', mensaje: 'M' })
    expect(r).toMatchObject({ error: true })
    expect(r.text).toMatch(/solo se abren desde una conversación/)
    db.close()
  })
})

describe('bus del panel: comando conversacion', () => {
  let dir = ''
  afterEach(() => { delete process.env.ARBRAIN_PANEL_DIR; if (dir) rmSync(dir, { recursive: true, force: true }) })

  it('solo lo recibe la web que lo declara en `sabe`; a una anterior no se le manda (lo pintaría como pestaña)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'conv-bus-'))
    process.env.ARBRAIN_PANEL_DIR = dir
    const { emitirConversacion, sincronizar } = await import('./panel-bus.js')
    const cliente = (sabe?: string[]) => ({ clientId: 'w-1', dispositivo: 'disp-1', conversacion: 'conv-origen', escribio: { 'conv-origen': new Date().toISOString() }, pestanas: [], ...(sabe ? { sabe } : {}) })
    sincronizar(cliente())
    const viejo = emitirConversacion({ id: 'c-1', titulo: 'T', abrir: false }, 'conv-origen')
    expect(viejo).toMatchObject({ versionVieja: true, objetivos: [] })
    expect(sincronizar(cliente()).comandos).toEqual([])
    expect(sincronizar(cliente(['conversacion'])).comandos).toEqual([])
    const nuevo = emitirConversacion({ id: 'c-2', titulo: 'T', abrir: true }, 'conv-origen')
    expect(nuevo.versionVieja).toBe(false)
    expect(nuevo.objetivos.map(c => c.id)).toEqual(['w-1'])
    const r = sincronizar(cliente(['conversacion']))
    expect(r.comandos.map(c => ({ accion: c.accion, sesion: c.sesion }))).toEqual([{ accion: 'conversacion', sesion: { id: 'c-2', titulo: 'T', abrir: true } }])
    expect(sincronizar(cliente()).comandos).toEqual([])
  })
})
