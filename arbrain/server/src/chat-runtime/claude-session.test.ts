import { describe, it, expect, vi } from 'vitest'
import type { query, SDKMessage, SDKUserMessage, Query, AccountInfo } from '@anthropic-ai/claude-agent-sdk'
import { ClaudeInteractiveSession, ClaudeExecutionUncertain, ClaudeSubmissionCancelled, type ClaudeBackgroundEvent } from './claude-session.js'
import { dirClaudeAlterna } from '../cuentas-alternas.js'
const a = '44444444-4444-4444-8444-444444444444', b = '88888888-8888-4888-8888-888888888888'
const scope = { owner: 'owner', account: 'default', conversationId: 'chat' }
const account: AccountInfo = { apiProvider: 'firstParty', subscriptionType: 'Claude Max' }
function fake(info = account, ready?: Promise<AccountInfo>) {
  let wake: (() => void) | undefined, closed = false
  const pending: SDKMessage[] = [], sent: SDKUserMessage[] = []
  const close = vi.fn(() => { closed = true; wake?.() })
  const q = {
    accountInfo: async () => ready ?? info, close, interrupt: vi.fn().mockResolvedValue({ still_queued: [] }),
    async *[Symbol.asyncIterator]() {
      while (!closed) {
        if (pending.length) { yield pending.shift()!; continue }
        await new Promise<void>(resolve => { wake = resolve })
      }
    },
  } as unknown as Query
  const create = vi.fn(({ prompt }: Parameters<typeof query>[0]) => {
    void (async () => { try { for await (const msg of prompt as AsyncIterable<SDKUserMessage>) sent.push(msg) } catch { /* native process closes */ } })()
    return q
  })
  const emit = (event: unknown) => { pending.push(event as SDKMessage); wake?.() }
  return { create: create as typeof query, createMock: create, sent, emit, close }
}
const collect = async (source: AsyncIterable<SDKMessage>) => { const events: SDKMessage[] = []; for await (const message of source) events.push(message); return events }
describe('persistent Claude subscription session', () => {
  it('turns a reply the CLI starts on its own into an adopted spontaneous turn, with the notification that woke it', async () => {
    const f = fake(), background: ClaudeBackgroundEvent[] = []
    const session = new ClaudeInteractiveSession(scope, {}, event => background.push(event), f.create)
    const offers: Array<{ id: string; prelude: SDKMessage[]; events: AsyncIterable<SDKMessage> }> = []
    session.adopter = reply => { offers.push(reply); return true }
    f.emit({ type: 'system', subtype: 'task_notification', task_id: 't1', status: 'completed', summary: 'sleep 20' })
    f.emit({ type: 'system', subtype: 'init', session_id: 'native' })
    await vi.waitFor(() => expect(offers).toHaveLength(1))
    expect(offers[0].prelude).toHaveLength(1)
    expect(session.busy).toBe(true); expect(session.foregroundBusy).toBe(false); expect(session.backgroundReplyOpen).toBe(true)
    f.emit({ type: 'assistant', user_message_uuid: 'cli-own-uuid', message: { content: [{ type: 'text', text: 'ya terminó' }] } })
    f.emit({ type: 'result', user_message_uuid: 'cli-own-uuid', result: 'ya terminó' })
    const events = await collect(offers[0].events)
    expect(events.map(e => e.type)).toEqual(['system', 'assistant', 'result'])
    expect(session.busy).toBe(false); expect(session.backgroundReplyOpen).toBe(false)
    expect(background.some(e => e.type === 'message' && e.message.type === 'assistant')).toBe(false)
    session.close(); await session.drained
  })
  it('a message from Daniel waits for the spontaneous reply to finish instead of failing', async () => {
    const f = fake()
    const session = new ClaudeInteractiveSession(scope, {}, () => {}, f.create)
    const offers: Array<{ events: AsyncIterable<SDKMessage> }> = []
    session.adopter = reply => { offers.push(reply); return true }
    f.emit({ type: 'system', subtype: 'init', session_id: 'native' })
    await vi.waitFor(() => expect(offers).toHaveLength(1))
    const spontaneous = collect(offers[0].events)
    const turn = collect(session.turn(a, 'hola'))
    await new Promise(r => setTimeout(r, 50))
    expect(f.sent).toHaveLength(0)
    f.emit({ type: 'result', result: 'aviso atendido' })
    await spontaneous
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.emit({ type: 'assistant', user_message_uuid: a, message: { content: [] } })
    f.emit({ type: 'result', user_message_uuid: a, result: 'ok' })
    expect((await turn).at(-1)).toMatchObject({ type: 'result', result: 'ok' })
    session.close(); await session.drained
  })
  it('without an adopter keeps the old background sink', async () => {
    const f = fake(), background: ClaudeBackgroundEvent[] = []
    const session = new ClaudeInteractiveSession(scope, {}, event => background.push(event), f.create)
    f.emit({ type: 'system', subtype: 'init', session_id: 'native' })
    f.emit({ type: 'result', result: 'x' })
    await vi.waitFor(() => expect(background).toHaveLength(2))
    expect(session.busy).toBe(false)
    session.close(); await session.drained
  })
  it('supports a deliberately minimal environment without changing the default inheritance', async () => {
    vi.stubEnv('CONSEJO_PRIVATE_SENTINEL','not-for-the-deliberator')
    const f=fake(), session=new ClaudeInteractiveSession(scope,{env:{PATH:'/safe'}},undefined,f.create,false)
    expect(f.createMock.mock.calls[0][0].options?.env).not.toHaveProperty('CONSEJO_PRIVATE_SENTINEL')
    expect(f.createMock.mock.calls[0][0].options?.env?.PATH).toBe('/safe')
    const normal=fake(), existing=new ClaudeInteractiveSession(scope,{},undefined,normal.create)
    expect(normal.createMock.mock.calls[0][0].options?.env?.CONSEJO_PRIVATE_SENTINEL).toBe('not-for-the-deliberator')
    session.close();existing.close();await Promise.all([session.drained,existing.drained]);vi.unstubAllEnvs()
  })
  it('never submits a cancelled prompt when authentication finishes later', async () => {
    let resolve!: (info: AccountInfo) => void
    const f = fake(account, new Promise<AccountInfo>(r => { resolve = r }))
    const session = new ClaudeInteractiveSession(scope, {}, undefined, f.create), ac = new AbortController()
    const remove = vi.spyOn(ac.signal, 'removeEventListener')
    const pending = collect(session.turn(a, 'cancel during auth', ac.signal))
    const rejected = expect(pending).rejects.toBeInstanceOf(ClaudeSubmissionCancelled)
    ac.abort(); await rejected
    resolve(account); await new Promise(r => setTimeout(r, 0))
    expect(f.sent).toEqual([]); expect(session.busy).toBe(false)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    session.close(); await session.drained
  })
  it('routes a previous turn subagent to its spawning turn after the next reply starts', async () => {
    const f = fake(), background: ClaudeBackgroundEvent[] = []
    const session = new ClaudeInteractiveSession(scope, {}, event => background.push(event), f.create)
    const first = collect(session.turn(a, 'spawn'))
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.emit({ type: 'assistant', user_message_uuid: a, message: { content: [{ type: 'tool_use', id: 'spawn-A', name: 'Agent', input: {} }] } })
    f.emit({ type: 'result', user_message_uuid: a, result: 'started' }); await first
    const second = collect(session.turn(b, 'new work'))
    await vi.waitFor(() => expect(f.sent).toHaveLength(2))
    f.emit({ type: 'assistant', user_message_uuid: b, message: { content: [] } })
    f.emit({ type: 'assistant', parent_tool_use_id: 'spawn-A', user_message_uuid: a, message: { content: [{ type: 'text', text: 'old agent' }] } })
    f.emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'current reply' }] } })
    f.emit({ type: 'result', user_message_uuid: b, result: 'done' })
    const events = await second
    expect(events).toHaveLength(3)
    expect(events[1]).toMatchObject({ message: { content: [{ text: 'current reply' }] } })
    expect(background).toContainEqual(expect.objectContaining({ turnId: a, message: expect.objectContaining({ parent_tool_use_id: 'spawn-A' }) }))
    session.close(); await session.drained
  })
  it('does not let an unkeyed scheduled result complete a foreground submission', async () => {
    const f = fake(), session = new ClaudeInteractiveSession(scope, {}, undefined, f.create)
    const first = collect(session.turn(a, 'work'))
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.emit({ type: 'result', result: 'unrelated scheduled result' })
    await new Promise(resolve => setTimeout(resolve, 0))
    await expect(collect(session.turn(b, 'overlap'))).rejects.toThrow('en curso')
    f.emit({ type: 'result', user_message_uuid: a, result: 'actual result' })
    expect((await first).at(-1)).toMatchObject({ result: 'actual result' })
    session.close(); await session.drained
  })
  it('drains unread events even if the result arrived before observer detachment', async () => {
    const f = fake(), background: ClaudeBackgroundEvent[] = []
    const session = new ClaudeInteractiveSession(scope, {}, event => background.push(event), f.create)
    const observer = session.turn(a, 'work'), first = observer.next()
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.emit({ type: 'assistant', user_message_uuid: a, message: { content: [] } })
    await first
    f.emit({ type: 'assistant', message: { content: ['buffered'] } })
    f.emit({ type: 'result', user_message_uuid: a, result: 'done' })
    await new Promise(resolve => setTimeout(resolve, 0))
    await observer.return(undefined)
    expect(background).toHaveLength(2)
    expect(background.at(-1)).toMatchObject({ type: 'message', turnId: a, message: { result: 'done' } })
    session.close(); await session.drained
  })
  it('detaches a stalled next immediately and exposes a later transport failure with turn identity', async () => {
    const f = fake(), background: ClaudeBackgroundEvent[] = []
    const session = new ClaudeInteractiveSession(scope, {}, event => background.push(event), f.create)
    const observer = session.turn(a, 'work'), pending = observer.next()
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    session.detach(a)
    expect(await pending).toEqual({ value: undefined, done: true })
    expect(f.close).not.toHaveBeenCalled()
    f.close(); await session.drained
    expect(background).toContainEqual({ type: 'uncertain', turnId: a, error: 'Claude process ended' })
  })
  it('reuses one process and excludes a different turn receipt from the foreground result', async () => {
    const f = fake(), idle: ClaudeBackgroundEvent[] = []
    const session = new ClaudeInteractiveSession(scope, {}, message => idle.push(message), f.create)
    const first = collect(session.turn(a, 'anchor'))
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.emit({ type: 'system', subtype: 'init', session_id: 'native', model: 'opus' })
    f.emit({ type: 'result', user_message_uuid: a, result: 'ACK' })
    expect((await first).at(-1)).toMatchObject({ result: 'ACK' })
    const second = collect(session.turn(b, 'recall'))
    await vi.waitFor(() => expect(f.sent).toHaveLength(2))
    f.emit({ type: 'result', user_message_uuid: a, result: 'late result A' })
    f.emit({ type: 'result', user_message_uuid: b, result: 'anchor' })
    const received = await second
    expect(received).toHaveLength(2) // cached init and matching result only
    expect(received.at(-1)).toMatchObject({ result: 'anchor' })
    expect(idle).toContainEqual(expect.objectContaining({ message: expect.objectContaining({ result: 'late result A' }) }))
    expect(f.sent.map(message => message.uuid)).toEqual([a, b]); expect(f.createMock).toHaveBeenCalledTimes(1)
    session.close(); await session.drained
  })
  it('rejects API/unauthenticated backends before input and fixes account-specific environment', async () => {
    for (const info of [{ apiProvider: 'firstParty' as const, tokenSource: 'none' }, { ...account, apiKeySource: 'ANTHROPIC_API_KEY' }, { ...account, apiProvider: 'bedrock' as const }]) {
      const f = fake(info), session = new ClaudeInteractiveSession(scope, { env: { ANTHROPIC_API_KEY: 'synthetic', ANTHROPIC_AUTH_TOKEN: 'synthetic', CLAUDE_CONFIG_DIR: '/wrong' } }, undefined, f.create)
      await expect(collect(session.turn(a, 'must not run'))).rejects.toThrow('suscripción')
      expect(f.sent).toEqual([])
      const env = f.createMock.mock.calls[0][0].options!.env!
      expect(env).not.toHaveProperty('ANTHROPIC_API_KEY'); expect(env).not.toHaveProperty('ANTHROPIC_AUTH_TOKEN'); expect(env).not.toHaveProperty('CLAUDE_CONFIG_DIR')
      session.close(); await session.drained
    }
    const f = fake(), bro = new ClaudeInteractiveSession({ ...scope, account: 'bro' }, { env: { CLAUDE_CONFIG_DIR: '/wrong' } }, undefined, f.create)
    expect(f.createMock.mock.calls[0][0].options!.env!.CLAUDE_CONFIG_DIR).toBe(dirClaudeAlterna())
    bro.close(); await bro.drained
  })
  it('edición cliente: conserva la llave del alumno (API u OpenRouter) y no exige suscripción', async () => {
    vi.stubEnv('ARBRAIN_EDICION', 'cliente')
    try {
      const f = fake({ apiProvider: 'firstParty', tokenSource: 'ANTHROPIC_AUTH_TOKEN' } as AccountInfo)
      const session = new ClaudeInteractiveSession(scope, { env: { ANTHROPIC_AUTH_TOKEN: 'synthetic', ANTHROPIC_BASE_URL: 'https://openrouter.ai/api', ANTHROPIC_API_KEY: '' } }, undefined, f.create)
      const env = f.createMock.mock.calls[0][0].options!.env!
      expect(env).toMatchObject({ ANTHROPIC_AUTH_TOKEN: 'synthetic', ANTHROPIC_BASE_URL: 'https://openrouter.ai/api' })
      const turno = collect(session.turn(a, 'hola'))
      await vi.waitFor(() => expect(f.sent).toHaveLength(1))
      f.emit({ type: 'result', user_message_uuid: a, result: 'ok' } as unknown as SDKMessage)
      expect((await turno).at(-1)).toMatchObject({ result: 'ok' })
      session.close(); await session.drained
    } finally { vi.unstubAllEnvs() }
  })
  it('does not retry or allow overlapping work after losing a submitted turn', async () => {
    const f = fake(), session = new ClaudeInteractiveSession(scope, {}, undefined, f.create)
    const first = collect(session.turn(a, 'work'))
    const failure = expect(first).rejects.toBeInstanceOf(ClaudeExecutionUncertain)
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    await expect(collect(session.turn(b, 'overlap'))).rejects.toThrow('en curso')
    f.close()
    await failure; await session.drained
    expect(f.sent).toHaveLength(1)
  })
  it('keeps detached execution alive and admits the next turn only after its native result', async () => {
    const f = fake(), background: ClaudeBackgroundEvent[] = []
    const session = new ClaudeInteractiveSession(scope, {}, event => background.push(event), f.create)
    const observer = session.turn(a, 'work'), next = observer.next()
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.emit({ type: 'assistant', user_message_uuid: a, message: { content: [] } })
    await next; await observer.return(undefined)
    expect(f.close).not.toHaveBeenCalled()
    await expect(collect(session.turn(b, 'too early'))).rejects.toThrow('en curso')
    f.emit({ type: 'result', user_message_uuid: a, result: 'done' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(background).toContainEqual({ type: 'message', message: expect.objectContaining({ result: 'done' }), turnId: a })
    const second = collect(session.turn(b, 'now'))
    await vi.waitFor(() => expect(f.sent).toHaveLength(2))
    f.emit({ type: 'result', user_message_uuid: b, result: 'done' })
    await second
    session.close(); await session.drained
  })
  it('a closed process has no background work, and a background reply keeps the session busy until its result (2 oct)', async () => {
    const f = fake(), session = new ClaudeInteractiveSession(scope, {}, () => {}, f.create)
    f.emit({ type: 'system', subtype: 'task_started', task_id: 'agent-1' })
    await vi.waitFor(() => expect(session.hasBackgroundWork).toBe(true))
    f.emit({ type: 'system', subtype: 'task_notification', task_id: 'agent-1', status: 'completed' })
    await vi.waitFor(() => expect(session.hasBackgroundWork).toBe(false))
    expect(session.backgroundReplyOpen).toBe(true)
    f.emit({ type: 'system', subtype: 'init', session_id: 'native' })
    f.emit({ type: 'result', result: 'informe' })
    await vi.waitFor(() => expect(session.backgroundReplyOpen).toBe(false))
    // Prod 2 oct 07:32: the CLI died with two subagents mid-work; their ids never got a notification.
    f.emit({ type: 'system', subtype: 'task_started', task_id: 'agent-2' })
    await vi.waitFor(() => expect(session.hasBackgroundWork).toBe(true))
    session.close(); await session.drained
    expect(session.closed).toBe(true)
    expect(session.hasBackgroundWork).toBe(false)
  })
  it('a stuck task id cannot hold a live session: the SDK task list wins, and silence expires it (2 oct)', async () => {
    const f = fake(), session = new ClaudeInteractiveSession(scope, {}, () => {}, f.create)
    f.emit({ type: 'system', subtype: 'task_started', task_id: 'perdida' })
    f.emit({ type: 'system', subtype: 'task_started', task_id: 'viva' })
    await vi.waitFor(() => expect(session.hasBackgroundWork).toBe(true))
    f.emit({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'viva', task_type: 'local_agent' }] })
    f.emit({ type: 'system', subtype: 'task_notification', task_id: 'viva', status: 'completed' })
    f.emit({ type: 'result', result: 'informe' })
    await vi.waitFor(() => expect(session.hasBackgroundWork).toBe(false))
    f.emit({ type: 'system', subtype: 'task_started', task_id: 'muda' })
    await vi.waitFor(() => expect(session.hasBackgroundWork).toBe(true))
    vi.useFakeTimers({ now: Date.now() + 31 * 60_000 })
    try { expect(session.hasBackgroundWork).toBe(false); expect(session.backgroundReplyOpen).toBe(false) }
    finally { vi.useRealTimers() }
    session.close(); await session.drained
  })
})
