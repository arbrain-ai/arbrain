import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

/** Config MCP (JSON puro) del servidor de la Cabina para el runtime de Claude. */
/** `scope` = la conversación (sin turno): estable entre turnos, así no cambia la firma del pool. Con ella
 * la herramienta `despertador` sabe a qué conversación pertenece lo que Levy programa. */
export function cabinaMcpConfig(scope?: { owner: string; account: string; conversationId: string }): { type: 'stdio'; command: string; args: string[]; env?: Record<string, string> } | null {
  const env: Record<string, string> = {}
  if (scope) env.ARBRAIN_CABINA_SCOPE = JSON.stringify({ owner: scope.owner, account: scope.account, conversationId: scope.conversationId })
  // Servidores de prueba: el MCP de la Cabina debe hablar con SU store, SU motor y SU registro, nunca con los reales.
  for (const k of ['CLAUDECLAW_STORE_DIR', 'ARBRAIN_MOTOR_SOCK', 'ARBRAIN_CONFIG_DIR', 'CABINA_SIN_RESPALDO_GATE']) if (process.env[k]) env[k] = process.env[k]!
  const extra = Object.keys(env).length ? { env } : {}
  const compiled = fileURLToPath(new URL('./mcp-stdio.js', import.meta.url))
  if (existsSync(compiled)) return { type: 'stdio', command: process.execPath, args: [compiled], ...extra }
  const source = fileURLToPath(new URL('./mcp-stdio.ts', import.meta.url))
  if (existsSync(source)) return { type: 'stdio', command: process.execPath, args: ['--import', 'tsx', source], ...extra }
  return null
}

/**
 * Config MCP del servidor de manos para el chat de la app en la edición cliente (0.1.2): mismo Node que el daemon
 * (embebido) y su `dist`, como la Cabina. El `.mcp.json` del cerebro apunta a `.bin/tsx`, que en Windows no arranca.
 * Fuera de la edición cliente o donde computer use no existe (Linux): null.
 */
export function manosMcpConfig(): { type: 'stdio'; command: string; args: string[]; env: Record<string, string> } | null {
  const env: Record<string, string> = { ARBRAIN_EDICION: 'cliente' }
  for (const k of ['ARBRAIN_CONFIG_DIR', 'MANOS_CASA_APP', 'MANOS_BITACORA_DIR', 'MANOS_ENCARGOS_DIR', 'MC_SERVER_PORT']) if (process.env[k]) env[k] = process.env[k]!
  const compiled = fileURLToPath(new URL('../manos/mcp-stdio.js', import.meta.url))
  if (existsSync(compiled)) return { type: 'stdio', command: process.execPath, args: [compiled], env }
  const source = fileURLToPath(new URL('../manos/mcp-stdio.ts', import.meta.url))
  if (existsSync(source)) return { type: 'stdio', command: process.execPath, args: ['--import', 'tsx', source], env }
  return null
}
