import { describe, expect, it } from 'vitest'
import { formatGoal, goalView, parseGoalCommand } from './chat-goal.js'
describe('goal command', () => {
  it('parses the verbs and treats anything else as the objective', () => {
    expect(parseGoalCommand('/goal')).toEqual({ action: 'status' })
    expect(parseGoalCommand('/goal status')).toEqual({ action: 'status' })
    expect(parseGoalCommand('/goal pausa')).toEqual({ action: 'pause' })
    expect(parseGoalCommand('/goal resume')).toEqual({ action: 'resume' })
    expect(parseGoalCommand('/goal clear')).toEqual({ action: 'clear' })
    expect(parseGoalCommand('/goal Cuenta hasta 3 y termina')).toEqual({ action: 'set', objective: 'Cuenta hasta 3 y termina' })
  })
  it('normalises the runtime goal and formats it without inventing fields', () => {
    const view = goalView({ goal: { threadId: 't', objective: 'X', status: 'paused', tokenBudget: null, tokensUsed: 1500, timeUsedSeconds: 120, createdAt: 1, updatedAt: 2 } })
    expect(view).toEqual({ objective: 'X', status: 'paused', tokenBudget: null, tokensUsed: 1500, timeUsedSeconds: 120, updatedAt: 2 })
    expect(formatGoal(view)).toContain('**Estado:** en pausa')
    expect(formatGoal(view)).toContain('1.5K tokens · 2 min')
    expect(goalView(null)).toBeNull()
    expect(formatGoal(null)).toContain('ninguno')
  })
})
