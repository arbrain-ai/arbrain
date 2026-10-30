import { describe, expect, it } from 'vitest'
import { accountId, conversationScope } from '../../src/lib/chat-access-policy.js'
const owner = { id: 'daniel', personalOwner: true }
const admin = { id: 'admin', personalOwner: false }

describe('authoritative chat routing policy', () => {
  it('uses the persisted account when the client omits it', () => {
    expect(conversationScope(owner, { id: 'chat', profile_id: 'daniel', account: 'codex' })).toEqual({ owner: 'daniel', conversationId: 'chat', account: 'codex' })
  })
  it('rejects a conflicting requested account instead of billing another subscription', () => {
    expect(() => conversationScope(owner, { id: 'chat', profile_id: 'daniel', account: 'yt' }, 'codex')).toThrow('no coincide')
    expect(() => conversationScope(owner, { id: 'chat', profile_id: 'daniel', account: 'yt' }, 'default')).toThrow('no coincide')
  })
  it('keeps old null-owned personal conversations accessible only to the verified personal owner', () => {
    const row = { id: 'old-desktop', profile_id: null, account: null }
    expect(conversationScope(owner, row)).toEqual({ owner: 'daniel', conversationId: 'old-desktop', account: 'default' })
    expect(() => conversationScope(admin, row)).toThrow('no encontrada')
  })
  it('does not grant an administrator or the desktop access to another profile’s conversation', () => {
    expect(() => conversationScope(admin, { id: 'chat', profile_id: 'daniel', account: null })).toThrow('no encontrada')
    expect(() => conversationScope(owner, { id: 'chat', profile_id: 'other', account: null })).toThrow('no encontrada')
  })
  it('rejects unknown persisted or requested accounts without silently choosing default', () => {
    expect(() => accountId('typo')).toThrow('desconocida')
    expect(() => conversationScope(owner, { id: 'chat', profile_id: 'daniel', account: 'new-unknown' })).toThrow('desconocida')
    expect(accountId(null)).toBe('default')
  })
})
