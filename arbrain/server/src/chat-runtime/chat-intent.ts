import type { ChatOverrides } from '../db.js'
import type { CodexSelection } from './codex-pool.js'
import type { ClaudeSelection } from './claude-selection.js'
import { esCuentaChat } from '../modelos/registro.js'

export type IntentScope = { owner: string; account: string; conversationId: string | null }
export interface ChatIntent extends IntentScope {
  version: 1
  model: string
  effort: string | null
  fast: boolean
  ultracode: boolean
  observedAt: string
}
type Selection = CodexSelection | ClaudeSelection
type Resolver = (overrides: ChatOverrides) => Promise<Selection>
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 512 && value.trim() === value

/** This is user intent, not a trusted capability grant. Authorize its scope at
 * the proxy, then resolve every requested option again before acceptance. */
export function parseChatIntent(value: unknown, scope: IntentScope): ChatIntent {
  const v = value as Partial<ChatIntent> | null
  if (!v || v.version !== 1 || !nonempty(v.owner) || !esCuentaChat(v.account)
    || !(v.conversationId === null || nonempty(v.conversationId)) || !nonempty(v.model)
    || !(v.effort === null || nonempty(v.effort)) || typeof v.fast !== 'boolean' || typeof v.ultracode !== 'boolean'
    || typeof v.observedAt !== 'string' || !Number.isFinite(Date.parse(v.observedAt))) throw new Error('La selección guardada está incompleta; confirma los ajustes antes de enviar.')
  if (v.owner !== scope.owner || v.account !== scope.account || v.conversationId !== scope.conversationId) throw new Error('La selección guardada pertenece a otra cuenta o conversación.')
  return { version: 1, owner: v.owner, account: v.account, conversationId: v.conversationId, model: v.model, effort: v.effort, fast: v.fast, ultracode: v.ultracode, observedAt: v.observedAt }
}
export const intentOverrides = (intent: ChatIntent): ChatOverrides => ({ model: intent.model, effort: intent.effort, fast: intent.fast, ultracode: intent.ultracode })
function resolvedControls(selection: Selection): ChatOverrides {
  if ('serviceTier' in selection) {
    if (!['default', 'priority'].includes(selection.serviceTier)) throw new Error('El tier del runtime no se puede representar en los controles actuales.')
    return { model: selection.model, effort: selection.effort, fast: selection.serviceTier === 'priority', ultracode: false }
  }
  return { model: selection.model, effort: selection.effort, fast: selection.fast, ultracode: selection.ultracode }
}
const same = (a: ChatOverrides, b: ChatOverrides) => a.model === b.model && a.effort === b.effort && a.fast === b.fast && a.ultracode === b.ultracode

/** Capture one coherent, effective selection. No account default stays implicit. */
export async function captureChatIntent(scope: IntentScope, read: () => ChatOverrides, resolve: Resolver): Promise<ChatIntent> {
  const before = { ...read() }
  const selection = await resolve(before)
  if (!same(before, read())) throw new Error('Los ajustes cambiaron durante la consulta. Vuelve a confirmarlos.')
  return parseChatIntent({ ...scope, version: 1, ...resolvedControls(selection), observedAt: new Date().toISOString() }, scope)
}

/** A new default or alias must not reinterpret an offline selection. Metadata
 * may change; the concrete model, effort and flags must still match exactly. */
export async function resolveChatIntent(intent: ChatIntent, explicitEffort: unknown, resolve: Resolver): Promise<Selection> {
  if (explicitEffort != null && explicitEffort !== intent.effort) throw new Error('El esfuerzo del mensaje no coincide con su selección guardada.')
  const requested = intentOverrides(intent)
  const selection = await resolve(requested)
  if (!same(requested, resolvedControls(selection))) throw new Error('El runtime ya no confirma la selección guardada. No se cambiará de modelo ni esfuerzo.')
  return selection
}
