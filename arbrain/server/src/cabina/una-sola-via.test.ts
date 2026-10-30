// Una sola vía para subagentes (27 oct 2026): el chat de Levy no puede lanzar Agent/Task del SDK y Workflow solo corre
// en un turno cuyo mensaje dice «ultracode». Se prueba la regla pura y lo que runAgentStream le pasa de verdad al SDK.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { HookInput, SyncHookJSONOutput, Options } from '@anthropic-ai/claude-agent-sdk'

const f = vi.hoisted(() => ({ open: vi.fn(), opciones: [] as Options[] }))
vi.mock('../chat-runtime/claude-pool.js', () => ({ claudeRuntimePool: { open: f.open, invalidate: vi.fn() } }))
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn(), getSessionMessages: vi.fn() }))
vi.mock('../ops-logger.js', () => ({ opsLogger: { log: vi.fn() } }))
vi.mock('../logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { runAgentStream } from '../agent.js'
import { conViaUnica, ganchoViaUnica, herramientasProhibidasChat, marcarTurno, pideUltracode, workflowPermitido, MENSAJE_WORKFLOW } from './una-sola-via.js'

const pre = (tool_name: string): HookInput => ({ hook_event_name: 'PreToolUse', tool_name, tool_input: {}, tool_use_id: 't', session_id: 's', transcript_path: '', cwd: '/' } as unknown as HookInput)
const decision = (r: SyncHookJSONOutput) => (r.hookSpecificOutput as { permissionDecision?: string } | undefined)?.permissionDecision ?? 'sigue'
const correrGancho = async (m: ReturnType<typeof ganchoViaUnica>, tool: string) => decision(await m.hooks[0](pre(tool), 't', { signal: new AbortController().signal }) as SyncHookJSONOutput)

describe('una sola vía: regla pura', () => {
  it('Agent y Task quedan prohibidos en el chat, con lo de siempre (crons de sesión y MCPs con popup)', () => {
    const l = herramientasProhibidasChat({ durable: true, env: {} })
    expect(l).toEqual(expect.arrayContaining(['Agent', 'Task', 'CronCreate', 'ScheduleWakeup', 'mcp__claude_ai_Gmail__*']))
    expect(l).not.toContain('Workflow')
    expect(herramientasProhibidasChat({ durable: false, env: {} })).toEqual(expect.arrayContaining(['Agent', 'Task']))
    expect(herramientasProhibidasChat({ durable: false, env: {} })).not.toContain('CronCreate')
    // reversa sin deploy
    expect(herramientasProhibidasChat({ durable: true, env: { ARBRAIN_UNA_SOLA_VIA: '0' } })).not.toContain('Agent')
  })

  it('ultracode como palabra, igual que el resaltado del chat', () => {
    expect(pideUltracode('ultracode: migra los tests')).toBe(true)
    expect(pideUltracode('hazlo con ULTRACODE')).toBe(true)
    expect(pideUltracode('ultracodex no cuenta')).toBe(false)
    expect(pideUltracode('hola')).toBe(false)
    expect(pideUltracode('hola', true)).toBe(true)
  })

  it('el gancho niega Workflow fuera de ultracode y Agent/Task siempre; lo demás sigue', async () => {
    const g = ganchoViaUnica('conv-a')
    marcarTurno('conv-a', 'revisa el repo')
    expect(await correrGancho(g, 'Workflow')).toBe('deny')
    expect(await correrGancho(g, 'Agent')).toBe('deny')
    expect(await correrGancho(g, 'Task')).toBe('deny')
    expect(await correrGancho(g, 'Bash')).toBe('sigue')
    marcarTurno('conv-a', 'ultracode revisa el repo')
    expect(workflowPermitido('conv-a')).toBe(true)
    expect(await correrGancho(g, 'Workflow')).toBe('sigue')
    expect(await correrGancho(g, 'Agent')).toBe('deny')
    // el siguiente turno sin la palabra vuelve a cerrarlo (el gancho vive en la sesión, el permiso es del turno)
    marcarTurno('conv-a', 'gracias')
    expect(await correrGancho(g, 'Workflow')).toBe('deny')
    // otra conversación no hereda el permiso
    expect(workflowPermitido('conv-b')).toBe(false)
  })

  it('conViaUnica suma el gancho sin pisar otros y se apaga con ARBRAIN_UNA_SOLA_VIA=0', () => {
    const otro = { matcher: 'mcp__x', hooks: [] }
    const h = conViaUnica({ PreToolUse: [otro] }, 'c', {})
    expect(h.PreToolUse).toHaveLength(2)
    expect(h.PreToolUse![1]).toBe(otro)
    expect(conViaUnica({ PreToolUse: [otro] }, 'c', { ARBRAIN_UNA_SOLA_VIA: '0' }).PreToolUse).toHaveLength(1)
    expect(conViaUnica({ PreToolUse: undefined }, null, {}).PreToolUse).toBeUndefined()
  })
})

describe('una sola vía: lo que el chat le pasa al SDK', () => {
  const scope = { owner: 'owner', account: 'default', conversationId: 'chat-via', turnId: 'turn' }
  beforeEach(() => {
    f.opciones = []
    f.open.mockReset()
    f.open.mockImplementation((_scope: unknown, options: Options) => {
      f.opciones.push(options)
      return {
        query: { interrupt: vi.fn() }, session: { close: vi.fn() }, release: vi.fn(),
        events: (async function* () {
          yield { type: 'system', subtype: 'init', session_id: 'native', model: 'claude-opus-5', slash_commands: [] }
          yield { type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: 'native', usage: {} }
        })(),
      }
    })
  })
  const turno = async (mensaje: string) => {
    for await (const _ of runAgentStream(mensaje, 'native', undefined, undefined, undefined, 'web', false, undefined, undefined, { model: 'claude-opus-5', effort: 'low', fast: false, ultracode: false }, { scope, onBackground: () => {} })) { /* drena */ }
    return f.opciones.at(-1)!
  }

  it('disallowedTools trae Agent y Task, y la lista no cambia con ultracode (no reabre la sesión del pool)', async () => {
    const a = await turno('hola Levy')
    const b = await turno('ultracode: haz la migración')
    expect(a.disallowedTools).toEqual(expect.arrayContaining(['Agent', 'Task']))
    expect(a.disallowedTools).not.toContain('Workflow')
    expect(b.disallowedTools).toEqual(a.disallowedTools)
    expect(JSON.stringify(a.hooks)).toBe(JSON.stringify(b.hooks))
  })

  it('el gancho de la sesión niega Workflow en un turno normal y lo deja pasar con ultracode', async () => {
    const opciones = await turno('hola Levy')
    const gancho = opciones.hooks!.PreToolUse!.find(m => m.matcher === 'Workflow|Agent|Task')!
    expect(gancho).toBeTruthy()
    const r = await gancho.hooks[0](pre('Workflow'), 't', { signal: new AbortController().signal }) as SyncHookJSONOutput
    expect(decision(r)).toBe('deny')
    expect((r.hookSpecificOutput as { permissionDecisionReason?: string }).permissionDecisionReason).toBe(MENSAJE_WORKFLOW)
    await turno('ultracode, por favor')
    expect(decision(await gancho.hooks[0](pre('Workflow'), 't', { signal: new AbortController().signal }) as SyncHookJSONOutput)).toBe('sigue')
  })
})
