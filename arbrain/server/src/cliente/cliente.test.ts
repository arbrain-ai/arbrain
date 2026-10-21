/**
 * Edición cliente empaquetada (11 oct 2026; docs/builds/empaquetado-2026-10-11/CONTRATO-DAEMON.md).
 * Arranque por variables, marca de edición sin ~/.config compartida, BYOK, rutas solo-Daniel, confirmación humana (I8)
 * y monitoreo de cohorte opt-in. Nada toca la red real ni las carpetas de Daniel: todo en temporales.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, statSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { esEdicionCliente } from '../edicion.js'
import { prepararEntornoCliente, sembrarAgregados, sembrarCerebro, MARCA_SEMBRADO } from './arranque.js'
import { haySecretoConfirmar, secretoConfirmarValido, fijarSecretoConfirmarParaPruebas } from './secreto.js'
import { secreto } from './cofre.js'
import { estadoLlaves, faltaLlaveClaude } from './llaves.js'
import { rutaSoloDaniel } from './rutas.js'
import { Confirmaciones, accionIrreversible, huellaDe } from './confirmaciones.js'
import { Cohorte, diaLocal } from './cohorte.js'
import { guardiaHooks } from '../guardia-agentes.js'

const CLAVES = ['ARBRAIN_EDICION', 'ARBRAIN_CONFIG_DIR', 'ARBRAIN_DATA_DIR', 'HOME', 'ARBRAIN_COHORTE_URL', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_AUTH_TOKEN']
let previo: Record<string, string | undefined> = {}
beforeEach(() => { previo = Object.fromEntries(CLAVES.map(k => [k, process.env[k]])) })
afterEach(() => { for (const k of CLAVES) { if (previo[k] === undefined) delete process.env[k]; else process.env[k] = previo[k] } })
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))

describe('marca de edición', () => {
  it('ya no se lee de ~/.config/arbrain compartida: la app del alumno en la Mac de Daniel no lo convierte', () => {
    const home = tmp('home-')
    mkdirSync(join(home, '.config', 'arbrain'), { recursive: true })
    writeFileSync(join(home, '.config', 'arbrain', 'edicion'), 'cliente\n')
    process.env.HOME = home
    delete process.env.ARBRAIN_EDICION; delete process.env.ARBRAIN_CONFIG_DIR; delete process.env.ARBRAIN_DATA_DIR
    expect(esEdicionCliente()).toBe(false)
  })
  it('se lee de la variable o de la carpeta de datos que pasa la app', () => {
    expect(esEdicionCliente({ ARBRAIN_EDICION: 'cliente' })).toBe(true)
    const data = tmp('data-')
    mkdirSync(join(data, 'config'))
    writeFileSync(join(data, 'config', 'edicion'), 'cliente')
    expect(esEdicionCliente({ ARBRAIN_DATA_DIR: data })).toBe(true)
    expect(esEdicionCliente({ ARBRAIN_DATA_DIR: data, ARBRAIN_EDICION: 'daniel' })).toBe(false)
  })
})

describe('arranque (contrato §2)', () => {
  it('dice qué falta sin crear nada', () => {
    const env: NodeJS.ProcessEnv = {}
    expect(prepararEntornoCliente(env)).toEqual({ ok: false, falta: ['ARBRAIN_DATA_DIR', 'MC_SERVER_PORT', 'MISSION_CONTROL_ORIGIN', 'OPENCLAW_GATEWAY_TOKEN'] })
    // Red team L1: un origen que no es la web local tampoco vale (nunca un respaldo a 3218 ni un dominio).
    expect(prepararEntornoCliente({ MISSION_CONTROL_ORIGIN: 'https://ejemplo.test' }).falta).toContain('MISSION_CONTROL_ORIGIN')
  })
  it('crea carpetas privadas, traduce alias, aísla el CLI de Claude y saca el secreto del entorno', () => {
    const data = join(tmp('arranque-'), 'datos'), ws = join(tmp('ws-'), 'cerebro')
    const env: NodeJS.ProcessEnv = { ARBRAIN_DATA_DIR: data, ARBRAIN_HOME: ws, MC_SERVER_PORT: '4567', ARBRAIN_DAEMON_TOKEN: 'a'.repeat(32), ARBRAIN_WEB_URL: 'http://127.0.0.1:4568', ARBRAIN_TOKEN_CONFIRMAR: 'secreto-app' }
    const r = prepararEntornoCliente(env)
    expect(r.ok).toBe(true)
    // Contrato v2: el token queda en el cofre del daemon, nunca en su entorno (lo heredaría cualquier hijo).
    expect(env.OPENCLAW_GATEWAY_TOKEN).toBeUndefined()
    expect(secreto('OPENCLAW_GATEWAY_TOKEN')).toBe('a'.repeat(32))
    expect(env.ARBRAIN_DAEMON_TOKEN).toBeUndefined()
    expect(env.MISSION_CONTROL_ORIGIN).toBe('http://127.0.0.1:4568')
    expect(env.CLAUDECLAW_STORE_DIR).toBe(join(data, 'store'))
    expect(env.ARBRAIN_CONFIG_DIR).toBe(join(data, 'config'))
    expect(env.CLAUDE_CONFIG_DIR).toBe(join(data, 'claude'))
    expect(env.ARBRAIN_BARRENDERO).toBe('0')
    expect(env.ARBRAIN_TOKEN_CONFIRMAR).toBeUndefined()
    expect(haySecretoConfirmar()).toBe(true)
    expect(secretoConfirmarValido('secreto-app')).toBe(true)
    expect(secretoConfirmarValido('otro-secreto')).toBe(false)
    expect(existsSync(ws)).toBe(true)
    if (process.platform !== 'win32') for (const d of ['', 'store', 'config', 'claude', 'cohorte']) expect(statSync(join(data, d)).mode & 0o777).toBe(0o700)
  })
})

describe('siembra del cerebro desde la plantilla (pedido de B)', () => {
  it('copia la plantilla una sola vez, sin pisar lo que ya existe ni resucitar lo borrado', () => {
    const plantilla = tmp('plantilla-'), home = join(tmp('home-'), 'cerebro')
    mkdirSync(join(plantilla, '.claude', 'memory'), { recursive: true })
    writeFileSync(join(plantilla, 'CLAUDE.md'), '# plantilla')
    writeFileSync(join(plantilla, '.claude', 'memory', 'MEMORY.md'), '# memoria vacía')
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, 'CLAUDE.md'), '# mío')
    expect(sembrarCerebro(home, plantilla)).toBe(true)
    expect(readFileSync(join(home, 'CLAUDE.md'), 'utf8')).toBe('# mío')
    expect(readFileSync(join(home, '.claude', 'memory', 'MEMORY.md'), 'utf8')).toBe('# memoria vacía')
    expect(existsSync(join(home, MARCA_SEMBRADO))).toBe(true)
    expect(sembrarCerebro(home, plantilla)).toBe(false)
    expect(sembrarCerebro(join(tmp('h2-'), 'x'), undefined)).toBe(false)
  })

  it('una plantilla posterior agrega los manuales a un cerebro ya sembrado, una sola vez y sin resucitar lo borrado', () => {
    const vieja = tmp('plantilla-v1-'), nueva = tmp('plantilla-v2-'), home = join(tmp('home-'), 'cerebro')
    writeFileSync(join(vieja, 'CLAUDE.md'), '# v1')
    mkdirSync(join(nueva, 'arbrain', 'cerebro', 'manuales'), { recursive: true })
    writeFileSync(join(nueva, 'CLAUDE.md'), '# v2')
    writeFileSync(join(nueva, 'arbrain', 'cerebro', 'manuales', 'README.md'), '# manuales')
    mkdirSync(home, { recursive: true })
    expect(sembrarCerebro(home, vieja)).toBe(true)
    expect(sembrarAgregados(home, nueva)).toEqual(['arbrain/cerebro/manuales'])
    expect(readFileSync(join(home, 'arbrain', 'cerebro', 'manuales', 'README.md'), 'utf8')).toBe('# manuales')
    expect(readFileSync(join(home, 'CLAUDE.md'), 'utf8')).toBe('# v1')   // lo demás de la plantilla nueva no entra
    rmSync(join(home, 'arbrain', 'cerebro', 'manuales'), { recursive: true })
    expect(sembrarAgregados(home, nueva)).toEqual([])
    expect(existsSync(join(home, 'arbrain', 'cerebro', 'manuales'))).toBe(false)
    expect(JSON.parse(readFileSync(join(home, MARCA_SEMBRADO), 'utf8')).agregados).toEqual(['arbrain/cerebro/manuales'])
  })

  it('un cerebro sembrado ya con los manuales no los recibe dos veces; sin marca no se agrega nada', () => {
    const plantilla = tmp('plantilla-'), home = join(tmp('home-'), 'cerebro')
    mkdirSync(join(plantilla, 'arbrain', 'cerebro', 'manuales'), { recursive: true })
    writeFileSync(join(plantilla, 'arbrain', 'cerebro', 'manuales', 'README.md'), '# manuales')
    mkdirSync(home, { recursive: true })
    expect(sembrarAgregados(home, plantilla)).toEqual([])
    expect(sembrarCerebro(home, plantilla)).toBe(true)
    writeFileSync(join(home, 'arbrain', 'cerebro', 'manuales', 'README.md'), '# editado por el dueño')
    expect(sembrarAgregados(home, plantilla)).toEqual([])
    expect(readFileSync(join(home, 'arbrain', 'cerebro', 'manuales', 'README.md'), 'utf8')).toBe('# editado por el dueño')
  })
})

describe('BYOK (contrato §4)', () => {
  it('cualquiera de las llaves sirve para el chat; sin ninguna, la edición cliente frena y Daniel no', () => {
    expect(estadoLlaves({ ANTHROPIC_API_KEY: 'x' }).chat).toBe(true)
    // Sin vía de suscripción (12 oct 2026): un token de claude.ai suelto no es llave.
    expect(estadoLlaves({ CLAUDE_CODE_OAUTH_TOKEN: 'x' })).toMatchObject({ chat: false, proveedor: null })
    expect(estadoLlaves({ ANTHROPIC_AUTH_TOKEN: 'x' })).toMatchObject({ chat: false, proveedor: null })
    expect(estadoLlaves({ ANTHROPIC_API_KEY: 'x' })).not.toHaveProperty('oauth')
    expect(estadoLlaves({ OPENROUTER_API_KEY: 'x' })).toMatchObject({ openrouter: true, chat: true, proveedor: 'openrouter' })
    expect(faltaLlaveClaude({ ARBRAIN_EDICION: 'cliente' })).toBe(true)
    expect(faltaLlaveClaude({ ARBRAIN_EDICION: 'cliente', ANTHROPIC_API_KEY: 'sk-x' })).toBe(false)
    expect(faltaLlaveClaude({ ARBRAIN_EDICION: 'daniel' })).toBe(false)
  })
})

describe('rutas solo de Daniel (contrato §8)', () => {
  it('apaga las que llaman python3, lsof o la voz de macOS, y deja el panel', () => {
    expect(rutaSoloDaniel('GET', '/analytics/sales', {})).toBe(true)
    expect(rutaSoloDaniel('POST', '/planning', {})).toBe(true)
    expect(rutaSoloDaniel('POST', '/cabina', { que: 'salud' })).toBe(true)
    expect(rutaSoloDaniel('POST', '/cabina', { que: 'trabajos' })).toBe(true)
    expect(rutaSoloDaniel('POST', '/cabina', { que: 'panel' })).toBe(false)
    expect(rutaSoloDaniel('POST', '/cabina', { que: 'memoria' })).toBe(false)
    expect(rutaSoloDaniel('POST', '/chat/stream', {})).toBe(false)
  })
})

describe('confirmación humana (I8, contrato §6)', () => {
  it('qué es irreversible: publicar, borrar, enviar, pagar; el trabajo normal pasa', () => {
    expect(accionIrreversible('Bash', { command: 'git push origin main' })?.categoria).toBe('publicar')
    expect(accionIrreversible('Bash', { command: 'npm publish' })?.categoria).toBe('publicar')
    expect(accionIrreversible('Bash', { command: 'rm notas.md' })?.categoria).toBe('borrar')
    expect(accionIrreversible('Bash', { command: 'curl -X POST https://api.x.com/v1/mail -d @c.json' })?.categoria).toBe('enviar')
    expect(accionIrreversible('mcp__gmail__send_email', { to: 'a@b.c' })?.categoria).toBe('enviar')
    expect(accionIrreversible('mcp__stripe__create_payment', {})?.categoria).toBe('pagar')
    expect(accionIrreversible('mcp__drive__delete_file', {})?.categoria).toBe('borrar')
    for (const cmd of ['npm test', 'git status', 'git commit -m x', 'ls -la', 'curl -s https://api.example.com/x', 'npm run format']) expect(accionIrreversible('Bash', { command: cmd }), cmd).toBeNull()
    expect(accionIrreversible('mcp__gmail__create_draft', {})).toBeNull()
    expect(accionIrreversible('mcp__gmail__get_message', {})).toBeNull()
    expect(accionIrreversible('Read', { file_path: '/x' })).toBeNull()
  })
  it('una aprobación vale para esa acción exacta y una sola vez; la misma acción no duplica pendientes', () => {
    let ahora = 1_000_000
    const s = new Confirmaciones(new Database(':memory:'), () => ahora)
    const a = s.pedir({ origen: 'agente', categoria: 'publicar', resumen: 'git push', huella: 'h' })
    expect(s.pedir({ origen: 'agente', categoria: 'publicar', resumen: 'git push', huella: 'h' }).id).toBe(a.id)
    expect(s.pendientes()).toHaveLength(1)
    expect(s.consumir('h')).toBe(false)
    expect(s.resolver(a.id, 'quizá')).toMatchObject({ ok: false, status: 400 })
    expect(s.resolver(a.id, 'permitir')).toMatchObject({ ok: true })
    expect(s.resolver(a.id, 'permitir')).toMatchObject({ ok: false, status: 409 })
    expect(s.consumir('otra')).toBe(false)
    expect(s.consumir('h')).toBe(true)
    expect(s.consumir('h')).toBe(false)
    const b = s.pedir({ origen: 'manos', categoria: 'enviar', resumen: 'enviar', huella: 'h2' })
    ahora += 11 * 60_000
    expect(s.get(b.id)?.estado).toBe('vencida')
    expect(s.pendientes()).toHaveLength(0)
  })
  it('la guardia espera el clic: permitir deja pasar, rechazar y silencio niegan; sin secreto de la app, niega', async () => {
    const s = new Confirmaciones(new Database(':memory:'))
    const correr = async (op: Parameters<typeof guardiaHooks>[1], cmd = 'git push origin main') => {
      const [m] = guardiaHooks(() => {}, op).PreToolUse
      return m.hooks[0]({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: cmd } } as any, undefined, { signal: new AbortController().signal }) as Promise<any>
    }
    const base = { confirmaciones: () => s, hayQuienConfirme: () => true, esperaMs: 1500 }
    // Persona que aprueba al vuelo.
    const vigia = setInterval(() => { for (const c of s.pendientes()) s.resolver(c.id, c.resumen.includes('rechaza') ? 'rechazar' : 'permitir') }, 50)
    try {
      // Aprobada: corre una vez, fuera del sandbox (es lo que la persona vio con el comando literal).
      expect((await correr(base)).hookSpecificOutput).toMatchObject({ permissionDecision: 'allow', updatedInput: { command: 'git push origin main', dangerouslyDisableSandbox: true } })
      expect(s.pendientes()).toHaveLength(0)
      expect((await correr(base, 'git push origin rechaza')).hookSpecificOutput.permissionDecisionReason).toMatch(/RECHAZÓ/)
    } finally { clearInterval(vigia) }
    expect((await correr({ ...base, esperaMs: 300 }, 'git push origin nadie')).hookSpecificOutput.permissionDecisionReason).toMatch(/espera la confirmación/)
    expect((await correr({ ...base, hayQuienConfirme: () => false })).hookSpecificOutput.permissionDecision).toBe('deny')
    expect(await correr({ ...base, contexto: () => ({ home: '/tmp', cwd: '/tmp', usuario: '/Users/alumno', protegidas: [], lecturaExtra: [], sandbox: true }) }, 'ls -la')).toEqual({ continue: true })
    expect(huellaDe('Bash', { command: 'a' })).not.toBe(huellaDe('Bash', { command: 'b' }))
  })
  it('el secreto se compara completo', () => {
    fijarSecretoConfirmarParaPruebas('abc123')
    expect(secretoConfirmarValido('abc123')).toBe(true)
    expect(secretoConfirmarValido('abc12')).toBe(false)
    expect(secretoConfirmarValido(undefined)).toBe(false)
  })
})

describe('monitoreo de cohorte (contrato §7)', () => {
  const conJournal = () => {
    const db = new Database(':memory:')
    db.exec(`CREATE TABLE chat_runtime_turns (turn_id TEXT PRIMARY KEY, owner TEXT, account TEXT, conversation_id TEXT, created_at INTEGER)`)
    return db
  }
  it('sin consentimiento o sin URL no sale nada; con ambas, solo cifras por día', async () => {
    process.env.ARBRAIN_EDICION = 'cliente'
    delete process.env.ARBRAIN_COHORTE_URL
    const db = conJournal()
    const ahora = new Date(2026, 9, 11, 12).getTime(), ayer = ahora - 86_400_000
    const ins = db.prepare('INSERT INTO chat_runtime_turns VALUES (?, ?, ?, ?, ?)')
    ins.run('t1', 'o', 'default', 'conv-a', ayer); ins.run('t2', 'o', 'default', 'conv-a', ayer + 1000); ins.run('t3', 'o', 'default', 'conv-b', ayer + 2000); ins.run('t4', 'o', 'default', 'conv-a', ahora)
    let reloj = ayer
    const dir = tmp('cohorte-')
    const c = new Cohorte(db, dir, () => reloj)
    expect(c.registrarVenta('accion')).toEqual({ ok: true })
    expect(c.registrarVenta('cierre', 12000, 'mxn')).toEqual({ ok: true })
    expect(c.registrarVenta('cliente: Juan Pérez')).toMatchObject({ ok: false })
    reloj = ahora
    const llamadas: Array<{ url: string; cuerpo: string }> = []
    const fetcher = (async (url: string, init: RequestInit) => { llamadas.push({ url, cuerpo: String(init.body) }); return new Response('{}', { status: 200 }) }) as unknown as typeof fetch
    expect(await c.enviar(fetcher)).toBe('sin_consentimiento')
    c.fijarConsentimiento(true)
    if (process.platform !== 'win32') expect(statSync(join(dir, 'consentimiento.json')).mode & 0o777).toBe(0o600)
    expect(await c.enviar(fetcher)).toBe('sin_url')
    expect(llamadas).toHaveLength(0)
    process.env.ARBRAIN_COHORTE_URL = 'https://receptor.prueba/cohorte'
    const previa = c.vistaPrevia()
    expect(previa.dias.find(d => d.dia === diaLocal(ayer))).toEqual({ dia: diaLocal(ayer), sesiones: 2, acciones_venta: 1, cierres: 1, facturacion: { MXN: 12000 } })
    expect(await c.enviar(fetcher)).toBe('enviado')
    expect(llamadas).toHaveLength(1)
    const enviado = JSON.parse(llamadas[0].cuerpo)
    expect(enviado.dias.map((d: { dia: string }) => d.dia)).toEqual([diaLocal(ayer)]) // hoy sigue abierto
    expect(llamadas[0].cuerpo).not.toMatch(/conv-a|conv-b|Juan/)
    expect(Object.keys(enviado).sort()).toEqual(['dias', 'generado', 'instalacion', 'version'])
    expect(await c.enviar(fetcher)).toBe('nada') // ya se envió hasta ayer
    c.fijarConsentimiento(false)
    expect(existsSync(join(dir, 'consentimiento.json'))).toBe(false)
    expect(await c.enviar(fetcher)).toBe('sin_consentimiento')
    expect(JSON.parse(readFileSync(join(dir, 'estado.json'), 'utf8')).enviadoHasta).toBe(diaLocal(ayer))
  })
  it('en la instalación de Daniel nunca envía', async () => {
    process.env.ARBRAIN_EDICION = 'daniel'
    process.env.ARBRAIN_COHORTE_URL = 'https://receptor.prueba/cohorte'
    const c = new Cohorte(conJournal(), tmp('cohorte-d-'))
    c.fijarConsentimiento(true)
    expect(await c.enviar((async () => { throw new Error('no debe llamar') }) as unknown as typeof fetch)).toBe('no_cliente')
  })
})
