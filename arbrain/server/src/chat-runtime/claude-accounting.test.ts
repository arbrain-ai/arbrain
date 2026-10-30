import { describe, it, expect } from 'vitest'
import { ClaudeQueryAccounting } from './claude-accounting.js'
describe('persistent SDK query accounting', () => {
  it('separates cumulative query estimates, interval tokens, cache and a counter reset', () => {
    const accounting = new ClaudeQueryAccounting()
    const result = (cost: number, input: number, output: number, cache: number) => ({ total_cost_usd: cost, modelUsage: { opus: { inputTokens: input, outputTokens: output, cacheReadInputTokens: cache, contextWindow: 200_000 } } })
    expect(accounting.observe(result(3, 20, 5, 100))).toMatchObject({ estimatedCostUsd: 3, inputTokens: 20, cacheReadTokens: 100 })
    expect(accounting.observe(result(5, 24, 8, 210))).toMatchObject({ estimatedCostUsd: 2, cumulativeEstimatedCostUsd: 5, inputTokens: 4, outputTokens: 3, cacheReadTokens: 110 })
    expect(accounting.observe(result(1, 4, 2, 5))).toMatchObject({ estimatedCostUsd: 1, inputTokens: 4, outputTokens: 2, cacheReadTokens: 5, kind: 'estimate' })
  })
})
