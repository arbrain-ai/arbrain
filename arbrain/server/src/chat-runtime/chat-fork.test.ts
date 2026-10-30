import { describe, it, expect, vi, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claveSesion, copiarAjustes, forkClaudeEnHijo, forkConversation, ForkRejected, type ForkDeps, type ForkRequest } from './chat-fork.js'
import { scopedControls } from './scoped-controls.js'

const ORIGEN = '44444444-4444-4444-8444-444444444444'
const COPIA = '22222222-2222-4222-8222-222222222222'
const SDK_ORIGEN = '0a0a0a0a-1b1b-4c2c-8d3d-4e4e4e4e4e4e'
const SDK_COPIA = '0b0b0b0b-2c2c-4d3d-8e4e-5f5f5f5f5f5f'
const req = (extra: Partial<ForkRequest> = {}): ForkRequest => ({ owner: 'owner-1', account: 'default', sourceId: ORIGEN, forkId: COPIA, title: 'Plan (bifurcada)', ...extra })

function deps(over: Partial<ForkDeps> = {}, sesiones: Record<string, string> = {}) {
  const mapa = new Map(Object.entries(sesiones))
  const d: ForkDeps & { mapa: Map<string, string> } = {
    mapa,
    getSession: k => mapa.get(k),
    setSession: vi.fn((k: string, v: string) => { mapa.set(k, v) }),
    latestStatus: () => null,
    forkClaude: vi.fn(async () => SDK_COPIA),
    forkCodex: vi.fn(async () => 'hilo-hijo'),
    copyControls: vi.fn(() => true),
    ...over,
  }
  return d
}

