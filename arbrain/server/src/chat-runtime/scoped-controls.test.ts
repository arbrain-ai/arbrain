import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ScopedControls, controlAccess } from './scoped-controls.js'
import { changeChatControls } from './chat-controls.js'
const scope = { owner: 'owner', account: 'codex', conversationId: 'chat' }
const source = { key: 'chat', verifiedConversation: true }
function fixture(file = ':memory:') {
  const db = new Database(file)
  db.exec('CREATE TABLE IF NOT EXISTS chat_overrides(session_key TEXT PRIMARY KEY,model TEXT,effort TEXT,fast INTEGER,ultracode INTEGER,updated_at INTEGER)')
  return { db, store: new ScopedControls(db) }
}
describe('scoped controls and additive legacy migration', () => {
  it('imports verified legacy values once and retains an exact rollback copy and original row', () => {
    const { db, store } = fixture()
    try {
      db.prepare('INSERT INTO chat_overrides VALUES (?,?,?,?,?,?)').run('chat', 'gpt-6-astra', 'ultra', 1, 0, 123)
      const before = db.prepare('SELECT * FROM chat_overrides').get()
      expect(store.read(scope, source)).toMatchObject({ model: 'gpt-6-astra', effort: 'ultra', fast: true, revision: 1 })
      expect(store.read(scope, source)).toMatchObject({ revision: 1 })
      const claim = db.prepare('SELECT * FROM chat_controls_legacy_claims').get() as Record<string, unknown>
      expect(claim).toMatchObject({ owner: 'owner', account: 'codex', conversation_id: 'chat' })
      expect(JSON.parse(String(claim.original_json))).toEqual({ model: 'gpt-6-astra', effort: 'ultra', fast: 1, ultracode: 0, updated_at: 123 })
      store.patch(scope, source, { model: null, effort: null, fast: false, ultracode: false })
      expect(store.read(scope, source)).toMatchObject({ model: null, effort: null, fast: false, revision: 2 })
      expect(db.prepare('SELECT * FROM chat_overrides').get()).toEqual(before)
      expect(db.prepare('SELECT count(*) AS n FROM chat_controls_legacy_claims').get()).toEqual({ n: 1 })
    } finally { db.close() }
  })
  it('separates owner, account and conversation including identifiers containing delimiters', () => {
    const { db, store } = fixture()
    try {
      db.prepare('INSERT INTO chat_overrides VALUES (?,?,?,?,?,?)').run('chat', 'gpt-6-astra', 'ultra', 1, 0, 123)
      store.read(scope, source)
      for (const other of [{ ...scope, owner: 'other' }, { ...scope, account: 'yt' }, { ...scope, conversationId: 'other' }]) {
        expect(store.read(other, { ...source, key: other.conversationId! })).toMatchObject({ model: null, effort: null, fast: false })
      }
      const a = { owner: 'a:b', account: 'default', conversationId: 'c' }, b = { owner: 'a', account: 'default', conversationId: 'b:c' }
      store.patch(a, { key: 'c', verifiedConversation: true }, { model: 'opus' })
      expect(store.read(b, { key: 'b:c', verifiedConversation: true }).model).toBeNull()
      expect(store.read(scope, source).model).toBe('gpt-6-astra')
    } finally { db.close() }
  })
  it('refuses unverified, native and sessionless legacy adoption without writing any claim or destination', () => {
    const { db, store } = fixture()
    try {
      for (const key of ['chat', 'sdk:native', 'mc-web']) db.prepare('INSERT INTO chat_overrides VALUES (?,?,?,?,?,?)').run(key, 'opus', 'max', 0, 0, 1)
      for (const [target, legacy] of [
        [scope, { ...source, verifiedConversation: false }],
        [{ ...scope, conversationId: 'sdk:native' }, { key: 'sdk:native', verifiedConversation: true }],
        [{ ...scope, conversationId: null }, { key: 'mc-web', verifiedConversation: true }],
      ] as const) expect(() => store.read(target, legacy)).toThrow('migración explícita')
      expect(db.prepare('SELECT count(*) AS n FROM chat_controls_v2').get()).toEqual({ n: 0 })
      expect(db.prepare('SELECT count(*) AS n FROM chat_controls_legacy_claims').get()).toEqual({ n: 0 })
      expect(db.prepare('SELECT count(*) AS n FROM chat_overrides').get()).toEqual({ n: 3 })
    } finally { db.close() }
  })
  it('never re-adopts changed legacy data after resetting, and refuses an incomplete rollback', () => {
    const { db, store } = fixture()
    try {
      db.prepare('INSERT INTO chat_overrides VALUES (?,?,?,?,?,?)').run('chat', 'opus', 'max', 0, 0, 1)
      store.read(scope, source); store.patch(scope, source, { model: null, effort: null })
      db.prepare('UPDATE chat_overrides SET model=?').run('replacement')
      expect(store.read(scope, source).model).toBeNull()
      db.prepare('DELETE FROM chat_controls_v2').run()
      expect(() => store.read(scope, source)).toThrow('migración previa')
    } finally { db.close() }
  })
  it('uses a transactional revision check across separate database connections', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chat-controls-'))
    const a = fixture(join(dir, 'db.sqlite')), b = fixture(join(dir, 'db.sqlite'))
    try {
      const access = controlAccess(a.db, scope, source)
      expect(access.read().fast).toBe(false)
      b.store.patch(scope, source, { fast: true })
      expect(() => access.patch({ model: 'astra' })).toThrow('ajustes cambiaron')
      expect(a.store.read(scope, source)).toMatchObject({ model: null, fast: true })
      access.read(); access.patch({ effort: 'ultra' })
      expect(b.store.read(scope, source)).toMatchObject({ effort: 'ultra', fast: true })
    } finally { a.db.close(); b.db.close(); rmSync(dir, { recursive: true, force: true }) }
  })
  it('rejects ABA changes across the real async validation helper even when values are restored', async () => {
    const { db, store } = fixture()
    try {
      const access = controlAccess(db, scope, source)
      let release!: () => void
      const pending = changeChatControls(access.read, async () => {
        await new Promise<void>(resolve => { release = resolve })
        return { effort: 'ultra' }
      }, access.patch)
      store.patch(scope, source, { fast: true })
      store.patch(scope, source, { fast: false })
      release()
      await expect(pending).rejects.toThrow('ajustes cambiaron')
      expect(store.read(scope, source)).toMatchObject({ effort: null, fast: false, revision: 3 })
    } finally { db.close() }
  })
})
