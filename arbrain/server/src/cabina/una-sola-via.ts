/**
 * Una sola vía para subagentes, impuesta en código (27 oct 2026, BRECHA §2 y 1:3:1 #2 opción B).
 *
 * Hasta hoy la regla «todo lo largo pasa por `delegar`» vivía solo en el prompt: Levy podía lanzar `Agent`/`Task` del
 * SDK (corren dentro del turno y mueren con él o con un compacto; así nacieron los agentes fantasma del 26 oct) y
 * escribir un `Workflow` en cualquier turno. Aquí:
 *
 *  · `Agent` y `Task` quedan fuera del chat de Levy (lista `disallowedTools`). La lista no cambia entre turnos, así
 *    que la firma de la sesión del pool no se mueve por esto.
 *  · `Workflow` solo cuando el mensaje lleva «ultracode» (o la conversación tiene /ultracode encendido), igual que
 *    resalta ChatPanel.tsx (`hasUltracodeWord`). No se hace con `disallowedTools`: cambiar la lista por mensaje
 *    reabriría la sesión y, con un workflow corriendo en segundo plano, el siguiente turno esperaría a que terminara.
 *    Va como gancho PreToolUse (corre también en bypassPermissions) que consulta el permiso del turno EN CURSO de esa
 *    conversación: el turno lo marca al empezar.
 *
 * ARBRAIN_UNA_SOLA_VIA=0 lo apaga (reversa sin deploy).
 */
import type { HookCallbackMatcher, HookInput, SyncHookJSONOutput } from '@anthropic-ai/claude-agent-sdk'

export const SUBAGENTES_SDK = ['Agent', 'Task'] as const
export const WORKFLOW = 'Workflow'

export const viaUnicaActiva = (env: NodeJS.ProcessEnv = process.env) => env.ARBRAIN_UNA_SOLA_VIA !== '0'

/** «ultracode» como palabra (mismo criterio que `hasUltracodeWord` del chat) o el modo /ultracode de la conversación. */
export function pideUltracode(mensaje: string, standing = false): boolean {
  return standing || /\bultracode\b/i.test(mensaje)
}

/** Lo que el chat de Levy no puede usar. `durable` = turno del chat vivo (journal). Crons y síntesis tienen su lista. */
export function herramientasProhibidasChat(o: { durable: boolean; env?: NodeJS.ProcessEnv }): string[] {
  return [
    // Chat vivo (3 oct 2026): los crons nativos de sesión no son durables (mueren con el proceso y el corredor se retira
    // a los 30 min). Levy usa mcp__cabina__despertador, que sí sobrevive.
    ...(o.durable ? ['CronCreate', 'CronDelete', 'CronList', 'ScheduleWakeup'] : []),
    'mcp__claude_ai_Google_Calendar__*',
    'mcp__claude_ai_Gmail__*',
    'mcp__claude_ai_Google_Drive__*',
    // Una sola vía (27 oct 2026): lo largo va por mcp__cabina__delegar, que sobrevive a compactos y reinicios.
    ...(viaUnicaActiva(o.env) ? SUBAGENTES_SDK : []),
  ]
}

export const MENSAJE_WORKFLOW = 'Workflow solo corre cuando el mensaje de la persona dice «ultracode». Para trabajo largo o en paralelo usa mcp__cabina__delegar (una sola vía: sobrevive a compactos y reinicios y se ve en el Taller).'

// Permiso del turno en curso, por conversación. El gancho vive en la sesión del pool (nace con el primer turno), por eso
// no puede cerrar sobre el mensaje: lee de aquí.
const permisoWorkflow = new Map<string, boolean>()
export function marcarTurno(clave: string, mensaje: string, standing = false): void {
  permisoWorkflow.set(clave, pideUltracode(mensaje, standing))
  if (permisoWorkflow.size > 500) permisoWorkflow.delete(permisoWorkflow.keys().next().value!)
}
export const workflowPermitido = (clave: string) => permisoWorkflow.get(clave) === true

/** Gancho PreToolUse que niega `Workflow` (y, por si la lista no se aplicara, `Agent`/`Task`) fuera de ultracode. */
export function ganchoViaUnica(clave: string): HookCallbackMatcher {
  return {
    matcher: [WORKFLOW, ...SUBAGENTES_SDK].join('|'),
    hooks: [async (input: HookInput): Promise<SyncHookJSONOutput> => {
      if (input.hook_event_name !== 'PreToolUse') return { continue: true }
      const negar = (permissionDecisionReason: string): SyncHookJSONOutput => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason } })
      if ((SUBAGENTES_SDK as readonly string[]).includes(input.tool_name)) return negar('Agent/Task no están disponibles en el chat: usa mcp__cabina__delegar (una sola vía).')
      if (input.tool_name === WORKFLOW && !workflowPermitido(clave)) return negar(MENSAJE_WORKFLOW)
      return { continue: true }
    }],
  }
}

/** Suma el gancho a los del turno sin pisar los demás. Con la vía única apagada, devuelve los ganchos tal cual. */
export function conViaUnica<T extends { PreToolUse?: HookCallbackMatcher[] }>(hooks: T, clave: string | null, env: NodeJS.ProcessEnv = process.env): T {
  if (!clave || !viaUnicaActiva(env)) return hooks
  return { ...hooks, PreToolUse: [ganchoViaUnica(clave), ...(hooks.PreToolUse ?? [])] }
}
