import type Database from 'better-sqlite3'
import type { ChatOverrides } from '../db.js'
import type { NativeControlEvidence } from './native-control-proof.js'
import { esCuentaChat } from '../modelos/registro.js'
import { controlesIniciales } from '../modelos/preferencia.js'
export interface ControlScope { owner: string; account: string; conversationId: string | null }
export interface LegacyControlSource { key: string; verifiedConversation: boolean; nativeEvidence?: NativeControlEvidence }
type Row = ChatOverrides & { fast: boolean; ultracode: boolean; revision: number }
const empty = (): ChatOverrides => ({ model: null, effort: null, fast: false, ultracode: false })
const params = (scope: ControlScope) => {
  if (!scope.owner?.trim() || scope.owner.trim() !== scope.owner || !esCuentaChat(scope.account)
    || (scope.conversationId !== null && (!scope.conversationId?.trim() || scope.conversationId.trim() !== scope.conversationId))) throw new Error('Invalid conversation controls scope')
  return [scope.owner, scope.account, scope.conversationId ?? ''] as const
}
const values = (row: Record<string, unknown>): Row => ({ model: row.model as string | null, effort: row.effort as string | null, fast: row.fast === 1, ultracode: row.ultracode === 1, revision: Number(row.revision) })

/** Separate tables preserve the original rows for rollback. A legacy row can
 * be adopted once, only after the web DAL has verified the conversation's
 * owner and account. Native/sessionless ambiguous rows are never guessed. */
