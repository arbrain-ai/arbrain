import { accessSync, constants, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { esEdicionCliente } from '../edicion.js'
import { readEnvFile } from '../env.js'
import { MOTOR_DIR } from './motor.js'

/** ¿Va el MCP «editor» en los turnos del chat? Sí donde el motor está instalado; `LEVY_EDITOR_MCP=0` lo apaga sin tocar código. */
export function editorHabilitado(env: NodeJS.ProcessEnv = process.env): boolean {
  if (esEdicionCliente(env)) return false
  const v = env.LEVY_EDITOR_MCP ?? readEnvFile(['LEVY_EDITOR_MCP']).LEVY_EDITOR_MCP
  if (v === '0' || v === 'false') return false
  try { accessSync(path.join(MOTOR_DIR(), 'bin/mcp-levy'), constants.X_OK); return true } catch { return false }
}

/**
 * Config MCP (JSON puro) del editor de video para el runtime de Claude, como la Cabina. `conversationId` es estable entre
 * turnos: no cambia la firma del pool. Fuera de la instalación original o sin motor: null.
 */
export function editorMcpConfig(conversationId?: string): { type: 'stdio'; command: string; args: string[]; env: Record<string, string> } | null {
  if (!editorHabilitado()) return null
  const env: Record<string, string> = { ARBRAIN_EDITOR_CONVERSACION: conversationId ?? 'sin-conversacion' }
  for (const k of ['EDITOR_MOTOR_DIR', 'EDITOR_MOTOR_URL', 'EDITOR_MOTOR_TOKEN_FILE', 'EDITOR_MCP_TODAS', 'ARBRAIN_CONFIG_DIR']) if (process.env[k]) env[k] = process.env[k]!
  const compiled = fileURLToPath(new URL('./mcp-stdio.js', import.meta.url))
  if (existsSync(compiled)) return { type: 'stdio', command: process.execPath, args: [compiled], env }
  const source = fileURLToPath(new URL('./mcp-stdio.ts', import.meta.url))
  if (existsSync(source)) return { type: 'stdio', command: process.execPath, args: ['--import', 'tsx', source], env }
  return null
}
