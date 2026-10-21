import type { RuntimeModel } from './codex-pool.js'

/** Request this account's advertised capacity; usage events remain the UI's truth.
 * Supply it on start/resume/fork. App Server applies load-time config when the
 * thread is first loaded; rejoining an already loaded thread retains its config.
 * Leave headroom below the runtime's effective window for automatic compaction.
 */
export function codexContextConfig(model: RuntimeModel): Record<string, number> | undefined {
  const windows = [model.contextWindow, model.maxContextWindow]
    .filter((n): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0)
  if (!windows.length) return undefined
  const window = Math.max(...windows)
  const effective = model.effectiveContextPercent
  const compactPercent = typeof effective === 'number' && effective > 0 && effective <= 100
    ? Math.min(90, effective * 0.95) : 90
  return {
    model_context_window: window,
    model_auto_compact_token_limit: Math.max(1, Math.floor(window * compactPercent / 100)),
  }
}