export class ScopedControls {
  constructor(private db: Database.Database) {
    db.exec(`CREATE TABLE IF NOT EXISTS chat_controls_v2 (
      owner TEXT NOT NULL, account TEXT NOT NULL, conversation_id TEXT NOT NULL,
      model TEXT, effort TEXT, fast INTEGER NOT NULL, ultracode INTEGER NOT NULL,
      revision INTEGER NOT NULL, origin TEXT NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY(owner,account,conversation_id));
      CREATE TABLE IF NOT EXISTS chat_controls_legacy_claims (
      legacy_key TEXT PRIMARY KEY, owner TEXT NOT NULL, account TEXT NOT NULL,
      conversation_id TEXT NOT NULL, original_json TEXT NOT NULL, imported_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chat_controls_legacy_evidence (legacy_key TEXT PRIMARY KEY, evidence_json TEXT NOT NULL);`)
  }
  private existing(scope: ControlScope): Row | undefined {
    const row = this.db.prepare('SELECT model,effort,fast,ultracode,revision FROM chat_controls_v2 WHERE owner=? AND account=? AND conversation_id=?').get(...params(scope)) as Record<string, unknown> | undefined
    return row && values(row)
  }
  private initialize(scope: ControlScope, source: LegacyControlSource): Row {
    const existing = this.existing(scope)
    if (existing) return existing
    const legacy = this.db.prepare('SELECT model,effort,fast,ultracode,updated_at FROM chat_overrides WHERE session_key=?').get(source.key) as Record<string, unknown> | undefined
    const claimed = this.db.prepare('SELECT owner,account,conversation_id FROM chat_controls_legacy_claims WHERE legacy_key=?').get(source.key) as Record<string, unknown> | undefined
    // A different account/owner has its own defaults; never import the claimed
    // row again even if the original table is subsequently modified.
    let initial = empty(), origin = 'new'
    // 2 oct 2026: una fila nueva nace con el modelo y esfuerzo elegidos en Configuración para su motor.
    // Las conversaciones nativas `sdk:` traen los suyos.
    const preferidos = scope.conversationId?.startsWith('sdk:') ? null : controlesIniciales(this.db, scope.account)
    if (preferidos) initial = { ...initial, ...preferidos }
    if (legacy && !claimed) {
      const evidence = source.nativeEvidence
      const verifiedNative = evidence?.kind === 'claude-transcript-and-bindings' && evidence.owner === scope.owner && evidence.account === scope.account && evidence.conversationId === scope.conversationId && evidence.matchingMetadata > 0 && evidence.bindingCount > 0
      const verified = scope.conversationId?.startsWith('sdk:') ? verifiedNative : source.verifiedConversation
      if (!verified || !scope.conversationId || source.key !== scope.conversationId) {
        throw new Error('Los ajustes antiguos no tienen propietario/cuenta verificables. Se conservaron sin importarlos; requieren migración explícita.')
      }
      initial = values({ ...legacy, revision: 1 }); origin = verifiedNative ? 'legacy-native-verified' : 'legacy-verified'
      this.db.prepare('INSERT INTO chat_controls_legacy_claims VALUES (?,?,?,?,?,?)').run(source.key, ...params(scope), JSON.stringify(legacy), Date.now())
      if (verifiedNative) this.db.prepare('INSERT INTO chat_controls_legacy_evidence VALUES (?,?)').run(source.key, JSON.stringify(evidence))
    } else if (claimed && claimed.owner === scope.owner && claimed.account === scope.account && claimed.conversation_id === (scope.conversationId ?? '')) {
      // Missing destination after a prior migration indicates a partial/manual
      // rollback. Do not recreate it from a legacy row that may have changed.
      throw new Error('Falta el destino de una migración previa de ajustes. Restaura su copia antes de continuar.')
    }
    this.db.prepare('INSERT INTO chat_controls_v2 VALUES (?,?,?,?,?,?,?,?,?,?)').run(...params(scope), initial.model, initial.effort, Number(initial.fast), Number(initial.ultracode), 1, origin, Date.now())
    return { ...initial, revision: 1 }
  }
  read(scope: ControlScope, source: LegacyControlSource): Row {
    // Fast existing reads avoid taking a write lock on every metadata request.
    return this.existing(scope) ?? this.db.transaction(() => this.initialize(scope, source)).immediate()
  }
  needsNativeProof(scope: ControlScope, key: string): boolean {
    return !this.existing(scope) && !!scope.conversationId?.startsWith('sdk:')
      && !!this.db.prepare('SELECT 1 FROM chat_overrides WHERE session_key=?').get(key)
      && !this.db.prepare('SELECT 1 FROM chat_controls_legacy_claims WHERE legacy_key=?').get(key)
  }
  patch(scope: ControlScope, source: LegacyControlSource, patch: Partial<ChatOverrides>, expectedRevision?: number): Row {
    return this.db.transaction(() => {
      const current = this.initialize(scope, source)
      if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new Error('Los ajustes cambiaron durante la validación. Repite la orden.')
      const next = { ...current, ...patch, revision: current.revision + 1 }
      this.db.prepare('UPDATE chat_controls_v2 SET model=?,effort=?,fast=?,ultracode=?,revision=?,updated_at=? WHERE owner=? AND account=? AND conversation_id=?')
        .run(next.model, next.effort, Number(next.fast), Number(next.ultracode), next.revision, Date.now(), ...params(scope))
      // Keep a row when resetting all values: deletion would reimport legacy.
      return next
    }).immediate()
  }
}
const stores = new WeakMap<Database.Database, ScopedControls>()
export function scopedControls(db: Database.Database): ScopedControls {
  let store = stores.get(db)
  if (!store) { store = new ScopedControls(db); stores.set(db, store) }
  return store
}

export function controlAccess(db: Database.Database, scope: ControlScope, source: LegacyControlSource) {
  const store = scopedControls(db)
  let revision: number | undefined
  const snapshots = new WeakMap<ChatOverrides, number>()
  const strip = (row: Row): ChatOverrides => {
    revision = row.revision
    const snapshot = { model: row.model, effort: row.effort, fast: row.fast, ultracode: row.ultracode }
    snapshots.set(snapshot, row.revision)
    return snapshot
  }
  return {
    read: () => strip(store.read(scope, source)),
    patch: (patch: Partial<ChatOverrides>, validated?: ChatOverrides) => {
      const expected = validated ? snapshots.get(validated) : revision
      if (validated && expected === undefined) throw new Error('La validación no pertenece a esta lectura de ajustes.')
      return strip(store.patch(scope, source, patch, expected))
    },
  }
}