describe('bifurcar: reglas del daemon', () => {
  it('rechaza ids, cuenta o título inválidos antes de tocar nada', async () => {
    const d = deps()
    for (const malo of [{ sourceId: 'no-uuid' }, { forkId: 'sdk:abc' }, { account: 'otra' }, { owner: '' }, { forkId: ORIGEN }, { title: '  ' }]) {
      await expect(forkConversation(req(malo), d)).rejects.toMatchObject({ status: 400 })
    }
    expect(d.forkClaude).not.toHaveBeenCalled()
    expect(d.setSession).not.toHaveBeenCalled()
  })

  it('con un turno en curso de la original responde 409 y no crea sesión del motor', async () => {
    for (const estado of ['queued', 'dispatching', 'running', 'waiting', 'uncertain']) {
      const d = deps({ latestStatus: () => estado }, { [claveSesion({ owner: 'owner-1', account: 'default', conversationId: ORIGEN })]: SDK_ORIGEN })
      await expect(forkConversation(req(), d)).rejects.toMatchObject({ status: 409 })
      expect(d.forkClaude).not.toHaveBeenCalled()
      expect(d.setSession).not.toHaveBeenCalled()
    }
  })

  it('un turno terminado (completed, failed, interrupted) no estorba', async () => {
    for (const estado of ['completed', 'failed', 'interrupted']) {
      const d = deps({ latestStatus: () => estado }, { [`owner-1:${ORIGEN}::default`]: SDK_ORIGEN })
      expect((await forkConversation(req(), d)).engine).toBe('claude')
    }
  })

  it('Claude: bifurca la sesión nativa de la original, liga la copia a su id y deja la original como estaba', async () => {
    const d = deps({}, { [`owner-1:${ORIGEN}::default`]: SDK_ORIGEN })
    const r = await forkConversation(req(), d)
    expect(r).toEqual({ engine: 'claude', nativeId: SDK_COPIA, reused: false, controlsCopied: true })
    expect(d.forkClaude).toHaveBeenCalledWith(SDK_ORIGEN, 'default', 'Plan (bifurcada)')
    expect(d.forkCodex).not.toHaveBeenCalled()
    expect(d.mapa.get(`owner-1:${COPIA}::default`)).toBe(SDK_COPIA)
    expect(d.mapa.get(`owner-1:${ORIGEN}::default`)).toBe(SDK_ORIGEN)
    expect(d.setSession).toHaveBeenCalledTimes(1)
    expect(d.copyControls).toHaveBeenCalledWith({ owner: 'owner-1', account: 'default', conversationId: ORIGEN }, { owner: 'owner-1', account: 'default', conversationId: COPIA })
  })

  it('cuenta bro corre en Claude con su cuenta; codex y yt van por el hilo nativo de Codex', async () => {
    const bro = deps({}, { [`owner-1:${ORIGEN}::bro`]: SDK_ORIGEN })
    expect((await forkConversation(req({ account: 'bro' }), bro)).engine).toBe('claude')
    expect(bro.forkClaude).toHaveBeenCalledWith(SDK_ORIGEN, 'bro', 'Plan (bifurcada)')
    for (const account of ['codex', 'yt']) {
      const d = deps({}, { [`owner-1:${ORIGEN}::${account}`]: 'hilo-padre' })
      const r = await forkConversation(req({ account }), d)
      expect(r).toMatchObject({ engine: 'codex', nativeId: 'hilo-hijo' })
      expect(d.forkCodex).toHaveBeenCalledWith('hilo-padre', account)
      expect(d.forkClaude).not.toHaveBeenCalled()
    }
  })

  it('encuentra la sesión de conversaciones anteriores al dueño por llave legada (id pelado en default, id::cuenta en otras)', async () => {
    const viejaDefault = deps({}, { [ORIGEN]: SDK_ORIGEN })
    expect((await forkConversation(req(), viejaDefault)).engine).toBe('claude')
    expect(viejaDefault.forkClaude).toHaveBeenCalledWith(SDK_ORIGEN, 'default', expect.any(String))
    const viejaBro = deps({}, { [`${ORIGEN}::bro`]: SDK_ORIGEN })
    expect((await forkConversation(req({ account: 'bro' }), viejaBro)).engine).toBe('claude')
  })

  it('sin sesión nativa (la original nunca recibió un turno) no inventa una: engine none y no liga nada', async () => {
    const d = deps()
    expect(await forkConversation(req(), d)).toEqual({ engine: 'none', nativeId: null, reused: false, controlsCopied: false })
    expect(d.forkClaude).not.toHaveBeenCalled()
    expect(d.setSession).not.toHaveBeenCalled()
  })

  it('un reintento sobre una copia ya ligada no crea otra sesión del motor', async () => {
    const d = deps({}, { [`owner-1:${ORIGEN}::default`]: SDK_ORIGEN, [`owner-1:${COPIA}::default`]: SDK_COPIA })
    expect(await forkConversation(req(), d)).toMatchObject({ engine: 'claude', nativeId: SDK_COPIA, reused: true })
    expect(d.forkClaude).not.toHaveBeenCalled()
  })

  it('si el motor falla, 502 y la copia no queda ligada a nada', async () => {
    const d = deps({ forkClaude: vi.fn(async () => { throw new Error('Session not found') }) }, { [`owner-1:${ORIGEN}::default`]: SDK_ORIGEN })
    await expect(forkConversation(req(), d)).rejects.toMatchObject({ status: 502, message: expect.stringContaining('Session not found') })
    expect(d.setSession).not.toHaveBeenCalled()
  })

  it('si el motor devuelve la misma sesión de la original no la liga (compartirían historia)', async () => {
    const d = deps({ forkClaude: vi.fn(async () => SDK_ORIGEN) }, { [`owner-1:${ORIGEN}::default`]: SDK_ORIGEN })
    await expect(forkConversation(req(), d)).rejects.toBeInstanceOf(ForkRejected)
    expect(d.setSession).not.toHaveBeenCalled()
  })

  it('si copiar los ajustes falla, la copia igual queda creada con los de fábrica', async () => {
    const d = deps({ copyControls: () => { throw new Error('tabla bloqueada') } }, { [`owner-1:${ORIGEN}::default`]: SDK_ORIGEN })
    expect(await forkConversation(req(), d)).toMatchObject({ engine: 'claude', nativeId: SDK_COPIA, controlsCopied: false })
    expect(d.mapa.get(`owner-1:${COPIA}::default`)).toBe(SDK_COPIA)
  })
})

