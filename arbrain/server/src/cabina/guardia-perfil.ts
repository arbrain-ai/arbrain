/**
 * Guardia de perfil (29 oct 2026): el gancho PreToolUse que `delegar` le pone a cada subagente de claude y codex.
 *
 * Los dos CLI le pasan por stdin el mismo JSON (`tool_name`, `tool_input`, `cwd`) y aceptan la misma respuesta
 * (`hookSpecificOutput.permissionDecision: "deny"` con su motivo). Corre en cualquier modo de permisos, también en
 * bypass: por eso la lista negra le gana. Nunca pregunta: permitir = no decir nada; bloquear = deny con el motivo, que
 * el agente lee y que queda en su bitácora (`{"arbrain":"bloqueo"}`) para el Taller.
 *
 *   node guardia-perfil.js <perfil> <carpeta> [bitácora]
 *
 * Si algo falla aquí dentro, se bloquea (exit 2): una guardia rota no se vuelve un permiso.
 */
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { DUENO } from '../dueno.js'
import { decidirPerfil, esPerfil, type Perfil } from './perfiles.js'

export interface RespuestaGuardia { codigo: number; salida: string; motivo: string | null }

/** Pura salvo la bitácora: la entrada del gancho → lo que se imprime y el código de salida. */
export function responderGuardia(perfil: Perfil, raiz: string, entrada: string, bitacora?: string): RespuestaGuardia {
  let d: { tool_name?: unknown; tool_input?: unknown }
  try { d = JSON.parse(entrada) } catch { return { codigo: 2, salida: '', motivo: 'la guardia no pudo leer la herramienta' } }
  const herramienta = typeof d.tool_name === 'string' ? d.tool_name : ''
  const motivo = decidirPerfil(perfil, herramienta, d.tool_input, { raiz })
  if (!motivo) return { codigo: 0, salida: '', motivo: null }
  const razon = `Arbrain bloqueó esta acción (${motivo}). No la intentes por otra vía: si de verdad hace falta, dilo en tu respuesta y Levy lo resuelve con ${DUENO}.`
  if (bitacora) { try { appendFileSync(bitacora, JSON.stringify({ arbrain: 'bloqueo', en: Date.now(), herramienta, motivo }) + '\n') } catch { /* la bitácora es aviso, no la guardia */ } }
  return { codigo: 0, salida: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: razon } }), motivo }
}

async function main() {
  const [perfil, raiz, bitacora] = process.argv.slice(2)
  if (!esPerfil(perfil) || !raiz) { process.stderr.write('guardia-perfil: uso <perfil> <carpeta> [bitácora]\n'); process.exit(2) }
  let entrada = ''
  for await (const t of process.stdin) entrada += t
  const r = responderGuardia(perfil, raiz, entrada, bitacora)
  if (r.salida) process.stdout.write(r.salida + '\n')
  if (r.codigo === 2) process.stderr.write(`Arbrain bloqueó esta acción: ${r.motivo}\n`)
  process.exit(r.codigo)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { process.stderr.write(`Arbrain bloqueó esta acción: la guardia falló (${e instanceof Error ? e.message : e})\n`); process.exit(2) })
}
