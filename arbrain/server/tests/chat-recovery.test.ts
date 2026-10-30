import { describe, expect, it } from 'vitest'
import { restoreTurnPair, snapshotMessage } from '../../src/features/chat/lib/durable-recovery'
import type { ChatMessage } from '../../src/features/chat/hooks/useChat'
import { confirmedDraftPayload, deliverOfflineChat } from '../../src/features/chat/lib/offline-envelope'
import { vi } from 'vitest'
const time = new Date('2026-09-06T10:00:00Z')
const msg = (id: string, role: 'user' | 'assistant', turnId: string, content: string): ChatMessage => ({ id, role, content, timestamp: time, metadata: { turnId } })

describe('durable turn restoration', () => {
  it('replaces only the exact turn and preserves chronology, even with identical prompts', () => {
    const before = [msg('u1', 'user', 'old', 'hola'), msg('a1', 'assistant', 'old', 'old'), msg('u2', 'user', 'target', 'hola'), msg('a2', 'assistant', 'target', 'partial'), msg('u3', 'user', 'new', 'hola')]
    const restored = restoreTurnPair(before, { turnId: 'target', userMessage: 'hola' }, 'live-target', 'new-user')
    expect(restored.map(m => m.id)).toEqual(['u1', 'a1', 'u2', 'live-target', 'u3'])
    expect(restored[2].timestamp).toBe(time)
    expect(restoreTurnPair(restored, { turnId: 'target', userMessage: 'hola' }, 'live-target', 'new-user')).toEqual(restored)
  })
  it('restores tools, partial inputs/results, pending questions and native items without erasing uploaded history', () => {
    const restored = snapshotMessage({ text: 'partial', thinking: 'summary', status: 'running', tools: { tool: { name: 'Read', input: '{"path":', result: 'file content', status: 'completed', durationMs: 3 } }, questions: { question: { requestId: 'q', questions: [] } }, items: { native: { kind: 'commandExecution', text: 'output' } }, fileAttachments: [] })
    expect(restored).toMatchObject({ content: 'partial', toolCalls: [{ toolId: 'tool', status: 'done' }], toolInputs: { tool: '{"path":' }, toolOutputs: { tool: { content: 'file content' } }, questionPrompts: [{ requestId: 'q', status: 'pending' }], runtimeItems: { native: { kind: 'commandExecution' } } })
    expect(restored).not.toHaveProperty('fileAttachments')
  })
  it('preserves failure diagnostics separately from useful partial output', () => {
    expect(snapshotMessage({ text: 'useful partial', status: 'failed', error: 'quota' })).toMatchObject({ content: 'useful partial', error: true, diagnostic: 'quota', terminalStatus: 'failed' })
  })
  it('restores the original and forked native identities from a durable snapshot', () => {
    const branch = { parentThreadId: 'parent', beforeTurnId: 'old', threadId: 'child' }
    expect(snapshotMessage({ text: 'corrected', status: 'completed', branch })).toMatchObject({ content: 'corrected', branch })
  })
})

describe('offline chat envelope delivery', () => {
  const envelope = { version: 1, expectedOwnerId: 'owner', chatSessionId: 'conversation', turnId: 'turn', account: 'yt', message: 'hello', source: 'mobile', imageUrl: 'https://fixture.test/image', audioUrl: 'https://fixture.test/audio', context: 'context', effort: 'ultra', editOriginalText: 'previous', editTurnId: 'original-app-turn', editOccurrenceFromEnd: 2 }
  it('retains identity, media, context, edit and effort across a lost acceptance acknowledgement', async () => {
    const request = vi.fn().mockRejectedValueOnce(new TypeError('lost ACK')).mockResolvedValueOnce(Response.json({ accepted: true, turnId: 'turn' }, { status: 202 }))
    // Resiliencia (12 oct 2026): una falla de red es pasajera y se reintenta sola; la persona lee la causa y no el error crudo.
    await expect(deliverOfflineChat(envelope, request)).rejects.toThrow('Sin conexión con Arbrain. Reintentando solo…')
    expect(await deliverOfflineChat(envelope, request)).toBe('turn')
    // Cada intento lleva su propio plazo (AbortSignal nuevo); lo que debe ser idéntico es la petición, no la señal.
    const sinSenal = ([url, init]: [string, RequestInit]) => [url, { ...init, signal: undefined }]
    expect(sinSenal(request.mock.calls[0])).toEqual(sinSenal(request.mock.calls[1]))
    expect(request.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ ...envelope, acceptOnly: true })
  })
  it('retains the complete captured selection byte-for-byte across offline acceptance retries', async () => {
    const saved = { ...envelope, intent: { version: 1, owner: 'owner', account: 'yt', conversationId: 'conversation', model: 'gpt-6-astra', effort: 'ultra', fast: true, ultracode: false, observedAt: '2026-09-07T02:00:00Z' } }
    const request = vi.fn().mockRejectedValueOnce(new TypeError('lost ACK')).mockResolvedValueOnce(Response.json({ accepted: true, turnId: 'turn' }, { status: 202 }))
    await expect(deliverOfflineChat(saved, request)).rejects.toThrow('Reintentando solo…')
    await deliverOfflineChat(saved, request)
    expect(request.mock.calls[0][1].body).toBe(request.mock.calls[1][1].body)
    expect(JSON.parse(request.mock.calls[1][1].body).intent).toEqual(saved.intent)
  })
  it('keeps v2 drafts non-dispatchable until scoped confirmation, retaining the original turn and full payload', async () => {
    const draft = { ...envelope, version: 2, createConversation: true }
    const request = vi.fn()
    await expect(deliverOfflineChat(draft, request)).rejects.toThrow('Confirma')
    expect(request).not.toHaveBeenCalled()
    const intent = { version: 1 as const, owner: 'owner', account: 'yt' as const, conversationId: 'conversation', model: 'gpt-6-astra', effort: 'ultra', fast: false, ultracode: false, observedAt: '2026-09-07T03:00:00Z' }
    const payload = JSON.stringify({ prompt: draft.message, localContext: { chatEnvelope: draft, retained: 'context' } })
    const confirmed = JSON.parse(confirmedDraftPayload(payload, 'owner', intent))
    expect(confirmed.localContext).toEqual({ chatEnvelope: { ...draft, intent }, retained: 'context' })
    expect(() => confirmedDraftPayload(payload, 'other', intent)).toThrow('no pertenece')
    expect(() => confirmedDraftPayload(payload, 'owner', { ...intent, account: 'codex' })).toThrow('no pertenece')
    expect(() => confirmedDraftPayload(JSON.stringify(confirmed), 'owner', { ...intent, model: 'replacement' })).toThrow('ya tiene')
  })
  it('will not send a legacy unscoped draft or mistake arbitrary success for acceptance', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ message: 'ok' }))
    await expect(deliverOfflineChat(undefined, request)).rejects.toThrow('identidad')
    expect(request).not.toHaveBeenCalled()
    await expect(deliverOfflineChat(envelope, request)).rejects.toThrow('aceptación')
  })
  it('creates the exact offline conversation id before accepting the turn', async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ session: {} })).mockResolvedValueOnce(Response.json({ accepted: true, turnId: 'turn' }, { status: 202 }))
    await deliverOfflineChat({ ...envelope, createConversation: true }, request)
    expect(request.mock.calls[0][0]).toBe('/api/chat/sessions')
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ id: 'conversation', account: 'yt', expectedOwnerId: 'owner' })
    expect(request.mock.calls[1][0]).toBe('/api/chat/stream')
  })
})
