/**
 * Subagentes en la edición cliente (29 oct 2026, fundador en Windows: «No tengo la herramienta de crear subagentes»).
 * El alumno delega con `Agent` del SDK, que corre en su sesión: estas pruebas fijan que el subagente queda bajo la MISMA
 * guardia que el chat (misma política, mismo modo, mismas tarjetas), que lo que lo sacaría de ella se niega, que
 * `delegar` (procesos aparte, red team A1) sigue fuera y que Taller › Agentes tiene de dónde leer.
 */
import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Confirmaciones } from './confirmaciones.js'
import { decidirHerramienta, type ContextoPolitica } from './politica-agentes.js'
import { motivoSubagenteCliente, TIPOS_SUBAGENTE_CLIENTE } from './subagentes-sdk.js'
import { guardiaHooks, permisosCliente, _contaminadasParaPruebas } from '../guardia-agentes.js'
import { conViaUnica, ganchoViaUnica, herramientasProhibidasChat, subagentesSdkPermitidos } from '../cabina/una-sola-via.js'
import { trabajosCliente } from '../cabina/trabajos-cliente.js'
import type { TareaInterna } from '../cabina/internos.js'

let raiz = '', usuario = '', home = '', datos = ''
const previo = { config: process.env.ARBRAIN_CONFIG_DIR, edicion: process.env.ARBRAIN_EDICION, sub: process.env.ARBRAIN_SUBAGENTES }
const ctxDe = (over: Partial<ContextoPolitica> = {}): ContextoPolitica =>
  ({ home, cwd: home, usuario, protegidas: [datos], lecturaExtra: [], abiertas: [], sandbox: false, modo: 'carpeta', ...over })

