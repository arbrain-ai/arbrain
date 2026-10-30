/**
 * `/goal` en una conversación OpenAI se mapea al objetivo nativo del App Server
 * (`thread/goal/set|get|clear`): persiste en el hilo del host y el runtime
 * reporta estado, tokens y tiempo. En Claude `/goal` es un comando NATIVO de
 * Claude Code ("sigue trabajando hasta cumplir la condición"): el servidor no lo
 * intercepta y viaja como prompt al SDK (ver `interceptsGoal`).
 */
export type GoalAction = { action: 'status' } | { action: 'set'; objective: string } | { action: 'pause' } | { action: 'resume' } | { action: 'clear' } | { action: 'help' }
export interface ThreadGoalView { objective: string; status: string; tokenBudget: number | null; tokensUsed: number; timeUsedSeconds: number; updatedAt: number }

/** Solo Codex/API conserva el manejo local; en Claude el mensaje llega intacto al SDK. */
export function interceptsGoal(message: string, codexAccount: boolean): boolean {
  return codexAccount && /^\/goal(\s|$)/i.test(message)
}

export function parseGoalCommand(text: string): GoalAction {
  const rest = text.trim().replace(/^\/goal\b/i, '').trim()
  if (!rest || /^(status|estado)$/i.test(rest)) return { action: 'status' }
  if (/^(pause|pausa|pausar)$/i.test(rest)) return { action: 'pause' }
  if (/^(resume|reanudar|continuar)$/i.test(rest)) return { action: 'resume' }
  if (/^(clear|cancel|cancelar|borrar|quitar)$/i.test(rest)) return { action: 'clear' }
  if (/^(help|ayuda|\?)$/i.test(rest)) return { action: 'help' }
  return { action: 'set', objective: rest }
}

export function goalView(payload: unknown): ThreadGoalView | null {
  const root = (payload ?? {}) as Record<string, unknown>
  const goal = (root.goal ?? root) as Record<string, unknown>
  if (!goal || typeof goal.objective !== 'string' || typeof goal.status !== 'string') return null
  return {
    objective: goal.objective, status: goal.status,
    tokenBudget: typeof goal.tokenBudget === 'number' ? goal.tokenBudget : null,
    tokensUsed: typeof goal.tokensUsed === 'number' ? goal.tokensUsed : 0,
    timeUsedSeconds: typeof goal.timeUsedSeconds === 'number' ? goal.timeUsedSeconds : 0,
    updatedAt: typeof goal.updatedAt === 'number' ? goal.updatedAt : 0,
  }
}

const STATUS_ES: Record<string, string> = { active: 'activo', paused: 'en pausa', blocked: 'bloqueado (necesita tu dirección)', usageLimited: 'detenido por cuota', budgetLimited: 'detenido por presupuesto de tokens', complete: 'completado' }
const fmtTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)

export function formatGoal(goal: ThreadGoalView | null, heading = 'Objetivo de esta conversación'): string {
  if (!goal) return `**${heading}:** ninguno.\n\nUsa \`/goal <objetivo>\` para fijar uno; \`/goal status\`, \`/goal pause\`, \`/goal resume\`, \`/goal clear\`.`
  const lines = [`**${heading}**`, '', `**Estado:** ${STATUS_ES[goal.status] ?? goal.status}`, `**Objetivo:** ${goal.objective}`, `**Consumo:** ${fmtTokens(goal.tokensUsed)} tokens · ${Math.round(goal.timeUsedSeconds / 60)} min${goal.tokenBudget ? ` · presupuesto ${fmtTokens(goal.tokenBudget)}` : ''}`]
  lines.push('', 'El objetivo vive en el hilo nativo de OpenAI y sobrevive a cerrar el teléfono. Los turnos que el runtime inicie por sí mismo para avanzarlo se consultan con `/goal status`; el chat solo proyecta los turnos que tú envías.')
  return lines.join('\n')
}

export const GOAL_HELP = 'Comandos: `/goal <objetivo>` fija o reemplaza el objetivo del hilo · `/goal status` · `/goal pause` · `/goal resume` · `/goal clear`. Objetivo nativo del hilo de OpenAI (thread/goal). En Claude, `/goal` lo ejecuta Claude Code.'
export const GOAL_NO_THREAD = 'Esta conversación aún no tiene hilo nativo en OpenAI. Envía un primer mensaje y vuelve a intentar `/goal`.'
