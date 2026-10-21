import { describe, it, expect, vi } from 'vitest'
import { forkNativeEdit, forkNativeThread, locateNativeEdit } from './codex-fork.js'
const user = (id: string, text: string) => ({ id, items: [{ type: 'userMessage', content: [{ type: 'text', text }] }] })
describe('native edit branches', () => {
  it('locates the correct repeated user occurrence across bounded pages', async () => {
    const request = vi.fn().mockResolvedValueOnce({ data: [user('new', 'same'), { id: 'assistant', items: [{ type: 'agentMessage', text: 'same' }] }], nextCursor: 'older' })
      .mockResolvedValueOnce({ data: [user('old', '[Context: synthetic]\n\nsame')] })
    expect(await locateNativeEdit({ request }, 'parent', { originalText: 'same', occurrenceFromEnd: 2 })).toBe('old')
    expect(request.mock.calls[1][1]).toMatchObject({ cursor: 'older', limit: 50, sortDirection: 'desc', itemsView: 'full' })
  })
  it('forks before the edited turn, retaining the parent and deferring inherited goal execution', async () => {
    const request = vi.fn().mockResolvedValueOnce({ thread: { id: 'parent', status: { type: 'idle' } } })
      .mockResolvedValueOnce({ data: [user('turn', 'old')] })
      .mockResolvedValueOnce({ thread: { id: 'child' }, model: 'gpt-6-astra' })
    expect(await forkNativeEdit({ request }, 'parent', { originalText: 'old', occurrenceFromEnd: 1 }, { model: 'gpt-6-astra' })).toEqual({ branch: { parentThreadId: 'parent', beforeTurnId: 'turn', threadId: 'child' }, model: 'gpt-6-astra' })
    expect(request.mock.calls[2]).toEqual(['thread/fork', { model: 'gpt-6-astra', threadId: 'parent', beforeTurnId: 'turn', deferGoalContinuation: true }])
  })
  it('uses the journal-bound native turn instead of counting identical text from another branch', async () => {
    const request = vi.fn().mockResolvedValue({ data: [user('later-duplicate', 'same'), user('target', 'same')] })
    expect(await locateNativeEdit({ request }, 'parent', { originalText: 'same', occurrenceFromEnd: 99, nativeTurnId: 'target' })).toBe('target')
    await expect(locateNativeEdit({ request }, 'parent', { originalText: 'different', occurrenceFromEnd: 1, nativeTurnId: 'target' })).rejects.toThrow('no coincide')
  })
  it('does not mutate when history is missing, active, aborted or a cursor loops', async () => {
    const active = vi.fn().mockResolvedValue({ thread: { id: 'parent', status: { type: 'active' } } })
    await expect(forkNativeEdit({ request: active }, 'parent', { originalText: 'old', occurrenceFromEnd: 1 }, {})).rejects.toThrow('activo')
    expect(active).toHaveBeenCalledTimes(1)
    const missing = vi.fn().mockResolvedValue({ data: [user('different', 'not old')] })
    await expect(locateNativeEdit({ request: missing }, 'parent', { originalText: 'old', occurrenceFromEnd: 1 })).rejects.toThrow('No se encontró')
    const looping = vi.fn().mockResolvedValue({ data: [], nextCursor: 'same' })
    await expect(locateNativeEdit({ request: looping }, 'parent', { originalText: 'old', occurrenceFromEnd: 1 })).rejects.toThrow('no avanzó')
    expect(looping).toHaveBeenCalledTimes(2)
    const aborted = vi.fn()
    await expect(locateNativeEdit({ request: aborted }, 'parent', { originalText: 'old', occurrenceFromEnd: 1 }, AbortSignal.abort())).rejects.toThrow('cancelada')
    expect(aborted).not.toHaveBeenCalled()
  })
})

describe('bifurcar una conversación Codex completa', () => {
  it('bifurca el hilo entero (sin beforeTurnId), retiene al padre y difiere el objetivo heredado', async () => {
    const request = vi.fn().mockResolvedValueOnce({ thread: { id: 'parent', status: { type: 'idle' } } })
      .mockResolvedValueOnce({ thread: { id: 'child' }, model: 'gpt-6-astra' })
    expect(await forkNativeThread({ request }, 'parent', { model: 'gpt-6-astra' })).toBe('child')
    expect(request.mock.calls[1]).toEqual(['thread/fork', { model: 'gpt-6-astra', threadId: 'parent', deferGoalContinuation: true }])
    expect(request.mock.calls[1][1]).not.toHaveProperty('beforeTurnId')
  })
  it('no bifurca con turno activo ni si el motor no confirma una rama distinta', async () => {
    const active = vi.fn().mockResolvedValue({ thread: { id: 'parent', status: { type: 'active' } } })
    await expect(forkNativeThread({ request: active }, 'parent', {})).rejects.toThrow('activo')
    expect(active).toHaveBeenCalledTimes(1)
    const same = vi.fn().mockResolvedValueOnce({ thread: { id: 'parent', status: { type: 'idle' } } }).mockResolvedValueOnce({ thread: { id: 'parent' } })
    await expect(forkNativeThread({ request: same }, 'parent', {})).rejects.toThrow('independiente')
    const other = vi.fn().mockResolvedValue({ thread: { id: 'otro' } })
    await expect(forkNativeThread({ request: other }, 'parent', {})).rejects.toThrow('no confirmó la conversación')
  })
})
