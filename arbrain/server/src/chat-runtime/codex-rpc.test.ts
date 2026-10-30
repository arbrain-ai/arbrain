import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { CodexRpcClient, RpcConnectionError, RpcError, type RpcNotification } from './codex-rpc.js'

const clients: CodexRpcClient[] = []
function fixture(options: ConstructorParameters<typeof CodexRpcClient>[1] = {}) {
  const input = new PassThrough(), output = new PassThrough()
  const sent: Array<Record<string, any>> = []
  let onClose: (error: Error) => void = () => {}
  let closes = 0
  input.on('data', chunk => {
    for (const line of chunk.toString().trim().split('\n')) {
      const message = JSON.parse(line); sent.push(message)
      if (message.method === 'initialize') output.write(JSON.stringify({ id: message.id, result: { userAgent: 'fixture' } }) + '\n')
    }
  })
  const client = new CodexRpcClient({ input, output, onClose: listener => { onClose = listener; return () => {} }, close: () => { closes++ } }, options)
  clients.push(client)
  return { client, output, sent, exit: () => onClose(new RpcConnectionError('exited')), reply: (id: unknown, result: unknown) => output.write(JSON.stringify({ id, result }) + '\n'), closes: () => closes }
}
afterEach(() => { for (const client of clients.splice(0)) client.close() })

describe('Codex App Server stdio contract', () => {
  it('initializes once before concurrent calls and correlates out-of-order replies', async () => {
    const f = fixture()
    const first = f.client.request('model/list'), second = f.client.request('account/read')
    await f.client.initialize(); await Promise.resolve()
    expect(f.sent.map(x => x.method)).toEqual(['initialize', 'initialized', 'model/list', 'account/read'])
    f.reply(f.sent[3].id, { plan: 'pro' }); f.reply(f.sent[2].id, { models: ['astra'] })
    expect(await first).toEqual({ models: ['astra'] }); expect(await second).toEqual({ plan: 'pro' })
  })

  it('delivers a text delta immediately across UTF-8 chunks without waiting for turn completion', () => {
    const f = fixture(), events: RpcNotification[] = []
    f.client.onNotification(e => events.push(e))
    const bytes = Buffer.from(JSON.stringify({ method: 'item/agentMessage/delta', params: { threadId: 'a', delta: '¡Aquí! 🧠' } }) + '\n')
    const split = bytes.indexOf(Buffer.from('🧠')) + 2
    f.output.write(bytes.subarray(0, split)); expect(events).toEqual([])
    f.output.write(bytes.subarray(split))
    expect(events[0].params.delta).toBe('¡Aquí! 🧠')
  })

  it('preserves native thread identity and removes subscriptions', () => {
    const f = fixture(), ids: unknown[] = []
    const off = f.client.onNotification(e => ids.push(e.params.threadId))
    f.output.write('{"method":"turn/started","params":{"threadId":"a"}}\n{"method":"turn/started","params":{"threadId":"b"}}\n')
    off(); f.output.write('{"method":"turn/started","params":{"threadId":"c"}}\n')
    expect(ids).toEqual(['a', 'b'])
  })

  it('never automatically approves requests and rejects unsupported methods', () => {
    const f = fixture()
    f.output.write('{"id":"permission-1","method":"item/permissions/requestApproval","params":{}}\n')
    expect(f.sent.at(-1)?.error.code).toBe(-32601)
    expect(f.client.respond('permission-1', { decision: 'accept' })).toBe(false)
  })

  it('answers a pending server request once and rejects foreign ids', () => {
    const f = fixture(), ids: unknown[] = []
    f.client.onServerRequest(e => ids.push(e.id))
    f.output.write('{"id":4,"method":"item/tool/requestUserInput","params":{"threadId":"a"}}\n')
    expect(ids).toEqual([4]); expect(f.client.respond(5, {})).toBe(false)
    expect(f.client.respond(4, { answers: {} })).toBe(true)
    expect(f.client.respond(4, { answers: {} })).toBe(false)
  })

  it('preserves upstream errors instead of inventing a successful result', async () => {
    const f = fixture(); await f.client.initialize()
    const result = f.client.request('turn/start'); await Promise.resolve()
    f.output.write(JSON.stringify({ id: f.sent.at(-1)?.id, error: { code: -32001, message: 'overloaded' } }) + '\n')
    await expect(result).rejects.toMatchObject({ code: -32001, message: 'overloaded' })
  })

  it('keeps pending approval available after rejecting an oversized unsent response', () => {
    const f = fixture({ maxFrameBytes: 256 })
    f.client.onServerRequest(() => {})
    f.output.write('{"id":4,"method":"item/tool/requestUserInput","params":{}}\n')
    expect(() => f.client.respond(4, { text: 'x'.repeat(300) })).toThrow('capacity')
    expect(() => f.client.reject(4, 'x'.repeat(300))).toThrow('capacity')
    expect(f.client.respond(4, {})).toBe(true)
    expect(f.sent).toEqual([{ id: 4, result: {} }])
  })

  it('does not replay mutations after a timeout and still accepts later notifications', async () => {
    const f = fixture({ timeoutMs: 15 }); await f.client.initialize()
    const result = f.client.request('turn/start')
    await expect(result).rejects.toThrow('outcome may be unknown')
    const events: string[] = []; f.client.onNotification(e => events.push(e.method))
    f.reply(f.sent.at(-1)?.id, { turn: 'already-started' })
    f.output.write('{"method":"turn/started","params":{"threadId":"a"}}\n')
    expect(f.sent.filter(x => x.method === 'turn/start')).toHaveLength(1)
    expect(events).toEqual(['turn/started']); expect(f.client.closed).toBe(false)
  })

  it('rejects in-flight requests and reports one disconnect when the process dies', async () => {
    const f = fixture(); await f.client.initialize()
    let disconnected = 0; f.client.onDisconnect(() => { disconnected++ })
    const result = f.client.request('thread/read'); await Promise.resolve()
    f.exit(); f.exit()
    await expect(result).rejects.toThrow('exited')
    await expect(f.client.request('thread/read')).rejects.toThrow('exited')
    expect(disconnected).toBe(1); expect(f.closes()).toBe(1)
  })

  it('bounds pending requests and rejects overload without sending another mutation', async () => {
    const f = fixture({ maxPending: 1 }); await f.client.initialize()
    const first = f.client.request('turn/start'); await Promise.resolve()
    await expect(f.client.request('turn/start')).rejects.toBeInstanceOf(RpcError)
    f.reply(f.sent.at(-1)?.id, 'ok'); expect(await first).toBe('ok')
    expect(f.sent.filter(x => x.method === 'turn/start')).toHaveLength(1)
  })

  it('bounds malformed output and terminates rather than ignoring protocol corruption', () => {
    const f = fixture({ maxFrameBytes: 64 })
    f.output.write('x'.repeat(65))
    expect(f.client.closed).toBe(true); expect(f.closes()).toBe(1)
    const other = fixture(); other.output.write('not json\n')
    expect(other.client.closed).toBe(true)
  })
})
