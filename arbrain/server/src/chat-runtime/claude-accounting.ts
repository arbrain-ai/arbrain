/** SDK modelUsage/total_cost_usd are cumulative for a persistent Query. A
 * resumed/reconfigured Query starts a fresh counter; /clear may reset it.
 * These are estimates over the query pipeline, never subscription charges.
 */
export class ClaudeQueryAccounting {
  private previousCost = 0
  private previousModels: Record<string, Record<string, number>> = {}
  observe(event: Record<string, unknown>) {
    const currentCost = Number(event.total_cost_usd ?? 0)
    const models = event.modelUsage as Record<string, Record<string, number>> | undefined
    const delta = (current: number, previous: number) => Math.max(0, current >= previous ? current - previous : current)
    const estimatedCostUsd = delta(currentCost, this.previousCost)
    this.previousCost = currentCost
    let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0
    for (const [name, model] of Object.entries(models ?? {})) {
      const previous = this.previousModels[name] ?? {}
      inputTokens += delta(Number(model.inputTokens ?? 0), Number(previous.inputTokens ?? 0))
      outputTokens += delta(Number(model.outputTokens ?? 0), Number(previous.outputTokens ?? 0))
      cacheReadTokens += delta(Number(model.cacheReadInputTokens ?? 0), Number(previous.cacheReadInputTokens ?? 0))
      cacheWriteTokens += delta(Number(model.cacheCreationInputTokens ?? 0), Number(previous.cacheCreationInputTokens ?? 0))
    }
    this.previousModels = structuredClone(models ?? {})
    return { estimatedCostUsd, cumulativeEstimatedCostUsd: currentCost, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, scope: 'query_since_previous_result', kind: 'estimate' }
  }
}
