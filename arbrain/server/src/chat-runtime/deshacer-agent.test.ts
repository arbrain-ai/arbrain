import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { SSEEvent } from '../agent.js'
const f = vi.hoisted(() => ({ open: vi.fn(), query: vi.fn(), validate: vi.fn() }))
vi.mock('./claude-selection.js', async () => ({ ...await vi.importActual('./claude-selection.js'), validateClaudeSelection: f.validate }))
vi.mock('./claude-pool.js', () => ({ claudeRuntimePool: { open: f.open } }))
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: f.query, getSessionMessages: vi.fn() }))
vi.mock('../ops-logger.js', () => ({ opsLogger: { log: vi.fn() } }))
vi.mock('../logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
import { runAgentStream } from '../agent.js'
const scope = { owner: 'owner', account: 'default', conversationId: 'chat', turnId: 'turn' }
const collect = async (events: AsyncIterable<SSEEvent>) => { for await (const _ of events) { /* drenar */ } }
const eventos = [
  { type: 'system', subtype: 'init', session_id: 'native', model: 'claude-opus-5', slash_commands: [] },
  { type: 'result', subtype: 'success', is_error: false, result: 'ok', user_message_uuid: 'turn', session_id: 'native', usage: { input_tokens: 1, output_tokens: 1 }, modelUsage: {} },
]
const previo = process.env.ARBRAIN_CHECKPOINTS
beforeEach(() => {
  vi.clearAllMocks()
  f.validate.mockResolvedValue(undefined)
  f.open.mockImplementation(() => ({ query: { interrupt: vi.fn() }, session: { close: vi.fn() }, release: vi.fn(), events: (async function* () { yield* eventos })() }))
  f.query.mockImplementation(() => (async function* () { yield* eventos })())
})
afterEach(() => { if (previo === undefined) delete process.env.ARBRAIN_CHECKPOINTS; else process.env.ARBRAIN_CHECKPOINTS = previo })
const chat = () => collect(runAgentStream('hola', 'native', undefined, undefined, undefined, 'web', false, undefined, undefined, undefined, { scope, onBackground: () => {} }))

describe('opciones del query y el checkpoint de archivos', () => {
  it('el turno del chat lleva enableFileCheckpointing cuando está activo', async () => {
    delete process.env.ARBRAIN_CHECKPOINTS
    await chat()
    expect(f.open.mock.calls[0][1]).toMatchObject({ enableFileCheckpointing: true })
  })
  it('ARBRAIN_CHECKPOINTS=0 lo quita del query', async () => {
    process.env.ARBRAIN_CHECKPOINTS = '0'
    await chat()
    expect(f.open.mock.calls[0][1].enableFileCheckpointing).toBeUndefined()
  })
  it('la síntesis sin herramientas nunca lo lleva', async () => {
    delete process.env.ARBRAIN_CHECKPOINTS
    await collect(runAgentStream('hola', undefined, undefined, undefined, undefined, 'web', true))
    const opciones = (f.open.mock.calls[0]?.[1] ?? f.query.mock.calls[0]?.[0]?.options) as Record<string, unknown>
    expect(opciones.enableFileCheckpointing).toBeUndefined()
  })
})
