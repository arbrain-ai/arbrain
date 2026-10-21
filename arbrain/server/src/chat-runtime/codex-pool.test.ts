import { describe, expect, it } from 'vitest'
import { CodexRuntimePool } from './codex-pool.js'

function fixture(auth = 'chatgpt') {
  const spawned: string[] = [], calls: Array<{ account: string; method: string; params: any }> = [], disconnect = new Map<string, () => void>()
  const pool = new CodexRuntimePool({ cwd: '/test-project', bin: '/codex', accounts: { codex: { home: '/test/owner' }, yt: { home: '/test/other' } }, factory: ({ account, home }) => {
    spawned.push(home)
    let closed = false
    return {
      get closed() { return closed },
      onNotification() { return () => {} },
      onServerRequest() { return () => {} },
      respond() { return false },
      reject() { return false },
      onDisconnect(listener) { disconnect.set(account, () => { closed = true; listener(new Error('exit')) }); return () => {} },
      close() { disconnect.get(account)?.() },
      async request<T>(method: string, params: any = {}): Promise<T> {
        calls.push({ account, method, params })
        if (method === 'account/read') return { account: { type: auth } } as T
        return { data: [{ model: `${account}-model`, displayName: account, defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'ultra' }], serviceTiers: [{ id: 'priority', name: 'Fast' }], inputModalities: ['text', 'image'] }] } as T
      },
    }
  } })
  return { pool, spawned, calls, disconnect }
}

describe('account-isolated runtime discovery', () => {
  it('resolves an announced default once and preserves explicit ultra and service tier', async () => {
    const f = fixture()
    expect(await f.pool.resolveSelection('codex', { model: 'codex-model' })).toEqual({ model: 'codex-model', effort: 'medium', serviceTier: 'default' })
    expect(await f.pool.resolveSelection('yt', { model: 'yt-model', effort: 'ultra', serviceTier: 'priority' })).toEqual({ model: 'yt-model', effort: 'ultra', serviceTier: 'priority' })
    await expect(f.pool.resolveSelection('codex', { model: 'codex-model', effort: 'max' })).rejects.toThrow('reasoning effort')
    f.pool.close()
  })
  it('reuses simultaneous connections within an account and separates homes across accounts', async () => {
    const f = fixture()
    const [a, b, other] = await Promise.all([f.pool.connection('codex'), f.pool.connection('codex'), f.pool.connection('yt')])
    expect(a).toBe(b); expect(other).not.toBe(a)
    expect(f.spawned).toEqual(['/test/owner', '/test/other'])
    expect(f.calls.filter(c => c.method === 'account/read')).toHaveLength(2)
    f.pool.close()
  })

  it('does not fall back for unknown accounts or silently permit API billing', async () => {
    const f = fixture('apiKey')
    await expect(f.pool.connection('unknown')).rejects.toThrow('Unknown Codex account')
    await expect(f.pool.connection('__proto__')).rejects.toThrow('Unknown Codex account')
    expect(f.spawned).toHaveLength(0)
    await expect(f.pool.connection('codex')).rejects.toThrow('subscription login')
    expect(f.calls.some(c => c.method === 'turn/start')).toBe(false)
  })

  it('discovers account-specific models and leaves unavailable context unknown', async () => {
    const f = fixture()
    expect((await f.pool.models('codex'))[0]).toMatchObject({ value: 'codex-model', supportedEfforts: ['medium', 'ultra'], contextWindow: null, maxContextWindow: null, contextSource: 'unavailable' })
    expect((await f.pool.models('yt'))[0].value).toBe('yt-model')
    f.pool.close()
  })

  it('rejects unsupported selections and preserves advertised ultra and Fast', async () => {
    const f = fixture()
    await expect(f.pool.validateSelection('codex', { model: 'codex-model', effort: 'ultra', serviceTier: 'priority' })).resolves.toMatchObject({ value: 'codex-model' })
    await expect(f.pool.validateSelection('codex', { model: 'yt-model' })).rejects.toThrow('not available')
    await expect(f.pool.validateSelection('codex', { model: 'codex-model', effort: 'max' })).rejects.toThrow('reasoning effort')
    await expect(f.pool.validateSelection('codex', { model: 'codex-model', serviceTier: 'invented' })).rejects.toThrow('service tier')
    f.pool.close()
  })

  it('recreates only a verified closed connection and does not replay prior requests', async () => {
    const f = fixture()
    await f.pool.models('codex'); f.disconnect.get('codex')!()
    await f.pool.connection('codex')
    expect(f.spawned).toHaveLength(2)
    expect(f.calls.filter(c => c.method === 'model/list')).toHaveLength(1)
    f.pool.close()
  })
})
