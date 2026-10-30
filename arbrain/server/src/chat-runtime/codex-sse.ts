import type { SSEEvent } from '../agent.js'
import type { RuntimeItem, RuntimeUpdate } from './codex-events.js'

/** Transitional projection for existing clients. native_update remains the lossless contract. */
export class CodexSseProjection {
  private items = new Map<string, RuntimeItem>()
  private rendered = new Map<string, string>()
  private toolStarted = new Map<string, number>()
  private thinking = new Set<string>()
  private lastMessage: string | undefined
  private usageBaseline: Record<string, number> | null = null
  constructor(private model: string, private startedAt = Date.now(), private effort: string | null = null) {}

  apply(update: RuntimeUpdate): SSEEvent[] {
    const events: SSEEvent[] = [{ type: 'native_update', update }]
    if (update.type === 'item') {
      const item = update.item
      this.items.set(item.id, structuredClone(item))
      if (item.kind === 'agentMessage' || item.kind === 'reasoning') {
        if (item.kind === 'reasoning' && item.status === 'running' && !this.thinking.has(item.id)) {
          this.thinking.add(item.id); events.push({ type: 'thinking_start' })
        }
        const previous = this.rendered.get(item.id) ?? ''
        // Full lifecycle items may contain text missing from streamed deltas.
        // A changed prefix is reconciled by native_update, never appended twice.
        if (item.text.startsWith(previous)) events.push(...this.render(item, item.text.slice(previous.length)))
        this.rendered.set(item.id, item.text)
        if (item.kind === 'reasoning' && item.status !== 'running' && this.thinking.delete(item.id) && !this.thinking.size) events.push({ type: 'thinking_stop' })
      } else if (this.toolName(item)) {
        if (!this.toolStarted.has(item.id)) {
          this.toolStarted.set(item.id, Date.now())
          events.push({ type: 'tool_start', toolId: item.id, toolName: this.toolName(item)! },
            { type: 'tool_input_delta', toolId: item.id, partial: JSON.stringify(item.data.arguments ?? item.data) })
        }
        if (item.status !== 'running') {
          const data = item.data
          const output = data.aggregatedOutput ?? data.result ?? data.output ?? data.error ?? data.changes ?? data
          events.push({ type: 'tool_result', toolId: item.id, content: typeof output === 'string' ? output : JSON.stringify(output), isError: item.status === 'failed', durationMs: typeof data.durationMs === 'number' ? data.durationMs : Date.now() - this.toolStarted.get(item.id)! }, { type: 'tool_done', toolId: item.id })
        }
      }
    } else if (update.type === 'delta') {
      const item = this.items.get(update.itemId)
      if (item && update.field === 'text') {
        item.text += update.delta
        this.rendered.set(item.id, (this.rendered.get(item.id) ?? '') + update.delta)
        events.push(...this.render(item, update.delta))
      }
    } else if (update.type === 'usage') {
      const { last, total } = update.usage
      // The first usage notification belongs to the first model call in this
      // fully observed turn. Remove previous turns once, then use monotonic totals.
      // Subsequent duplicate notifications do not add usage again.
      this.usageBaseline ??= Object.fromEntries(Object.entries(total).filter(([key]) => typeof last[key] === 'number').map(([key, value]) => [key, value - last[key]]))
      const turnCount = (key: string) => typeof this.usageBaseline?.[key] === 'number' && typeof total[key] === 'number' && total[key] >= this.usageBaseline[key]
        ? total[key] - this.usageBaseline[key] : last[key] ?? 0
      events.push({ type: 'usage', costUsd: 0, inputTokens: turnCount('inputTokens'), outputTokens: turnCount('outputTokens'),
        durationMs: Date.now() - this.startedAt, numTurns: 1, model: this.model,
        contextUsed: last.totalTokens, contextTotal: update.usage.contextWindow ?? undefined,
        ...(this.effort ? { effort: this.effort } : {}), engine: 'codex' })
    } else if (update.type === 'model') {
      this.model = update.to
      events.push({ type: 'model_changed', model: update.to, resolved: update.to })
    } else if (update.type === 'terminal') {
      if (this.thinking.size) { this.thinking.clear(); events.push({ type: 'thinking_stop' }) }
      const text = [...this.items.values()].filter(item => item.kind === 'agentMessage').map(item => item.text).filter(Boolean).join('\n\n')
      if (update.status === 'failed') {
        // Legacy clients save every result as success and replace errors with it.
        // Preserve the partial text in the error until they consume native state.
        const reason = update.error ?? 'El motor no confirmó la finalización.'
        events.push({ type: 'error', message: text ? `${reason}\n\nRespuesta parcial:\n${text}` : reason })
      } else {
        if (update.status === 'interrupted') events.push({ type: 'interrupt' })
        events.push({ type: 'result', text, terminalReason: update.status })
      }
    }
    return events
  }

  private render(item: RuntimeItem, delta: string): SSEEvent[] {
    if (!delta) return []
    if (item.kind === 'reasoning') return [{ type: 'thinking_delta', text: delta }]
    if (item.kind !== 'agentMessage') return []
    const prefix = this.lastMessage && this.lastMessage !== item.id ? '\n\n' : ''
    this.lastMessage = item.id
    return [{ type: 'text_delta', text: prefix + delta }]
  }

  private toolName(item: RuntimeItem): string | undefined {
    switch (item.kind) {
      case 'commandExecution': return 'Bash'
      case 'fileChange': return 'Edit'
      case 'mcpToolCall': return `mcp__${String(item.data.server ?? 'mcp')}__${String(item.data.tool ?? 'tool')}`
      case 'dynamicToolCall': return String(item.data.tool ?? 'Tool')
      case 'webSearch': return 'WebSearch'
      case 'imageGeneration': return 'ImageGeneration'
      case 'imageView': return 'ViewImage'
      case 'collabAgentToolCall': return 'Agent'
      default: return undefined
    }
  }
}
