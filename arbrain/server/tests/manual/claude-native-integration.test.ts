/** Manual real-subscription canary. Excluded from automatic contract suites.
 * Only filesystem/config/logging side effects are isolated; SDK inference,
 * persistent pool and the actual runAgentStream SSE projection are real.
 */
import { beforeAll, afterAll, it, expect, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { SSEEvent, SessionOverrides } from '../../src/agent.js'
const f = vi.hoisted(() => ({ cwd: `/tmp/arbrain-claude-integration-${process.pid}`, queryCalls: 0, catalogs: [] as unknown[], nativeResults: [] as unknown[] }))
vi.mock('../../src/config.js', () => ({ PROJECT_ROOT: f.cwd, STORE_DIR: f.cwd, AGENT_TIMEOUT_MS: 90_000 }))
vi.mock('../../src/env.js', () => ({ readEnvFile: () => ({}) }))
vi.mock('../../src/ops-logger.js', () => ({ opsLogger: { log: () => {} } }))
vi.mock('../../src/logger.js', () => ({ logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } }))
vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  const sdk = await vi.importActual<typeof import('@anthropic-ai/claude-agent-sdk')>('@anthropic-ai/claude-agent-sdk')
  return { ...sdk, query: (args: Parameters<typeof sdk.query>[0]) => {
    f.queryCalls++
    const native = sdk.query({ ...args, options: { ...args.options, settingSources: ['user'], tools: [], settings: { ...(typeof args.options?.settings === 'object' ? args.options.settings : {}), disableAllHooks: true }, systemPrompt: 'Synthetic session test. Use no tools. Answer exactly what the user asks.' } })
    const supportedModels = native.supportedModels.bind(native)
    native.supportedModels = async () => {
      const models = await supportedModels()
      f.catalogs.push({ requestedModel: args.options?.model, models: models.map(m => ({ value: m.value, resolvedModel: m.resolvedModel })) })
      return models
    }
    const iterator = native[Symbol.asyncIterator].bind(native)
    native[Symbol.asyncIterator] = async function* () {
      for await (const frame of { [Symbol.asyncIterator]: iterator }) {
        if (frame.type === 'result') f.nativeResults.push(frame)
        yield frame
      }
    }
    return native
  } }
})
import { runAgentStream } from '../../src/agent.js'
import { claudeRuntimePool } from '../../src/chat-runtime/claude-pool.js'
import { resolveClaudeSelection } from '../../src/chat-runtime/claude-selection.js'
beforeAll(() => mkdirSync(f.cwd, { recursive: true }))
afterAll(() => { claudeRuntimePool.close(); rmSync(f.cwd, { recursive: true, force: true }) })

it.skipIf(process.env.ARBRAIN_CLAUDE_NATIVE_SMOKE !== '1')('keeps real Claude conversation context and exact UUIDs through the durable runner SSE path', async () => {
  const conversationId = randomUUID(), observations: unknown[] = []
  const overrides: SessionOverrides = { model: null, effort: null, fast: false, ultracode: false }
  const selection = await resolveClaudeSelection(f.cwd, 'default', overrides)
  const discoveryQueryCalls = f.queryCalls
  f.queryCalls = 0
  async function run(message: string, resume?: string) {
    const turnId = randomUUID(), events: SSEEvent[] = [], started = performance.now()
    let firstTextMs: number | undefined
    for await (const event of runAgentStream(message, resume, undefined, undefined, undefined, 'web', true, undefined, undefined, overrides, {
      scope: { owner: 'synthetic-owner', account: 'default', conversationId, turnId }, onBackground: () => {}, selection,
    })) {
      if (event.type === 'text_delta') firstTextMs ??= Math.round(performance.now() - started)
      events.push(event)
    }
    expect(events.filter(event => event.type === 'error'), JSON.stringify({ selection, catalogs: f.catalogs, nativeResults: f.nativeResults })).toEqual([])
    const binding = events.find(event => event.type === 'native_turn')
    expect(binding).toMatchObject({ type: 'native_turn', turnId, account: 'default' })
    const result = events.findLast(event => event.type === 'result')
    const usage = events.findLast(event => event.type === 'usage')
    expect(result).toBeDefined(); expect(usage).toMatchObject({ accounting: { billing: 'subscription', kind: 'estimate' } })
    expect(events.filter(event => event.type === 'tool_start')).toEqual([])
    observations.push({ turnId, binding, result, usage, firstTextMs, durationMs: Math.round(performance.now() - started) })
    return { text: result?.type === 'result' ? result.text : '', sessionId: binding?.type === 'native_turn' ? binding.threadId : '' }
  }
  const first = await run('Remember anchor=ROBLE_682. Reply exactly ACK.')
  expect(first.text.trim()).toBe('ACK')
  const second = await run('What is anchor? Reply only the exact value.', first.sessionId)
  expect(second.text.trim()).toBe('ROBLE_682'); expect(second.sessionId).toBe(first.sessionId)
  expect(f.queryCalls).toBe(1)
  const report = { observedAt: new Date().toISOString(), selection, discoveryQueryCalls, sdkQueryCalls: f.queryCalls, observations, scope: 'Two real Max turns through frozen selection + runAgentStream + pool + SDK, native catalog preflight before each input. User defaults read and pinned; scratch cwd, user settings loaded, no tools/hooks/project settings, logging mocked; not production configuration or full executeChatJob/HTTP/UI canary.', pass: true }
  writeFileSync(new URL('../../../../docs/builds/arbrain-chat-2026-09-06/claude-frozen-runner-smoke.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
}, 120_000)
