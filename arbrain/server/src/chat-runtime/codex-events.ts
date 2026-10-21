import type { RpcNotification } from './codex-rpc.js'

export interface RuntimeItem {
  id: string
  kind: string
  status: 'running' | 'completed' | 'failed'
  text: string
  phase?: string
  data: Record<string, unknown>
}
export interface RuntimeUsage {
  contextWindow: number | null
  last: Record<string, number>
  total: Record<string, number>
}
export interface RuntimeTurnSnapshot {
  threadId: string
  turnId: string
  status: 'running' | 'completed' | 'failed' | 'interrupted'
  items: RuntimeItem[]
  usage: RuntimeUsage | null
  servedModel: string | null
  error: string | null
}
export type RuntimeUpdate =
  | { type: 'item'; item: RuntimeItem }
  | { type: 'delta'; itemId: string; field: 'text' | 'output'; delta: string }
  | { type: 'usage'; usage: RuntimeUsage }
  | { type: 'model'; from: string; to: string; reason: unknown }
  | { type: 'progress'; itemId: string; message: string }
  | { type: 'terminal'; status: RuntimeTurnSnapshot['status']; error: string | null }
  | { type: 'warning'; message: string }

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown): string => typeof value === 'string' ? value : ''
const numericFields = (value: unknown): Record<string, number> => Object.fromEntries(Object.entries(object(value)).filter((pair): pair is [string, number] => typeof pair[1] === 'number' && Number.isFinite(pair[1])))

/** Per native turn. Emits deltas immediately and reconciles full items without duplicating text.
 * Does not retry, change provider configuration, or infer context from cumulative input usage.
 */
export class CodexTurnReducer {
  private items = new Map<string, RuntimeItem>()
  private status: RuntimeTurnSnapshot['status'] = 'running'
  private usage: RuntimeUsage | null = null
  private servedModel: string | null = null
  private error: string | null = null
  constructor(readonly threadId: string, readonly turnId: string) {}

  snapshot(): RuntimeTurnSnapshot {
    return structuredClone({ threadId: this.threadId, turnId: this.turnId, status: this.status, items: [...this.items.values()], usage: this.usage, servedModel: this.servedModel, error: this.error })
  }

  apply(notification: RpcNotification): RuntimeUpdate[] {
    const p = notification.params
    if (p.threadId !== this.threadId) return []
    const eventTurn = p.turnId ?? object(p.turn).id
    if (eventTurn !== this.turnId || this.status !== 'running') return []
    switch (notification.method) {
      case 'item/started': return this.upsert(object(p.item), false)
      case 'item/completed': return this.upsert(object(p.item), true)
      case 'item/agentMessage/delta': return this.delta(text(p.itemId), 'agentMessage', 'text', text(p.delta))
      case 'item/plan/delta': return this.delta(text(p.itemId), 'plan', 'text', text(p.delta))
      case 'item/reasoning/summaryTextDelta': return this.delta(text(p.itemId), 'reasoning', 'text', text(p.delta))
      case 'item/reasoning/summaryPartAdded': {
        const item = this.items.get(text(p.itemId))
        return item?.text ? this.delta(item.id, 'reasoning', 'text', '\n\n') : []
      }
      // Only provider-supplied summaries are exposed; raw reasoning content is not a UI artifact.
      case 'item/reasoning/textDelta': return []
      case 'item/commandExecution/outputDelta': return this.delta(text(p.itemId), 'commandExecution', 'output', text(p.delta))
      case 'item/fileChange/outputDelta': return this.delta(text(p.itemId), 'fileChange', 'output', text(p.delta))
      case 'item/mcpToolCall/progress': return [{ type: 'progress', itemId: text(p.itemId), message: text(p.message) }]
      case 'thread/tokenUsage/updated': {
        const usage = object(p.tokenUsage)
        this.usage = {
          contextWindow: typeof usage.modelContextWindow === 'number' && usage.modelContextWindow > 0 ? usage.modelContextWindow : null,
          last: numericFields(usage.last), total: numericFields(usage.total),
        }
        return [{ type: 'usage', usage: structuredClone(this.usage) }]
      }
      case 'model/rerouted': {
        this.servedModel = text(p.toModel) || null
        return [{ type: 'model', from: text(p.fromModel), to: text(p.toModel), reason: p.reason }]
      }
      case 'turn/completed': {
        const turn = object(p.turn)
        const updates: RuntimeUpdate[] = []
        // Some runtimes finish short items without delivering their intermediate lifecycle.
        for (const item of Array.isArray(turn.items) ? turn.items : []) updates.push(...this.upsert(object(item), true))
        this.status = turn.status === 'completed' ? 'completed' : turn.status === 'interrupted' ? 'interrupted' : 'failed'
        this.error = text(object(turn.error).message) || (this.status === 'failed' ? 'El runtime terminó sin confirmar éxito.' : null)
        updates.push({ type: 'terminal', status: this.status, error: this.error })
        return updates
      }
      case 'error': {
        const message = text(object(p.error).message) || text(p.message)
        // Runtime errors can be retry advisories. Only turn/completed determines terminal state.
        return message ? [{ type: 'warning', message }] : []
      }
      default: return []
    }
  }

  private delta(id: string, kind: string, field: 'text' | 'output', delta: string): RuntimeUpdate[] {
    if (!id || !delta) return []
    const updates: RuntimeUpdate[] = []
    let item = this.items.get(id)
    if (!item) {
      item = { id, kind, status: 'running', text: '', data: {} }
      this.items.set(id, item)
      updates.push({ type: 'item', item: structuredClone(item) })
    }
    if (item.status !== 'running') return []
    if (field === 'text') item.text += delta
    else item.data.output = text(item.data.output) + delta
    updates.push({ type: 'delta', itemId: id, field, delta })
    return updates
  }

  private upsert(raw: Record<string, unknown>, completed: boolean): RuntimeUpdate[] {
    const id = text(raw.id), kind = text(raw.type)
    if (!id || !kind) return []
    const existing = this.items.get(id)
    if (existing?.status !== undefined && existing.status !== 'running') return []
    const data = { ...raw }
    delete data.id; delete data.type
    if (kind === 'reasoning') delete data.content
    let content = existing?.text ?? ''
    if (typeof raw.text === 'string') content = completed || !existing ? raw.text : existing.text
    if (kind === 'reasoning' && Array.isArray(raw.summary) && (completed || !existing)) content = raw.summary.filter(s => typeof s === 'string').join('\n\n')
    if (!completed && existing) Object.assign(data, { ...existing.data, ...data })
    const failed = raw.status === 'failed' || raw.status === 'declined' || raw.success === false || (typeof raw.exitCode === 'number' && raw.exitCode !== 0) || !!raw.failure
    const item: RuntimeItem = { id, kind, status: completed ? failed ? 'failed' : 'completed' : 'running', text: content, ...(typeof raw.phase === 'string' ? { phase: raw.phase } : {}), data }
    this.items.set(id, item)
    return [{ type: 'item', item: structuredClone(item) }]
  }
}
