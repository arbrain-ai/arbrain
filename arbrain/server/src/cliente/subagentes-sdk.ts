/**
 * Subagentes en la edición cliente (29 oct 2026, fundador en Windows: «No tengo la herramienta de crear subagentes»).
 *
 * Red team A1 cerró `mcp__cabina__delegar` en cliente porque lanza procesos de CLI APARTE (PTY del motor o proceso sin
 * pantalla): ese proceso no lleva los ganchos programáticos de la guardia ni el `canUseTool` del daemon, así que sus
 * herramientas correrían fuera de la política y de I8. Eso sigue igual: `delegar`, `retomar`, `detener`,
 * `interactivo` y `cerrar` siguen ocultos y negados en cliente.
 *
 * Lo que se abre es el subagente del propio SDK (`Agent`, alias viejo `Task`): corre DENTRO del mismo proceso del CLI
 * que la conversación, con la misma sesión. Verificado contra el SDK 0.3.295 con una corrida real (29 oct 2026):
 *   · cada herramienta del subagente dispara los ganchos PreToolUse y PostToolUse de la sesión con el MISMO
 *     `session_id` y un `agent_id` propio (primer plano y segundo plano);
 *   · lo que pide permiso llega al MISMO `canUseTool` con `agentID`; un `deny` ahí deja al subagente sin ejecutar;
 *   · el modo de permisos se hereda (el gancho lo recibe en `permission_mode`).
 * Así el subagente queda bajo la MISMA guardia que el chat: misma política (`decidirHerramienta`), mismo modo de la
 * persona, mismas tarjetas en su hilo (la tarjeta sale con el `session_id` de la conversación) y la misma marca de
 * «leyó contenido de afuera» (es la misma sesión: lo que lea el subagente endurece al chat y al revés). En rutinas el
 * gancho es el de la rutina (`origen: 'cron'`): lo que pida clic queda en la cola, como hoy.
 *
 * Lo que el subagente del SDK podría pedir y que saldría de esa guardia se niega aquí:
 *   · `isolation: "remote"` corre en la nube, fuera de esta máquina; `isolation: "worktree"` hace git por dentro del CLI
 *     (no por Bash), sin tarjeta. Ninguno: el subagente trabaja en la carpeta de la conversación.
 *   · `subagent_type` de una definición propia (`.claude/agents/*.md`, plugins): su frontmatter puede cambiar el modo de
 *     permisos, los MCP o los ganchos del subagente. Solo los tipos integrados.
 *   · `mode` distinto del de la conversación (el SDK dice que lo ignora; se niega por si deja de hacerlo).
 * Y en `guardia-agentes.ts` el gancho no delega al clasificador del SDK una llamada que no corre en modo `auto` (un
 * subagente con otro modo no tendría quien la revise): sube a la tarjeta.
 *
 * `ARBRAIN_SUBAGENTES=0` los apaga en cliente (vuelven a `disallowedTools` y la política los niega).
 */

/** Tipos de subagente integrados del CLI que el alumno puede usar. Sin frontmatter propio: heredan todo del chat. */
export const TIPOS_SUBAGENTE_CLIENTE = new Set(['general-purpose', 'Explore', 'Plan'])

/** Herramientas del ciclo de vida de un subagente del SDK: no actúan fuera de la conversación. */
export const HERRAMIENTAS_CICLO_SUBAGENTE = new Set(['SubagentHandback', 'SendMessage'])

export const SUBAGENTES_SDK_CLIENTE = ['Agent', 'Task'] as const

/** ¿Los subagentes del SDK están encendidos en cliente? Por defecto sí. */
export const subagentesClienteEncendidos = (env: NodeJS.ProcessEnv = process.env) => env.ARBRAIN_SUBAGENTES !== '0'

export const MENSAJE_SUBAGENTES_APAGADOS = 'los subagentes están apagados en esta instalación (ARBRAIN_SUBAGENTES=0); haz el trabajo tú en esta conversación'

/** Motivo para negar una llamada a `Agent`/`Task` en cliente, o null si puede correr bajo la guardia. Pura. */
export function motivoSubagenteCliente(input: unknown, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!subagentesClienteEncendidos(env)) return MENSAJE_SUBAGENTES_APAGADOS
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (i.isolation !== undefined && i.isolation !== null) return 'en esta edición el subagente trabaja en la carpeta de la conversación, bajo tu misma guardia: lánzalo sin isolation'
  if (i.mode !== undefined && i.mode !== null && i.mode !== 'default') return 'el subagente hereda el modo de permisos de la conversación: lánzalo sin mode'
  const tipo = i.subagent_type
  if (tipo !== undefined && tipo !== null && (typeof tipo !== 'string' || !TIPOS_SUBAGENTE_CLIENTE.has(tipo))) {
    return `en esta edición solo hay subagentes integrados (${[...TIPOS_SUBAGENTE_CLIENTE].join(', ')}); una definición propia puede cambiar sus permisos`
  }
  return null
}