beforeAll(() => {
  raiz = realpathSync(mkdtempSync(join(tmpdir(), 'arbrain-subagentes-')))
  usuario = join(raiz, 'usuario'); home = join(usuario, 'Mi Arbrain'); datos = join(raiz, 'datos')
  for (const d of [join(home, 'notas'), datos]) mkdirSync(d, { recursive: true })
  writeFileSync(join(home, 'notas', 'a.md'), 'a')
  writeFileSync(join(home, '.env'), 'X=1')
  process.env.ARBRAIN_CONFIG_DIR = join(datos, 'config')
})
afterAll(() => {
  for (const [k, v] of [['ARBRAIN_CONFIG_DIR', previo.config], ['ARBRAIN_EDICION', previo.edicion], ['ARBRAIN_SUBAGENTES', previo.sub]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  rmSync(raiz, { recursive: true, force: true })
})
beforeEach(() => { process.env.ARBRAIN_EDICION = 'cliente'; delete process.env.ARBRAIN_SUBAGENTES; _contaminadasParaPruebas().clear() })

type Salida = { continue?: boolean; hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } }
/** Una llamada de herramienta tal como la manda el CLI desde DENTRO de un subagente: misma sesión, `agent_id` propio. */
const deSubagente = (m: ReturnType<typeof guardiaHooks>['PreToolUse'][number], tool_name: string, tool_input: unknown, extra: Record<string, unknown> = {}) =>
  m.hooks[0]({ hook_event_name: 'PreToolUse', tool_name, tool_input, tool_use_id: `t-${Math.random()}`, session_id: 's-chat', agent_id: 'a1b2c3', agent_type: 'general-purpose', permission_mode: 'auto', cwd: home, ...extra } as never, undefined, { signal: new AbortController().signal }) as Promise<Salida>

const encargo = { description: 'Resumir notas', prompt: 'Lee notas/ y resume', subagent_type: 'general-purpose' }

describe('la política: Agent corre bajo la guardia; lo que lo sacaría de ella, no', () => {
  it('Agent y Task con un tipo integrado se permiten (la guardia revisa cada herramienta del subagente)', () => {
    for (const tipo of [...TIPOS_SUBAGENTE_CLIENTE, undefined]) {
      expect(decidirHerramienta('Agent', { ...encargo, subagent_type: tipo }, ctxDe()).tipo, String(tipo)).toBe('permitir')
      expect(decidirHerramienta('Task', { ...encargo, subagent_type: tipo }, ctxDe({ modo: 'preguntar' })).tipo).toBe('permitir')
    }
    expect(decidirHerramienta('Agent', { ...encargo, run_in_background: true }, ctxDe({ modo: 'autonomo' })).tipo).toBe('permitir')
  })
  it('se niega: nube o worktree (fuera de esta máquina o git sin tarjeta), tipos propios y otro modo', () => {
    for (const extra of [{ isolation: 'remote' }, { isolation: 'worktree' }, { subagent_type: 'mi-agente' }, { subagent_type: 'statusline-setup' }, { mode: 'bypassPermissions' }, { mode: 'acceptEdits' }]) {
      const d = decidirHerramienta('Agent', { ...encargo, ...extra }, ctxDe({ modo: 'autonomo' }))
      expect(d.tipo, JSON.stringify(extra)).toBe('negar')
    }
    expect(motivoSubagenteCliente({ ...encargo, isolation: 'remote' })).toMatch(/carpeta de la conversación/)
  })
  it('ARBRAIN_SUBAGENTES=0 los apaga', () => {
    expect(motivoSubagenteCliente(encargo, { ARBRAIN_SUBAGENTES: '0' })).toMatch(/apagados/)
    process.env.ARBRAIN_SUBAGENTES = '0'
    expect(decidirHerramienta('Agent', encargo, ctxDe()).tipo).toBe('negar')
  })
  it('el ciclo de vida del subagente (SubagentHandback, SendMessage) no pide tarjeta', () => {
    // Visto en la corrida real del SDK 0.3.295: al terminar, el subagente llama SubagentHandback por la misma guardia.
    expect(decidirHerramienta('SubagentHandback', {}, ctxDe({ modo: 'preguntar' })).tipo).toBe('permitir')
    expect(decidirHerramienta('SendMessage', { to: 'x', message: 'sigue' }, ctxDe({ modo: 'preguntar' })).tipo).toBe('permitir')
  })
  it('red team A1 sigue: delegar de la Cabina (procesos aparte) se niega y dice cuál es la vía', () => {
    const d = decidirHerramienta('mcp__cabina__delegar', { nombre: 'x', harness: 'claude', encargo: 'y', cwd: '/tmp/x' }, ctxDe({ modo: 'autonomo' }))
    expect(d.tipo).toBe('negar')
    expect(d.tipo === 'negar' && d.motivo).toMatch(/Agent/)
  })
})

describe('el subagente bajo la misma guardia que el chat (ganchos con agent_id)', () => {
  it('una acción con freno desde el subagente pide la tarjeta de la persona en su hilo; sin clic, no corre', async () => {
    const store = new Confirmaciones(new Database(':memory:'))
    const [m] = guardiaHooks(() => {}, { confirmaciones: () => store, hayQuienConfirme: () => true, esperaMs: 300, contexto: () => ctxDe() }).PreToolUse
    const p = deSubagente(m, 'Bash', { command: 'git push origin main' })
    await new Promise(r => setTimeout(r, 60))
    const c = store.pendientes()[0]
    expect(c?.categoria).toBe('publicar')
    expect((await p).hookSpecificOutput?.permissionDecision).toBe('deny')
  })
  it('lo negado al chat se le niega al subagente (secretos, borrar en masa)', async () => {
    const store = new Confirmaciones(new Database(':memory:'))
    const [m] = guardiaHooks(() => {}, { confirmaciones: () => store, hayQuienConfirme: () => true, esperaMs: 100, contexto: () => ctxDe({ modo: 'autonomo' }) }).PreToolUse
    expect((await deSubagente(m, 'Read', { file_path: join(home, '.env') })).hookSpecificOutput?.permissionDecision).toBe('deny')
    expect((await deSubagente(m, 'Bash', { command: 'cat ~/.ssh/id_ed25519' })).hookSpecificOutput?.permissionDecision).toBe('deny')
    expect((await deSubagente(m, 'Bash', { command: 'rm -rf notas' })).hookSpecificOutput?.permissionDecision).toBe('deny')
    expect(store.pendientes()).toHaveLength(0)
  })
  it('modo automático: solo se deja al clasificador lo que corre en modo auto; un subagente con otro modo sube a la tarjeta', async () => {
    const store = new Confirmaciones(new Database(':memory:'))
    const [m] = guardiaHooks(() => {}, { confirmaciones: () => store, hayQuienConfirme: () => true, esperaMs: 100, contexto: () => ctxDe(), clasificador: true }).PreToolUse
    // En auto (heredado del chat): igual que el chat, al clasificador.
    expect(await deSubagente(m, 'Bash', { command: 'npm test' })).toEqual({ continue: true })
    expect(store.pendientes()).toHaveLength(0)
    // Con otro modo (una definición que lo cambiara): nadie la revisaría después, así que sube a la tarjeta.
    const r = await deSubagente(m, 'Bash', { command: 'npm test' }, { permission_mode: 'bypassPermissions' })
    expect(r.hookSpecificOutput?.permissionDecision).toBe('deny')
    expect(store.pendientes().map(c => c.literal)).toEqual(['npm test'])
  })
  it('canUseTool con agentID decide con la misma política', async () => {
    const usar = permisosCliente(async (_h, input) => ({ behavior: 'allow' as const, updatedInput: input }), () => {}, { contexto: () => ctxDe({ modo: 'autonomo' }) })
    const r = await usar('Read', { file_path: join(home, '.env') }, { signal: new AbortController().signal, toolUseID: 'tu-sub', agentID: 'a1b2c3', requestId: 'rq' } as never)
    expect(r?.behavior).toBe('deny')
    const ok = await usar('Read', { file_path: join(home, 'notas', 'a.md') }, { signal: new AbortController().signal, toolUseID: 'tu-sub2', agentID: 'a1b2c3', requestId: 'rq' } as never)
    expect(ok?.behavior).toBe('allow')
  })
})

describe('una sola vía en cliente: Agent/Task disponibles; delegar no', () => {
  it('el chat del alumno no lleva Agent/Task en disallowedTools (salvo ARBRAIN_SUBAGENTES=0); Daniel sí', () => {
    expect(herramientasProhibidasChat({ durable: true, env: {}, cliente: true })).not.toContain('Agent')
    expect(herramientasProhibidasChat({ durable: true, env: {}, cliente: true })).not.toContain('Task')
    expect(herramientasProhibidasChat({ durable: true, env: { ARBRAIN_EDICION: 'cliente' } })).not.toContain('Agent')
    expect(herramientasProhibidasChat({ durable: true, env: { ARBRAIN_SUBAGENTES: '0' }, cliente: true })).toEqual(expect.arrayContaining(['Agent', 'Task']))
    expect(herramientasProhibidasChat({ durable: true, env: {}, cliente: false })).toEqual(expect.arrayContaining(['Agent', 'Task']))
    expect(subagentesSdkPermitidos({ ARBRAIN_EDICION: 'cliente' })).toBe(true)
    expect(subagentesSdkPermitidos({})).toBe(false)
  })
  it('el gancho de la vía única deja pasar Agent en cliente y sigue cerrando Workflow fuera de ultracode', async () => {
    const pre = (tool_name: string) => ({ hook_event_name: 'PreToolUse', tool_name, tool_input: {}, tool_use_id: 't', session_id: 's', transcript_path: '', cwd: '/' }) as never
    const g = ganchoViaUnica('conv-cliente', true)
    const d = async (t: string) => ((await g.hooks[0](pre(t), 't', { signal: new AbortController().signal })) as Salida).hookSpecificOutput?.permissionDecision ?? 'sigue'
    expect(await d('Agent')).toBe('sigue')
    expect(await d('Task')).toBe('sigue')
    expect(await d('Workflow')).toBe('deny')
    const h = conViaUnica<{ PreToolUse?: import('@anthropic-ai/claude-agent-sdk').HookCallbackMatcher[] }>({}, 'conv-cliente', { ARBRAIN_EDICION: 'cliente' })
    const enSesion = h.PreToolUse![0]
    expect(((await enSesion.hooks[0](pre('Agent'), 't', { signal: new AbortController().signal })) as Salida).hookSpecificOutput?.permissionDecision).toBeUndefined()
  })
  it('la Cabina del alumno sigue sin delegar y, si Levy la intenta, lo manda a Agent', async () => {
    const { cabinaToolsVisibles, ejecutarCabina } = await import('../cabina/tools.js')
    expect(cabinaToolsVisibles().map(t => t.name)).not.toContain('delegar')
    const r = await ejecutarCabina('delegar', { nombre: 'x', harness: 'claude', encargo: 'y', cwd: '/tmp/x' })
    expect(r.error).toBe(true)
    expect(r.text).toMatch(/herramienta Agent/)
    expect(r.text).toMatch(/Taller › Agentes/)
    process.env.ARBRAIN_SUBAGENTES = '0'
    expect((await ejecutarCabina('delegar', {})).text).toMatch(/apagados/)
  })
  it('la ayuda del alumno le explica cómo delegar', async () => {
    const { ayudaDeCliente } = await import('../cabina/ayuda.js')
    const t = ayudaDeCliente('la persona', 'subagentes')
    expect(t).toMatch(/herramienta Agent/)
    expect(t).toMatch(/misma guardia/i)
    expect(t).not.toMatch(/Studio/)
    expect(ayudaDeCliente('la persona', 'delegar')).toBe(t)
    expect(ayudaDeCliente('la persona')).toMatch(/subagentes/)
  })
})

describe('Taller › Agentes en cliente: la fuente del daemon del alumno', () => {
  const interna = (over: Partial<TareaInterna> = {}): TareaInterna => ({ id: 'a1b2c3', tipo: 'subagente', descripcion: 'Resumir notas', estado: 'trabajando', desde: '2026-10-29T10:00:00Z', actualizado: '2026-10-29T10:01:00Z', conversacion: 'c1', turno: 't1', pid: 1, ...over })
  it('trae SUS subagentes y nada del Studio (sin terminales, servidores ni servicios)', async () => {
    const t = await trabajosCliente({ leer: async () => [interna({ resultado: 'mucho texto' })], tachar: s => s })
    expect(t.internas.map(x => x.id)).toEqual(['a1b2c3'])
    expect(t.internas[0].resultado).toBeUndefined()
    expect(t.terminales).toEqual([]); expect(t.servidores).toEqual([]); expect(t.servicios).toEqual([])
    expect(JSON.stringify(t)).not.toMatch(/Studio/)
  })
  it('sin nada delegado: lista vacía, sin error', async () => {
    const t = await trabajosCliente({ leer: async () => [], tachar: s => s })
    expect(t.internas).toEqual([])
    expect(t.error).toBeUndefined()
  })
})
