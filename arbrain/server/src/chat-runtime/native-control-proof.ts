import type Database from 'better-sqlite3'
import { closeSync, existsSync, openSync, readSync, readdirSync, realpathSync } from 'node:fs'
import { join, relative, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { controlAccess, scopedControls, type ControlScope } from './scoped-controls.js'
class NativeControlProofError extends Error {}
export interface NativeControlEvidence extends ControlScope {
  kind: 'claude-transcript-and-bindings'
  transcriptPathHash: string
  matchingMetadata: number
  bindingCount: number
  observedAt: string
}

/** Read-only account provenance. Called only after the proxy verifies the
 * personal owner; filename presence alone cannot authorize legacy adoption.
 * No transcript text, prompts or credentials leave this function. */
function inspectNativeControls(db: Database.Database, scope: ControlScope, roots: Record<string, string>): NativeControlEvidence {
  const id = scope.conversationId?.match(/^sdk:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i)?.[1]
  if (!id || !['default', 'bro'].includes(scope.account)) throw new NativeControlProofError('No se pudo verificar la procedencia de los ajustes nativos.')
  const candidates: Array<{ account: string; path: string }> = []
  for (const account of ['default', 'bro']) {
    const root = roots[account]
    if (!root || !existsSync(root)) continue
    const resolvedRoot = realpathSync(root)
    for (const project of readdirSync(root, { withFileTypes: true })) {
      if (!project.isDirectory() && !project.isSymbolicLink()) continue
      const file = join(root, project.name, `${id}.jsonl`)
      if (!existsSync(file)) continue
      const resolved = realpathSync(file), rel = relative(resolvedRoot, resolved)
      if (isAbsolute(rel) || rel === '..' || rel.startsWith('../')) throw new NativeControlProofError('La sesión nativa sale de la raíz de su cuenta.')
      candidates.push({ account, path: resolved })
    }
  }
  if (candidates.length !== 1 || candidates[0].account !== scope.account) throw new NativeControlProofError('La sesión nativa no tiene una única cuenta verificable.')
  const bindings = db.prepare('SELECT chat_id FROM sessions WHERE session_id=?').all(id) as Array<{ chat_id: string }>
  const bindingAccount = (key: string) => key.includes('::') ? key.slice(key.lastIndexOf('::') + 2) : 'default'
  if (!bindings.length || !bindings.some(row => row.chat_id === `${scope.conversationId}${scope.account === 'default' ? '' : `::${scope.account}`}`)
    || bindings.some(row => bindingAccount(row.chat_id) !== scope.account)) throw new NativeControlProofError('Los vínculos guardados no confirman la cuenta de la sesión nativa.')
  const fd = openSync(candidates[0].path, 'r')
  let matchingMetadata = 0
  try {
    const buffer = Buffer.alloc(2 * 1024 * 1024)
    const length = readSync(fd, buffer, 0, buffer.length, 0)
    const lines = buffer.subarray(0, length).toString('utf8').split('\n')
    // Drop the potentially truncated last line; session IDs in arbitrary text
    // are not evidence. Only complete JSON records' top-level metadata counts.
    lines.pop()
    for (const line of lines.slice(0, 64)) {
      let row: Record<string, unknown>
      try { row = JSON.parse(line) } catch { continue }
      if (row?.sessionId === undefined) continue
      if (row.sessionId !== id) throw new NativeControlProofError('Los metadatos de la sesión nativa no coinciden con su identidad.')
      matchingMetadata++
    }
  } finally { closeSync(fd) }
  if (!matchingMetadata) throw new NativeControlProofError('No se encontraron metadatos verificables en la sesión nativa.')
  return { ...scope, kind: 'claude-transcript-and-bindings', transcriptPathHash: createHash('sha256').update(candidates[0].path).digest('hex'), matchingMetadata, bindingCount: bindings.length, observedAt: new Date().toISOString() }
}

export function proveNativeControls(db: Database.Database, scope: ControlScope, roots: Record<string, string>): NativeControlEvidence {
  try { return inspectNativeControls(db, scope, roots) }
  catch (error) {
    if (error instanceof NativeControlProofError) throw error
    throw new NativeControlProofError('No se pudieron leer los metadatos de la sesión nativa. No se importaron sus ajustes.')
  }
}

export function nativeAwareControlAccess(db: Database.Database, scope: ControlScope, source: { key: string; verifiedConversation: boolean }, verifiedNativeOwner: boolean, roots: Record<string, string>): ReturnType<typeof controlAccess> {
  // Already accepted turns reuse their frozen input. Merely creating this
  // accessor must not make ACK recovery depend on today's transcript files.
  let access: ReturnType<typeof controlAccess> | undefined
  const get = () => {
    if (!access) {
      const nativeEvidence = verifiedNativeOwner && scopedControls(db).needsNativeProof(scope, source.key)
        ? proveNativeControls(db, scope, roots) : undefined
      access = controlAccess(db, scope, { ...source, ...(nativeEvidence ? { nativeEvidence } : {}) })
    }
    return access
  }
  return { read: () => get().read(), patch: (patch, validated) => get().patch(patch, validated) }
}
