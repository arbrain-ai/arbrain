import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { Conversation, Turn } from './types.js'
import { ConsejoError } from './types.js'

/** Dedicated namespace; never reads or mutates the four operational chat spaces. */
export class ConsejoStore {
  readonly db: Database.Database
  constructor(filename: string) {
    this.db = new Database(filename)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`CREATE TABLE IF NOT EXISTS consejo_conversations (id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS consejo_turns (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, owner TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS consejo_scope ON consejo_turns(owner, conversation_id);`)
  }
  create(owner: string, id: string): Conversation {
    const existing = this.db.prepare('SELECT data FROM consejo_conversations WHERE id=?').get(id) as { data: string } | undefined
    if (existing) return this.conversation(owner, id)
    const data: Conversation = { id, owner, title: 'Nuevo Consejo', rootBranchId: randomUUID(), createdAt: Date.now() }
    this.db.prepare('INSERT INTO consejo_conversations VALUES (?,?,?)').run(id, owner, JSON.stringify(data))
    return data
  }
  conversation(owner: string, id: string): Conversation {
    const row = this.db.prepare('SELECT data FROM consejo_conversations WHERE id=? AND owner=?').get(id, owner) as { data: string } | undefined
    if (!row) throw new ConsejoError('Consejo no encontrado.', 404)
    return JSON.parse(row.data)
  }
  list(owner: string): Conversation[] {
    return (this.db.prepare('SELECT data FROM consejo_conversations WHERE owner=? ORDER BY rowid DESC').all(owner) as { data: string }[]).map(r => JSON.parse(r.data))
  }
  turns(owner: string, id: string): Turn[] {
    this.conversation(owner, id)
    return (this.db.prepare('SELECT data FROM consejo_turns WHERE owner=? AND conversation_id=? ORDER BY rowid').all(owner, id) as { data: string }[]).map(r => JSON.parse(r.data))
  }
  turn(owner: string, conversationId: string, id: string): Turn {
    const row = this.db.prepare('SELECT data FROM consejo_turns WHERE id=? AND owner=? AND conversation_id=?').get(id, owner, conversationId) as { data: string } | undefined
    if (!row) throw new ConsejoError('Turno no encontrado.', 404)
    return JSON.parse(row.data)
  }
  insert(turn: Turn): void {
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO consejo_turns VALUES (?,?,?,?)').run(turn.id, turn.conversationId, turn.owner, JSON.stringify(turn))
      const c = this.conversation(turn.owner, turn.conversationId)
      if (c.title === 'Nuevo Consejo') {
        c.title = turn.message.slice(0, 90)
        this.db.prepare('UPDATE consejo_conversations SET data=? WHERE id=?').run(JSON.stringify(c), c.id)
      }
    })()
  }
  save(turn: Turn): void {
    const expected = turn.revision
    turn.revision++
    const result = this.db.prepare("UPDATE consejo_turns SET data=? WHERE id=? AND owner=? AND json_extract(data, '$.revision')=?").run(JSON.stringify(turn), turn.id, turn.owner, expected)
    if (result.changes !== 1) { turn.revision = expected; throw new ConsejoError('El turno cambió durante la escritura. Recupera su estado antes de continuar.') }
  }
  recover(): void {
    const rows = this.db.prepare('SELECT data FROM consejo_turns').all() as { data: string }[]
    this.db.transaction(() => { for (const row of rows) {
      const t: Turn = JSON.parse(row.data)
      if (t.state !== 'running' && t.state !== 'pending') continue
      t.state = 'failed'
      if (t.contextPreparation?.state === 'running') { t.contextPreparation.state = 'failed'; t.contextPreparation.error = 'El host se reinició durante la compactación común.' }
      for (const p of Object.values(t.proposals)) if (p.state === 'running' || p.state === 'pending') {
        p.state = 'failed'; p.error = 'El host se reinició. No se reenvió la inferencia; puedes reintentar esta etapa.'; p.endedAt = Date.now()
        for(const tool of p.tools??[])if(tool.state==='running'){tool.state='failed';tool.error='El host se reinició; no se repitió esta consulta.';tool.endedAt=Date.now()}
      }
      this.save(t)
    } })()
  }
  close(): void { this.db.close() }
}
