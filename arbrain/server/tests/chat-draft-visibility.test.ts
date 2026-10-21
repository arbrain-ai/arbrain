import { describe, expect, it } from 'vitest'
import { shouldShowDraftRecovery, CHAT_RECEIPT_GRACE_MS } from '../../src/features/chat/lib/draft-visibility'

const now = Date.parse('2026-09-08T21:00:00Z')
const draft = { status: 'pending', createdAt: new Date(now).toISOString(), turnId: 'sending', confirmed: true }

describe('chat recovery visibility', () => {
  it('keeps a normal send quiet through a slow receipt and cold selection lookup', () => {
    expect(shouldShowDraftRecovery(draft, 'sending', true, now + 60_000)).toBe(false)
    expect(shouldShowDraftRecovery({ ...draft, confirmed: false }, 'sending', true, now + 60_000)).toBe(false)
  })
  it('gives a new conversation time to receive its background acceptance', () => {
    expect(shouldShowDraftRecovery(draft, null, true, now)).toBe(false)
    expect(shouldShowDraftRecovery(draft, null, true, now + CHAT_RECEIPT_GRACE_MS)).toBe(true)
  })
  it('preserves recovery for offline, failed, unknown selection and invalid timestamps', () => {
    expect(shouldShowDraftRecovery(draft, 'sending', false, now)).toBe(true)
    expect(shouldShowDraftRecovery({ ...draft, status: 'failed' }, 'sending', true, now)).toBe(true)
    expect(shouldShowDraftRecovery({ ...draft, confirmed: false }, null, true, now)).toBe(true)
    expect(shouldShowDraftRecovery({ ...draft, createdAt: 'invalid' }, null, true, now)).toBe(true)
  })
  it('never hides a different stalled turn because this conversation is busy', () => {
    expect(shouldShowDraftRecovery(draft, 'another-turn', true, now + 60_000)).toBe(true)
  })
})
