import { describe, it, expect, vi } from 'vitest'
import Database from 'better-sqlite3'
import { changeChatControls, effortControlPatch, ultracodeControlPatch } from './chat-controls.js'
import { freezeClaudeSelection } from './claude-selection.js'
import type { ChatOverrides } from '../db.js'
import type { SessionOverrides } from '../agent.js'

function store() {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE settings (value TEXT);')
  db.prepare('INSERT INTO settings VALUES (?)').run(JSON.stringify({ model: 'opus', effort: 'max', fast: false, ultracode: false }))
  const read = (): ChatOverrides => JSON.parse((db.prepare('SELECT value FROM settings').get() as { value: string }).value)
  const commit = vi.fn((patch: Partial<ChatOverrides>) => { const next = { ...read(), ...patch }; db.prepare('UPDATE settings SET value=?').run(JSON.stringify(next)); return next })
  return { db, read, commit }
}
describe('validated conversation controls', () => {
  it('activates Ultracode and xhigh together, yielding a valid frozen next turn; off retains chosen effort', async () => {
    const f = store()
    try {
      const validate = (overrides: ChatOverrides) => Promise.resolve(freezeClaudeSelection('default', overrides as SessionOverrides, undefined,
        { account: 'default', observedAt: 'synthetic', commandNames: [], agentNames: [], models: [{ value: 'opus', resolvedModel: 'claude-opus-test', displayName: 'Opus', description: '', supportedEffortLevels: ['xhigh', 'max'] }] },
        { configuredModel: 'opus', configuredEffort: 'max', settingsSource: 'user' }))
      const updated = await changeChatControls(f.read, current => ultracodeControlPatch(current, true, validate), f.commit)
      expect(updated).toMatchObject({ ultracode: true, effort: 'xhigh', model: 'opus' })
      expect(f.commit).toHaveBeenCalledOnce()
      expect(await validate(updated)).toMatchObject({ model: 'claude-opus-test', ultracode: true, effort: 'xhigh' })
      const unavailable = vi.fn().mockRejectedValue(new Error('offline'))
      await changeChatControls(f.read, current => ultracodeControlPatch(current, false, unavailable), f.commit)
      expect(f.read()).toMatchObject({ ultracode: false, effort: 'xhigh' }); expect(unavailable).not.toHaveBeenCalled()
    } finally { f.db.close() }
  })
  it('never writes an unsupported selection or a plan invalidated by a concurrent model change', async () => {
    const f = store()
    try {
      await expect(changeChatControls(f.read, c => ultracodeControlPatch(c, true, async () => { throw new Error('unsupported') }), f.commit)).rejects.toThrow('unsupported')
      expect(f.commit).not.toHaveBeenCalled()
      let release!: () => void
      const pending = changeChatControls(f.read, c => ultracodeControlPatch(c, true, () => new Promise<void>(resolve => { release = resolve })), f.commit)
      f.commit({ model: 'haiku' }); release()
      await expect(pending).rejects.toThrow('ajustes cambiaron')
      expect(f.read()).toEqual({ model: 'haiku', effort: 'max', fast: false, ultracode: false })
      expect(f.commit).toHaveBeenCalledOnce()
    } finally { f.db.close() }
  })
  it('refuses incompatible effort/default while standing orchestration is active, without modifying it', async () => {
    const f = store()
    try {
      f.commit({ effort: 'xhigh', ultracode: true }); f.commit.mockClear()
      for (const effort of ['high', 'max', 'default', 'auto', 'reset']) {
        await expect(changeChatControls(f.read, async c => effortControlPatch(c, effort, ['high', 'xhigh', 'max']), f.commit)).rejects.toThrow('/ultracode off')
      }
      expect(f.commit).not.toHaveBeenCalled()
      await changeChatControls(f.read, async c => effortControlPatch(c, 'xhigh', ['xhigh']), f.commit)
      expect(f.read()).toMatchObject({ effort: 'xhigh', ultracode: true })
    } finally { f.db.close() }
  })
})
