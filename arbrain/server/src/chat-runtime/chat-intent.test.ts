import { describe, it, expect, vi } from 'vitest'
import Database from 'better-sqlite3'
import { captureChatIntent, intentOverrides, parseChatIntent, resolveChatIntent, type ChatIntent } from './chat-intent.js'
import { ChatJournal } from './journal.js'
import { acceptResolvedChat } from './chat-envelope.js'
import type { ChatJobInput } from './chat-job.js'
const scope = { owner: 'owner', account: 'codex', conversationId: 'chat' }
const intent: ChatIntent = { ...scope, version: 1, model: 'gpt-6-astra', effort: 'ultra', fast: true, ultracode: false, observedAt: '2026-09-07T02:00:00Z' }
const selected = { model: intent.model, effort: intent.effort, serviceTier: 'priority' }

describe('offline selection capture and acceptance', () => {
  it('captures effective defaults and detects an async controls change before returning them', async () => {
    const controls = { model: null, effort: null, fast: false, ultracode: false }
    expect(await captureChatIntent(scope, () => controls, async () => ({ ...selected, serviceTier: 'default' }))).toMatchObject({ ...scope, model: 'gpt-6-astra', effort: 'ultra', fast: false })
    await expect(captureChatIntent(scope, () => controls, async () => { controls.fast = true; return selected })).rejects.toThrow('ajustes cambiaron')
  })
  it('rejects malformed or cross-owner/account/conversation snapshots', () => {
    for (const patch of [{ version: 2 }, { owner: 'other' }, { account: 'yt' }, { conversationId: 'other' }, { effort: undefined }, { fast: undefined }, { observedAt: 'invalid' }, { model: '' }]) {
      expect(() => parseChatIntent({ ...intent, ...patch }, scope)).toThrow()
    }
    expect(parseChatIntent(intent, scope)).toEqual(intent)
  })
  it('resolves the captured controls, rejects alias/default drift and per-message disagreement', async () => {
    const resolve = vi.fn().mockResolvedValue(selected)
    expect(await resolveChatIntent(intent, 'ultra', resolve)).toEqual(selected)
    expect(resolve).toHaveBeenCalledWith({ model: 'gpt-6-astra', effort: 'ultra', fast: true, ultracode: false })
    await expect(resolveChatIntent(intent, 'high', resolve)).rejects.toThrow('no coincide')
    for (const patch of [{ model: 'replacement' }, { effort: 'high' }, { serviceTier: 'default' }]) {
      await expect(resolveChatIntent(intent, undefined, async () => ({ ...selected, ...patch }))).rejects.toThrow('No se cambiará')
    }
    const noEffort = { ...intent, effort: null }
    await expect(resolveChatIntent(noEffort, undefined, async () => selected)).rejects.toThrow('No se cambiará')
  })
  it('preserves Claude qualifiers and explicit false flags through validation', async () => {
    const claude = { ...intent, account: 'bro', model: 'claude-opus-test[1m]', effort: 'xhigh', fast: false, ultracode: true }
    const resolved = { account: 'bro', requestedModel: claude.model, model: claude.model, effort: 'xhigh' as const, fast: false, ultracode: true, adaptiveThinking: true, observedAt: 'now', source: 'conversation' }
    expect(await resolveChatIntent(claude, undefined, async () => resolved)).toEqual(resolved)
    await expect(resolveChatIntent(claude, undefined, async () => ({ ...resolved, model: 'claude-opus-test' }))).rejects.toThrow('No se cambiará')
  })
  it('persists original intent across lost ACK without rereading defaults, while rejecting altered snapshots', async () => {
    const db = new Database(':memory:')
    try {
      const journal = new ChatJournal(db), id = { ...scope, turnId: 'turn' }
      const input: ChatJobInput = { message: 'offline', source: 'mobile', intent, overrides: intentOverrides(intent) as ChatJobInput['overrides'] }
      const previous = () => journal.get(id)?.input as ChatJobInput | undefined
      const accept = (value: ChatJobInput) => journal.accept(id, value)
      await acceptResolvedChat(input, previous, () => resolveChatIntent(intent, undefined, async () => selected), accept)
      const mustNotResolve = vi.fn().mockRejectedValue(new Error('runtime unavailable'))
      expect(await acceptResolvedChat(input, previous, mustNotResolve, accept)).toMatchObject({ created: false, turn: { input: { intent, codexSelection: selected } } })
      expect(mustNotResolve).not.toHaveBeenCalled()
      await expect(acceptResolvedChat({ ...input, intent: { ...intent, fast: false } }, previous, mustNotResolve, accept)).rejects.toThrow()
    } finally { db.close() }
  })
})
