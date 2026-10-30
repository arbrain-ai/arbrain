import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:net'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { frame, parseFrames, motor, MotorError } from './cliente.js'
import { claudeSlug, harnessDe, leer, tokensDe } from './lector.js'
import { calcularTopes, comando, enSuPrompt, herramientaLegible, resumirConversacion, type Subagente } from '../cabina/cuerpo.js'

describe('cable del motor (PROTO 1 de ptyd)', () => {
  it('parte marcos completos y guarda el resto', () => {
    const a = frame(1, 7, Buffer.from('{"res":"ok"}'))
    const b = frame(2, 100000, Buffer.from('hola\n{"op":"kill"}'))
    const { frames, rest } = parseFrames(Buffer.concat([a, b.subarray(0, 5)]))
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({ kind: 1, id: 7 })
    expect(parseFrames(Buffer.concat([rest, b.subarray(5)])).frames[0].payload.toString()).toBe('hola\n{"op":"kill"}')
  })
})

describe('lector multi-harness', () => {
  it('reconoce los 7 harness y nada más', () => {
    expect(['claude', 'codex', 'pi', 'opencode', 'qwen', 'gemini', 'crush'].every(h => harnessDe(h) === h)).toBe(true)
    expect(harnessDe('zsh')).toBeNull()
  })

  it('encuentra por --session-id la conversación de Claude y la lee con el parser de SFTerm', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lector-'))
    const cwd = '/tmp/subagente-prueba'
    const sid = '3f0c8a52-1d2e-4b7a-9c4d-2a1b3c4d5e6f'
    const dir = join(root, 'projects', claudeSlug(cwd)); mkdirSync(dir, { recursive: true })
    const l = (o: object) => JSON.stringify(o)
    writeFileSync(join(dir, `${sid}.jsonl`), [
      l({ type: 'user', uuid: 'u1', sessionId: sid, cwd, timestamp: '2026-09-30T23:00:00Z', message: { role: 'user', content: 'Crea /tmp/subagente-prueba/hola.txt' } }),
      l({ type: 'assistant', uuid: 'a1', sessionId: sid, cwd, timestamp: '2026-09-30T23:00:05Z', message: { id: 'm1', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'Listo: creé hola.txt' }], usage: { input_tokens: 1000, cache_creation_input_tokens: 500, cache_read_input_tokens: 9000, output_tokens: 42 } } }),
    ].join('\n') + '\n')
    const r = await leer({ pid: 1, name: 'claude', argv: ['claude', '--session-id', sid, 'encargo'], cwd, start_s: Math.floor(Date.now() / 1000), config_dir: root })
    expect(r?.ubicacion.path.endsWith(`${sid}.jsonl`)).toBe(true)
    expect(r?.tokens).toBe(1542)
    const c = resumirConversacion('claude', r)
    expect(c?.modelo).toContain('sonnet')
    expect(c?.mensajes.map(m => m.rol)).toEqual(['user', 'assistant'])
    expect(c?.mensajes[1].texto).toContain('creé hola.txt')
  })

  it('tokens de codex salen de su último total', () => {
    const raw = '{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":10,"output_tokens":5,"total_tokens":15}}}}\n{"x":1}\n{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":90,"output_tokens":10,"total_tokens":100}}}}'
    expect(tokensDe('codex', raw)).toBe(100)
    expect(tokensDe('pi', raw)).toBeNull()
  })

  it('la copia del lector declara su origen en SFTerm', () => {
    const origen = readFileSync(fileURLToPath(new URL('./sfterm/ORIGEN.sha256', import.meta.url)), 'utf8')
    expect(origen).toMatch(/transcripts\/claude\.ts/)
  })
})

describe('cuerpo sobre el motor', () => {
  it('el encargo viaja citado como prompt inicial y Claude nace con su sesión', () => {
    // bypassPermissions por defecto (Daniel, 1 oct 08:20); el modo viejo sigue disponible por entorno
    expect(comando('claude', 'claude-sonnet-5-5', "hola 'mundo'", 'abc', 'acceptEdits')).toBe("claude --model claude-sonnet-5-5 --permission-mode acceptEdits --session-id abc 'hola '\\''mundo'\\'''")
    expect(comando('claude', 'claude-sonnet-5-5', 'x', 'abc')).toBe(`claude --model claude-sonnet-5-5 --permission-mode bypassPermissions --settings '{"skipDangerousModePermissionPrompt":true}' --session-id abc 'x'`)
    expect(comando('codex', null, 'x', undefined, 'acceptEdits')).toBe("codex --sandbox workspace-write --ask-for-approval never 'x'")
    expect(comando('codex', null, 'x')).toBe("codex --dangerously-bypass-approvals-and-sandbox 'x'")
  })
  it('«Usó» en palabras, sin comandos crudos', () => {
    expect(herramientaLegible('Write', '/tmp/cabina/sub/hola.txt')).toBe('escribió sub/hola.txt')
    expect(herramientaLegible('Bash', 'for i in $(seq 1 75); do curl -H "Authorization: Bearer abc"')).toBe('corrió un comando')
    expect(herramientaLegible('mcp__claude-in-chrome__computer')).toBe('computer')
  })
  it('no entrega sobre un turno en curso', () => {
    expect(enSuPrompt('claude', 'algo\n❯ \n  ? for shortcuts')).toBe(true)
    expect(enSuPrompt('claude', '✻ Pondering… (3s · esc to interrupt)\n❯ ')).toBe(false)
    expect(enSuPrompt('codex', '› Ask Codex to do anything')).toBe(true)
  })
  it('tope de paralelo cuenta solo los vivos de Levy; el de tokens, los del día', () => {
    const hoy = new Date().toISOString()
    const r: Subagente[] = [
      { id: 100000, nombre: 'a', harness: 'claude', encargo: '', cwd: '/tmp/a', creado: hoy, tokens: 1000 },
      { id: 100001, nombre: 'b', harness: 'codex', encargo: '', cwd: '/tmp/b', creado: hoy, cerrado: hoy, tokens: 500 },
      { id: 100002, nombre: 'c', harness: 'claude', encargo: '', cwd: '/tmp/c', creado: '2026-01-01T12:00:00Z', tokens: 9_999_999 },
      { id: 100003, nombre: 'd', harness: 'claude', encargo: '', cwd: '/tmp/d', creado: hoy },
    ]
    const t = calcularTopes(r, new Set([100000, 100001, 100003, 5]))
    expect(t.paralelo.vivos).toBe(2)
    expect(t.tokens.hoy).toBe(1500)
    expect(t.tokens.sinMedir).toBe(1)
  })
})

