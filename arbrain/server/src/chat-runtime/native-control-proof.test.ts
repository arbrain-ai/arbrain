import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nativeAwareControlAccess, proveNativeControls } from './native-control-proof.js'
const id = 'abcdef00-1111-4222-8333-444444444444'
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'native-controls-')), db = new Database(':memory:')
  const roots = { default: join(dir, 'default'), bro: join(dir, 'bro') }
  for (const root of Object.values(roots)) mkdirSync(join(root, 'project'), { recursive: true })
  const path = join(roots.bro, 'project', `${id}.jsonl`)
  writeFileSync(path, JSON.stringify({ sessionId: id, message: { content: 'PRIVATE CONTENT MUST NOT BE RETAINED' } }) + '\n')
  db.exec('CREATE TABLE sessions(chat_id TEXT PRIMARY KEY,session_id TEXT);CREATE TABLE chat_overrides(session_key TEXT PRIMARY KEY,model TEXT,effort TEXT,fast INTEGER,ultracode INTEGER,updated_at INTEGER)')
  db.prepare('INSERT INTO sessions VALUES (?,?)').run(`sdk:${id}::bro`, id)
  db.prepare('INSERT INTO chat_overrides VALUES (?,?,?,?,?,?)').run(`sdk:${id}`, 'claude-opus-test[1m]', 'xhigh', 0, 1, 12)
  const scope = { owner: 'synthetic-personal-owner', account: 'bro', conversationId: `sdk:${id}` }
  const source = { key: scope.conversationId, verifiedConversation: false }
  return { dir, db, roots, path, scope, source, close: () => { db.close(); rmSync(dir, { recursive: true, force: true }) } }
}
describe('native legacy controls provenance', () => {
  it('imports only after owner verification plus unique account metadata/bindings, preserving a sanitized audit trail', () => {
    const f = fixture()
    try {
      const before = f.db.prepare('SELECT * FROM chat_overrides').get()
      expect(() => nativeAwareControlAccess(f.db, f.scope, f.source, false, f.roots).read()).toThrow('migración explícita')
      const access = nativeAwareControlAccess(f.db, f.scope, f.source, true, f.roots)
      expect(access.read()).toEqual({ model: 'claude-opus-test[1m]', effort: 'xhigh', fast: false, ultracode: true })
      const audit = f.db.prepare('SELECT evidence_json FROM chat_controls_legacy_evidence').get() as { evidence_json: string }
      expect(JSON.parse(audit.evidence_json)).toMatchObject({ owner: f.scope.owner, account: 'bro', conversationId: f.scope.conversationId, bindingCount: 1, matchingMetadata: 1 })
      expect(audit.evidence_json).not.toContain('PRIVATE CONTENT'); expect(audit.evidence_json).not.toContain(f.path)
      expect(f.db.prepare('SELECT * FROM chat_overrides').get()).toEqual(before)
      rmSync(f.path)
      expect(nativeAwareControlAccess(f.db, f.scope, f.source, true, f.roots).read().effort).toBe('xhigh')
    } finally { f.close() }
  })
  it('rejects duplicate account locations, cross-account bindings and metadata mismatches', () => {
    const f = fixture()
    try {
      const other = join(f.roots.default, 'project', `${id}.jsonl`)
      writeFileSync(other, JSON.stringify({ sessionId: id }) + '\n')
      expect(() => proveNativeControls(f.db, f.scope, f.roots)).toThrow('única cuenta')
      rmSync(other)
      f.db.prepare('INSERT INTO sessions VALUES (?,?)').run(`sdk:${id}`, id)
      expect(() => proveNativeControls(f.db, f.scope, f.roots)).toThrow('vínculos')
      f.db.prepare('DELETE FROM sessions WHERE chat_id=?').run(`sdk:${id}`)
      writeFileSync(f.path, JSON.stringify({ sessionId: 'different' }) + '\n')
      expect(() => proveNativeControls(f.db, f.scope, f.roots)).toThrow('metadatos')
    } finally { f.close() }
  })
  it('rejects path escape, text-only identity and incomplete JSON instead of treating filenames as proof', () => {
    const f = fixture()
    try {
      writeFileSync(f.path, JSON.stringify({ message: `sessionId:${id}` }) + '\n')
      expect(() => proveNativeControls(f.db, f.scope, f.roots)).toThrow('metadatos verificables')
      writeFileSync(f.path, JSON.stringify({ sessionId: id }))
      expect(() => proveNativeControls(f.db, f.scope, f.roots)).toThrow('metadatos verificables')
      const outside = join(f.dir, 'outside.jsonl'); writeFileSync(outside, JSON.stringify({ sessionId: id }) + '\n')
      rmSync(f.path); symlinkSync(outside, f.path)
      expect(() => proveNativeControls(f.db, f.scope, f.roots)).toThrow('raíz')
    } finally { f.close() }
  })
  it('does not inspect or mutate controls merely to create an accessor for a recovered ACK', () => {
    const f = fixture()
    try {
      rmSync(f.path)
      expect(() => nativeAwareControlAccess(f.db, f.scope, f.source, true, f.roots)).not.toThrow()
      expect(f.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'chat_controls_%'").get()).toEqual({ n: 0 })
    } finally { f.close() }
  })
  it('sanitizes filesystem failures and does not hide duplicate accounts behind project symlinks', () => {
    const f = fixture()
    try {
      symlinkSync(join(f.roots.bro, 'project'), join(f.roots.default, 'linked-project'))
      expect(() => proveNativeControls(f.db, f.scope, f.roots)).toThrow('raíz')
      rmSync(join(f.roots.default, 'linked-project'))
      rmSync(f.path); mkdirSync(f.path)
      let error: Error | undefined
      try { proveNativeControls(f.db, f.scope, f.roots) } catch (e) { error = e as Error }
      expect(error?.message).toContain('No se pudieron leer los metadatos')
      expect(error?.message).not.toContain(f.dir)
      expect(error?.message).not.toContain(id)
    } finally { f.close() }
  })
})
