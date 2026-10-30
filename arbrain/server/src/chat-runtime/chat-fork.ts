import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'
import { scopedControls } from './scoped-controls.js'
import { cuentasChat, rutasApi } from '../modelos/registro.js'

/**
 * Bifurcar una conversación (1 oct 2026): crea la sesión NATIVA del motor que respalda a la copia, para que
 * Levy recuerde todo el contexto y la original quede intacta. La fila de chat_sessions y sus mensajes los copia
 * la web; aquí solo vive lo que es del motor (mapa conversación → sesión nativa, ajustes por conversación).
 *
 * Todo entra por `ForkDeps` para probarlo sin Claude ni Codex reales; el cableado real está en server.ts.
 * Eager a propósito (no «resume + forkSession» en el primer turno): la copia queda verificable en disco y el
 * primer turno de la copia no puede tocar la sesión de la original.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACCOUNTS = new Set(cuentasChat())
const TERMINALES = new Set(['completed', 'failed', 'interrupted'])
const CODEX = new Set(['codex', 'yt', ...rutasApi().map(r => r.cuenta)])

export class ForkRejected extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'ForkRejected' }
}

export interface ForkRequest {
  owner: string
  account: string
  sourceId: string
  forkId: string
  title: string
}

export interface ForkScope { owner: string; account: string; conversationId: string }

export interface ForkResult {
  /** `none`: la original no tenía sesión del motor (nunca recibió un turno): la copia lleva el historial visible, pero Levy no lo recuerda. */
  engine: 'claude' | 'codex' | 'none'
  nativeId: string | null
  /** Ya existía la copia (reintento): no se creó otra sesión nativa. */
  reused: boolean
  controlsCopied: boolean
}

export interface ForkDeps {
  getSession(key: string): string | undefined
  setSession(key: string, nativeId: string): void
  /** Estado del último turno del journal de esa conversación, o null si no hay. */
  latestStatus(scope: ForkScope): string | null
  forkClaude(nativeId: string, account: string, title: string): Promise<string>
  forkCodex(nativeId: string, account: string): Promise<string>
  /** Copia model/effort/fast/ultracode de la original a la copia; false si la original no tenía. */
  copyControls(from: ForkScope, to: ForkScope): boolean
}

/** Misma llave que usa chat-job.ts para ligar una conversación con su sesión nativa. */
export const claveSesion = (s: ForkScope) => `${s.owner}:${s.conversationId}::${s.account}`
const claveLegada = (s: ForkScope) => (s.account === 'default' ? s.conversationId : `${s.conversationId}::${s.account}`)

export function validarFork(req: ForkRequest): void {
  if (!req.owner?.trim() || req.owner.trim() !== req.owner) throw new ForkRejected(400, 'Falta el propietario de la conversación.')
  if (!ACCOUNTS.has(req.account)) throw new ForkRejected(400, 'Cuenta no válida para bifurcar.')
  if (!UUID.test(req.sourceId) || !UUID.test(req.forkId)) throw new ForkRejected(400, 'Identificadores de conversación no válidos.')
  if (req.sourceId.toLowerCase() === req.forkId.toLowerCase()) throw new ForkRejected(400, 'La copia no puede tener el mismo id que la original.')
  if (!req.title?.trim()) throw new ForkRejected(400, 'Falta el título de la copia.')
}