describe('copiarAjustes', () => {
  const origen = { owner: 'o', account: 'default', conversationId: ORIGEN }
  const copia = { owner: 'o', account: 'default', conversationId: COPIA }
  const fixture = () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE chat_overrides(session_key TEXT PRIMARY KEY,model TEXT,effort TEXT,fast INTEGER,ultracode INTEGER,updated_at INTEGER)')
    return db
  }

  it('copia modelo y esfuerzo de la original a la copia sin tocar la original', () => {
    const db = fixture()
    scopedControls(db).patch(origen, { key: ORIGEN, verifiedConversation: true }, { model: 'claude-opus-5-5', effort: 'high', fast: true })
    expect(copiarAjustes(db, origen, copia)).toBe(true)
    const leer = (id: string) => db.prepare('SELECT model,effort,fast,ultracode FROM chat_controls_v2 WHERE conversation_id=?').get(id)
    expect(leer(COPIA)).toEqual({ model: 'claude-opus-5-5', effort: 'high', fast: 1, ultracode: 0 })
    expect(leer(ORIGEN)).toEqual({ model: 'claude-opus-5-5', effort: 'high', fast: 1, ultracode: 0 })
  })

  it('sin ajustes propios en la original devuelve false y no crea fila; no adopta ajustes legados', () => {
    const db = fixture()
    db.prepare('INSERT INTO chat_overrides VALUES (?,?,?,?,?,?)').run(ORIGEN, 'viejo', 'low', 0, 0, 1)
    expect(copiarAjustes(db, origen, copia)).toBe(false)
    expect(db.prepare('SELECT count(*) AS n FROM chat_controls_v2').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT count(*) AS n FROM chat_controls_legacy_claims').get()).toEqual({ n: 0 })
  })
})

// Fork real del SDK de Claude en un proceso hijo, sobre un config dir temporal: sin red ni turnos del modelo.
describe('forkClaudeEnHijo (SDK real, config dir temporal)', () => {
  const temporales: string[] = []
  afterEach(() => { while (temporales.length) rmSync(temporales.pop()!, { recursive: true, force: true }) })

  function config(): { dir: string; carpeta: string; archivo: string } {
    const dir = mkdtempSync(join(tmpdir(), 'fork-claude-'))
    temporales.push(dir)
    const carpeta = join(dir, 'projects', '-w-app')
    mkdirSync(carpeta, { recursive: true })
    const lineas = [
      { type: 'user', uuid: '11111111-1111-4111-8111-aaaaaaaaaaaa', parentUuid: null, sessionId: SDK_ORIGEN, cwd: '/w/app', timestamp: '2026-10-01T10:00:00.000Z', message: { role: 'user', content: 'Mi color es AZUL.' } },
      { type: 'assistant', uuid: '22222222-2222-4222-8222-bbbbbbbbbbbb', parentUuid: '11111111-1111-4111-8111-aaaaaaaaaaaa', sessionId: SDK_ORIGEN, cwd: '/w/app', timestamp: '2026-10-01T10:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Anotado: azul.' }] } },
    ]
    const archivo = join(carpeta, `${SDK_ORIGEN}.jsonl`)
    writeFileSync(archivo, lineas.map(l => JSON.stringify(l)).join('\n') + '\n')
    return { dir, carpeta, archivo }
  }

  it('crea una sesión nueva con toda la historia y el título, deja la original byte a byte igual y no toca el entorno del daemon', async () => {
    const { dir, carpeta, archivo } = config()
    const antes = readFileSync(archivo, 'utf8')
    const envAntes = process.env.CLAUDE_CONFIG_DIR
    const id = await forkClaudeEnHijo(SDK_ORIGEN, 'Mi charla (bifurcada)', dir)
    expect(id).not.toBe(SDK_ORIGEN)
    expect(readFileSync(archivo, 'utf8')).toBe(antes)
    expect(readdirSync(carpeta).sort()).toEqual([`${SDK_ORIGEN}.jsonl`, `${id}.jsonl`].sort())
    const copia = readFileSync(join(carpeta, `${id}.jsonl`), 'utf8')
    expect(copia).toContain('Mi color es AZUL.')
    expect(copia).toContain('Anotado: azul.')
    expect(copia).toContain('Mi charla (bifurcada)')
    expect(copia).toContain(`"sessionId":"${id}"`)
    expect(process.env.CLAUDE_CONFIG_DIR).toBe(envAntes)
  }, 30_000)

  it('si la sesión no existe en ESE config dir falla con un error legible y no escribe nada', async () => {
    const { dir, carpeta } = config()
    const otra = mkdtempSync(join(tmpdir(), 'fork-claude-vacio-'))
    temporales.push(otra)
    await expect(forkClaudeEnHijo(SDK_ORIGEN, 'x (bifurcada)', otra)).rejects.toThrow(/not found/i)
    expect(existsSync(join(otra, 'projects'))).toBe(false)
    expect(readdirSync(carpeta)).toHaveLength(1)
    void dir
  }, 30_000)
})
