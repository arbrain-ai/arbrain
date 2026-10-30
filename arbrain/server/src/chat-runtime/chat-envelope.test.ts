import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { ChatJournal } from './journal.js'
import { acceptResolvedChat, durableSubmissionError } from './chat-envelope.js'
import type { ChatJobInput } from './chat-job.js'

describe('concurrent acceptance with resolved configuration', () => {
  it('rejects unstable durable IDs and intent-bearing legacy fallthrough before dispatch', () => {
    const base = { ownerId: 'owner', chatSessionId: 'chat', turnId: 'turn', message: 'hello' }
    for (const mode of [{ acceptOnly: true }, { intent: {} }]) {
      for (const patch of [{ turnId: '' }, { turnId: ' ' }, { turnId: undefined }, { chatSessionId: null }, { chatSessionId: ' ' }, { ownerId: '' }, { message: '/model replacement' }]) {
        expect(durableSubmissionError({ ...base, ...mode, ...patch })).toContain('stable turn ID')
      }
      expect(durableSubmissionError({ ...base, ...mode })).toBeNull()
    }
    expect(durableSubmissionError({ message: 'legacy request' })).toBeNull()
  })
  it('preserves the first Claude selection across racing ACK retries and rejects changed intent', async () => {
    const db = new Database(':memory:')
    try {
      const journal = new ChatJournal(db), id = { owner: 'owner', account: 'bro', conversationId: 'chat', turnId: 'turn' }
      const input: ChatJobInput = { message: 'same', source: 'mobile', overrides: { model: null, effort: null, fast: false, ultracode: false } }
      const winner = { account: 'bro', requestedModel: 'fable', model: 'claude-fable-5-1', effort: 'xhigh' as const, fast: false, ultracode: false, adaptiveThinking: true, observedAt: 'first', source: 'user' }
      let release!: (value: ChatJobInput['claudeSelection']) => void
      const pending = new Promise<ChatJobInput['claudeSelection']>(resolve => { release = resolve })
      const previous = () => journal.get(id)?.input as ChatJobInput | undefined
      const accept = (value: ChatJobInput) => journal.accept(id, value)
      const slow = acceptResolvedChat(input, previous, () => pending, accept, 'claudeSelection')
      await acceptResolvedChat(input, previous, async () => winner, accept, 'claudeSelection')
      release({ ...winner, model: 'claude-opus-5', observedAt: 'later' })
      expect(await slow).toMatchObject({ created: false, turn: { input: { claudeSelection: winner } } })
      await expect(acceptResolvedChat({ ...input, message: 'changed' }, previous, async () => winner, accept, 'claudeSelection')).rejects.toThrow()
    } finally { db.close() }
  })
  it.each(['different-default', 'resolution-failed'] as const)('keeps the winner selection after %s without masking changed user intent', async mode => {
    const db = new Database(':memory:')
    try {
      const journal = new ChatJournal(db), id = { owner: 'owner', account: 'codex', conversationId: 'chat', turnId: 'turn' }
      const input: ChatJobInput = { message: 'same', source: 'mobile', context: 'hint before', overrides: { model: null, effort: null, fast: false, ultracode: false } }
      let release!: (value: ChatJobInput['codexSelection']) => void, reject!: (error: Error) => void
      const pending = new Promise<ChatJobInput['codexSelection']>((yes, no) => { release = yes; reject = no })
      const previous = () => journal.get(id)?.input as ChatJobInput | undefined
      const accept = (value: ChatJobInput) => journal.accept(id, value)
      const slow = acceptResolvedChat(input, previous, () => pending, accept)
      const winner = { model: 'gpt-6-astra', effort: 'ultra', serviceTier: 'default' }
      await acceptResolvedChat({ ...input, context: 'hint later' }, previous, async () => winner, accept)
      if (mode === 'resolution-failed') reject(new Error('catalog unavailable'))
      else release({ model: 'gpt-5.5', effort: 'high', serviceTier: 'priority' })
      expect(await slow).toMatchObject({ created: false, turn: { input: { codexSelection: winner, context: 'hint later' } } })
      await expect(acceptResolvedChat({ ...input, message: 'changed intent' }, previous, async () => { throw new Error('must not resolve') }, accept)).rejects.toThrow()
    } finally { db.close() }
  })
})