export async function forkConversation(req: ForkRequest, deps: ForkDeps): Promise<ForkResult> {
  validarFork(req)
  const origen: ForkScope = { owner: req.owner, account: req.account, conversationId: req.sourceId }
  const copia: ForkScope = { owner: req.owner, account: req.account, conversationId: req.forkId }

  // Reintento (la web no alcanzó a leer la respuesta): la copia ya quedó ligada, no se crea otra sesión del motor.
  const yaLigada = deps.getSession(claveSesion(copia))
  if (yaLigada) return { engine: CODEX.has(req.account) ? 'codex' : 'claude', nativeId: yaLigada, reused: true, controlsCopied: false }

  const estado = deps.latestStatus(origen)
  if (estado && !TERMINALES.has(estado)) throw new ForkRejected(409, 'Esta conversación tiene un turno en curso. Espera a que termine para bifurcarla.')

  const nativeId = deps.getSession(claveSesion(origen)) ?? deps.getSession(claveLegada(origen))
  if (!nativeId) return { engine: 'none', nativeId: null, reused: false, controlsCopied: false }

  const codex = CODEX.has(req.account)
  let nuevo: string
  try {
    nuevo = codex ? await deps.forkCodex(nativeId, req.account) : await deps.forkClaude(nativeId, req.account, req.title)
  } catch (error) {
    if (error instanceof ForkRejected) throw error
    throw new ForkRejected(502, `El motor no pudo bifurcar la conversación: ${error instanceof Error ? error.message : 'error desconocido'}`)
  }
  if (!nuevo || nuevo === nativeId) throw new ForkRejected(502, 'El motor no confirmó una sesión independiente para la copia.')
  deps.setSession(claveSesion(copia), nuevo)

  // Los ajustes (modelo, esfuerzo) acompañan a la copia; si no se pueden copiar, hereda los de fábrica y la copia sigue válida.
  let controlsCopied = false
  try { controlsCopied = deps.copyControls(origen, copia) } catch { /* ajustes de fábrica */ }
  return { engine: codex ? 'codex' : 'claude', nativeId: nuevo, reused: false, controlsCopied }
}

// ─── Claude: forkSession del SDK en un proceso hijo ──────────────────────────
//
// `forkSession` del SDK lee CLAUDE_CONFIG_DIR de process.env y no admite otro por llamada. Cambiarlo en el
// daemon pisaría a los turnos que corren al mismo tiempo en otra cuenta; un proceso hijo con su propio entorno
// no toca a nadie y conserva la lógica del SDK (reasigna ids, recorta ramas, escribe el título).

const RAIZ_AGENT_SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const SCRIPT_HIJO = `
import { forkSession } from '@anthropic-ai/claude-agent-sdk'
try {
  const p = JSON.parse(process.env.ARBRAIN_FORK_PAYLOAD ?? '{}')
  const r = await forkSession(p.id, { title: p.title })
  process.stdout.write(JSON.stringify({ sessionId: r.sessionId }))
} catch (error) {
  process.stderr.write(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
  process.exit(1)
}
`

export function forkClaudeEnHijo(nativeId: string, title: string, configDir: string | undefined, timeoutMs = 60_000): Promise<string> {
  const env: NodeJS.ProcessEnv = { ...process.env, ARBRAIN_FORK_PAYLOAD: JSON.stringify({ id: nativeId, title }) }
  if (configDir) env.CLAUDE_CONFIG_DIR = configDir
  else delete env.CLAUDE_CONFIG_DIR
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--input-type=module', '-e', SCRIPT_HIJO], { cwd: RAIZ_AGENT_SERVER, env, timeout: timeoutMs, maxBuffer: 1 << 20 }, (error, stdout, stderr) => {
      if (error) {
        let detalle = ''
        try { detalle = String((JSON.parse(stderr) as { error?: unknown }).error ?? '') } catch { detalle = stderr.trim().split('\n').filter(Boolean).slice(-1).join(' ') }
        reject(new Error(detalle || 'falló el proceso de bifurcación'))
        return
      }
      try {
        const id = (JSON.parse(stdout) as { sessionId?: unknown }).sessionId
        if (typeof id === 'string' && UUID.test(id)) resolve(id)
        else reject(new Error('el SDK no devolvió el id de la copia'))
      } catch { reject(new Error('respuesta ilegible del proceso de bifurcación')) }
    })
  })
}

// ─── Ajustes por conversación ────────────────────────────────────────────────

/** Copia los ajustes (modelo, esfuerzo, rápido, ultracode) de la original a la copia. Lee la tabla v2 directo, sin
 *  `read()`: este camino no debe adoptar ajustes legados de una conversación que nadie ha verificado. */
export function copiarAjustes(db: Database.Database, from: ForkScope, to: ForkScope): boolean {
  scopedControls(db) // crea las tablas si faltan
  const fila = db.prepare('SELECT model,effort,fast,ultracode FROM chat_controls_v2 WHERE owner=? AND account=? AND conversation_id=?')
    .get(from.owner, from.account, from.conversationId) as { model: string | null; effort: string | null; fast: number; ultracode: number } | undefined
  if (!fila) return false
  scopedControls(db).patch(to, { key: to.conversationId, verifiedConversation: true },
    { model: fila.model, effort: fila.effort, fast: fila.fast === 1, ultracode: fila.ultracode === 1 })
  return true
}
