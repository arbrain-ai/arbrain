import { describe, expect, it, vi } from 'vitest'
import { ClaudeInventoryDiscovery, readClaudeInventory, readCodexInventory, renderRuntimeInventory, type RuntimeInventory } from './runtime-inventory.js'
import type { Connection } from './codex-pool.js'
describe('runtime inventories report provider evidence rather than static configuration', () => {
  it('bounds and coalesces discovery by account/workspace, releases the slot, and separates failures by kind', async () => {
    const skills: RuntimeInventory = { account: 'default', kind: 'skills', source: 'account-discovery', observedAt: 'synthetic', entries: [], loadErrors: 0 }
    let release!: (value: { skills: RuntimeInventory; mcp: Error }) => void
    const load = vi.fn(() => new Promise<{ skills: RuntimeInventory; mcp: Error }>(resolve => { release = resolve }))
    const manager = new ClaudeInventoryDiscovery(load, 1)
    const one = manager.read('/work', 'default', 'skills')
    const duplicate = manager.read('/work', 'default', 'skills')
    const mcp = expect(manager.read('/work', 'default', 'mcp')).rejects.toThrow('mcp unavailable')
    await expect(manager.read('/work', 'bro', 'skills')).rejects.toThrow('ocupado')
    await Promise.resolve(); expect(load).toHaveBeenCalledOnce()
    release({ skills, mcp: new Error('mcp unavailable') })
    expect(await one).toBe(await duplicate); await mcp
    const next = manager.read('/work', 'bro', 'skills')
    await Promise.resolve(); expect(load).toHaveBeenCalledTimes(2)
    release({ skills: { ...skills, account: 'bro' }, mcp: new Error('unavailable') })
    expect((await next).account).toBe('bro')
  })
  it('recovers an evicted active reader through labeled discovery but does not hide errors from a still-live reader', async () => {
    const reader = { accountInfo: vi.fn().mockRejectedValue(new Error('closed during read')), supportedCommands: vi.fn(), mcpServerStatus: vi.fn() }
    const discovery = { read: vi.fn().mockResolvedValue({ account: 'bro', kind: 'skills', source: 'account-discovery', entries: [], loadErrors: 0 }) }
    expect(await readClaudeInventory('/work', 'bro', 'skills', reader, () => true, discovery)).toMatchObject({ source: 'account-discovery' })
    expect(discovery.read).toHaveBeenCalledWith('/work', 'bro', 'skills')
    await expect(readClaudeInventory('/work', 'bro', 'skills', reader, () => false, discovery)).rejects.toThrow('closed during read')
    expect(discovery.read).toHaveBeenCalledOnce()
  })
  it('preserves duplicate skill provenance, disabled entries and load failures without assuming a chosen winner', async () => {
    const request = vi.fn().mockResolvedValue({ data: [{ cwd: '/work', skills: [{ name: 'same', path: '/user/same/SKILL.md', scope: 'user', enabled: true, description: 'first' }, { name: 'same', path: '/work/same/SKILL.md', scope: 'repo', enabled: false, description: 'second' }], errors: [{}] }] })
    const result = await readCodexInventory({ request } as Pick<Connection, 'request'>, '/work', 'codex', 'skills', 'thread')
    expect(request).toHaveBeenCalledWith('skills/list', { cwds: ['/work'], forceReload: true }, expect.any(Number))
    expect(result).toMatchObject({ source: 'account-discovery', loadErrors: 1, entries: [{ name: 'same', enabled: true }, { name: 'same', enabled: false }] })
    expect(renderRuntimeInventory(result)).toContain('deshabilitada')
    request.mockResolvedValue({ data: [{ cwd: '/different', skills: [], errors: [] }] })
    await expect(readCodexInventory({ request } as Pick<Connection, 'request'>, '/work', 'codex', 'skills')).rejects.toThrow('workspace')
  })
  it('paginates MCP with the exact thread, keeps unknown runtime state distinct from auth, and discards secret config', async () => {
    const request = vi.fn().mockResolvedValueOnce({ data: [{ name: 'mcp', runtimeStatus: null, authStatus: 'oAuth', tools: {}, config: { token: 'DO_NOT_LEAK' } }], nextCursor: 'next' }).mockResolvedValueOnce({ data: [{ name: 'live', runtimeStatus: 'connected', authStatus: 'unsupported', tools: { read: {} } }], nextCursor: null })
    const result = await readCodexInventory({ request } as Pick<Connection, 'request'>, '/work', 'yt', 'mcp', 'owned-thread')
    expect(request.mock.calls[1][1]).toMatchObject({ cursor: 'next', threadId: 'owned-thread' })
    const text = renderRuntimeInventory(result)
    expect(text).toContain('estado: desconocido'); expect(text).toContain('connected'); expect(text).not.toContain('DO_NOT_LEAK')
    request.mockResolvedValue({ data: [], nextCursor: 'repeated' })
    await expect(readCodexInventory({ request } as Pick<Connection, 'request'>, '/work', 'yt', 'mcp')).rejects.toThrow('pagination')
  })
  it('reads an active Claude process without closing it, and rejects non-subscription authentication before inventory', async () => {
    const reader = {
      accountInfo: vi.fn().mockResolvedValue({ apiProvider: 'firstParty', subscriptionType: 'max', tokenSource: 'oauth', apiKeySource: 'none' }),
      supportedCommands: vi.fn().mockResolvedValue([{ name: 'actual', description: 'available command' }]),
      mcpServerStatus: vi.fn().mockResolvedValue([{ name: 'configured', status: 'needs-auth', config: { url: 'SECRET' }, tools: [] }]),
    }
    const skills = await readClaudeInventory('/work', 'bro', 'skills', reader)
    expect(skills).toMatchObject({ source: 'conversation', entries: [{ name: 'actual' }] })
    const mcp = await readClaudeInventory('/work', 'bro', 'mcp', reader)
    expect(mcp.entries[0]).toMatchObject({ status: 'needs-auth' }); expect(JSON.stringify(mcp)).not.toContain('SECRET')
    reader.accountInfo.mockResolvedValue({ apiProvider: 'firstParty', subscriptionType: null, apiKeySource: 'user' })
    await expect(readClaudeInventory('/work', 'bro', 'skills', reader)).rejects.toThrow('suscripción')
    expect(reader.supportedCommands).toHaveBeenCalledOnce()
  })
})