// Candado de cierre (1 oct 2026): un motor falso con una terminal adoptada (SFTerm) y una propia.
describe('candado de cierre', () => {
  let server: Server
  const kills: Record<string, unknown>[] = []
  const dir = mkdtempSync(join(tmpdir(), 'motor-candado-'))
  const sock = join(dir, 'm.sock')
  const term = (id: number, origin: string) => ({ id, pid: id + 1, cwd: '/tmp', cols: 80, rows: 24, born_ms: 0, origin, readonly: false, fg: null })
  beforeAll(async () => {
    server = createServer(c => {
      let buf: Buffer = Buffer.alloc(0)
      c.on('data', d => {
        const { frames, rest } = parseFrames(Buffer.concat([buf, d])); buf = rest
        for (const f of frames) {
          const req = JSON.parse(f.payload.toString())
          const res = req.op === 'hello' ? { res: 'hello', pid: 1 }
            : req.op === 'info' ? { res: 'info', motor: {}, terms: [term(13, 'sfterm-ptyd'), term(100004, 'motor')] }
            : req.op === 'kill' ? (kills.push(req), { res: 'ok' }) : { res: 'err', msg: 'op' }
          c.write(frame(1, f.id, Buffer.from(JSON.stringify(res))))
        }
      })
    })
    await new Promise<void>(r => server.listen(sock, r))
    process.env.ARBRAIN_MOTOR_SOCK = sock
  })
  afterAll(() => { server?.close(); delete process.env.ARBRAIN_MOTOR_SOCK })

  it('cierra sola una terminal que nació en el motor (de Levy)', async () => {
    await motor.kill(100004)
    expect(kills.at(-1)).toMatchObject({ op: 'kill', id: 100004 })
    expect(kills.at(-1)).not.toHaveProperty('autoriza')
  })

  it('no cierra una terminal adoptada de SFTerm sin la autorización de Daniel', async () => {
    const antes = kills.length
    await expect(motor.kill(13)).rejects.toBeInstanceOf(MotorError)
    await expect(motor.kill(13, { autoriza: '   ' })).rejects.toThrow(/no la lanzó Levy/)
    expect(kills.length).toBe(antes)
  })

  it('con la cita de Daniel la cierra y la cita viaja al motor', async () => {
    await motor.kill(13, { autoriza: 'Daniel 10:22: cierra la 13, Claridad ya terminó' })
    expect(kills.at(-1)).toMatchObject({ op: 'kill', id: 13, autoriza: 'Daniel 10:22: cierra la 13, Claridad ya terminó' })
  })
})

// Integración con el binario real (si está compilado): socket aislado en /tmp.
const BIN = fileURLToPath(new URL('../../../motor/target/debug/arbrain-motor', import.meta.url))
describe.skipIf(!existsSync(BIN))('motor real', () => {
  let proc: ChildProcess
  const dir = mkdtempSync(join(tmpdir(), 'motor-node-'))
  const sock = join(dir, 'm.sock')
  beforeAll(async () => {
    proc = spawn(BIN, [], { env: { ...process.env, ARBRAIN_MOTOR_SOCK: sock, ARBRAIN_MOTOR_LEGACY: 'off' }, stdio: 'ignore' })
    process.env.ARBRAIN_MOTOR_SOCK = sock
    for (let i = 0; i < 100 && !existsSync(sock); i++) await new Promise(r => setTimeout(r, 50))
  })
  afterAll(() => { proc?.kill(); delete process.env.ARBRAIN_MOTOR_SOCK })

  it('lanza, lee la pantalla sin GUI, escribe y cierra', async () => {
    const { id, pid } = await motor.spawn({ cwd: '/tmp', command: "printf 'NODO-%s\\n' MOTOR" })
    expect(id).toBeGreaterThanOrEqual(100000)
    let texto = ''
    for (let i = 0; i < 100 && !texto.includes('NODO-MOTOR'); i++) { texto = await motor.screen(id); await new Promise(r => setTimeout(r, 100)) }
    expect(texto).toContain('NODO-MOTOR')
    const { terms, motor: m } = await motor.info()
    expect(terms.find(t => t.id === id)).toMatchObject({ pid, origin: 'motor' })
    expect(m.relevos).toBe(0)
    await motor.write(id, 'echo ESCRITO-$((6*7))\r')
    for (let i = 0; i < 100 && !texto.includes('ESCRITO-42'); i++) { texto = await motor.screen(id); await new Promise(r => setTimeout(r, 100)) }
    expect(texto).toContain('ESCRITO-42')
    await motor.kill(id)
    for (let i = 0; i < 50 && (await motor.info()).terms.some(t => t.id === id); i++) await new Promise(r => setTimeout(r, 100))
    expect((await motor.info()).terms.some(t => t.id === id)).toBe(false)
  }, 30_000)
})
