/**
 * Carpetas de las cuentas alternas de suscripción (red team 3, A-7; 11 oct 2026). La instalación original corre parte
 * de sus turnos en una segunda cuenta de Claude (`account: 'bro'`, su propio CLAUDE_CONFIG_DIR) y en una segunda cuenta
 * de OpenAI por el Codex CLI (`account: 'yt'`, su propio CODEX_HOME). Qué carpetas son es un dato de esa instalación:
 * vive en `instalacion.json` de su carpeta original (`cuentas_alternas`), que no viaja con la copia del alumno.
 *
 *   - Edición cliente: no existen. Toda función de aquí devuelve null o lista vacía y el daemon rechaza esas cuentas:
 *     ninguna ruta del alumno lleva a la carpeta de otra suscripción.
 *   - Instalación original sin el dato (p. ej. la copia corrida a mano como original): carpetas neutras
 *     (`.claude-alterna`, `.codex-alterna`) para que la cuenta alterna siga siendo una cuenta aislada.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { instalacionOriginal } from './dueno.js'
import { esEdicionCliente } from './edicion.js'

export interface CuentasAlternas { claude?: string; codex?: string; claude_extra?: string[] }

const NEUTRAS = { claude: '.claude-alterna', codex: '.codex-alterna' } as const
/** Solo un nombre de carpeta oculta en HOME: nada de rutas, `..` ni separadores. */
const carpetaValida = (c: unknown): c is string => typeof c === 'string' && /^\.[A-Za-z0-9][A-Za-z0-9._-]{0,40}$/.test(c) && !c.includes('..')

function declaradas(): CuentasAlternas {
  const c = (instalacionOriginal() as { cuentas_alternas?: CuentasAlternas }).cuentas_alternas
  return c && typeof c === 'object' ? c : {}
}

/** Nombre (relativo a HOME) de la carpeta de la cuenta alterna de Claude, o null en cliente. */
export function carpetaClaudeAlterna(env: NodeJS.ProcessEnv = process.env): string | null {
  if (esEdicionCliente(env)) return null
  const c = declaradas().claude
  return carpetaValida(c) ? c : NEUTRAS.claude
}

/** CLAUDE_CONFIG_DIR de la cuenta alterna de Claude (`account: 'bro'`), o null en cliente. */
export function dirClaudeAlterna(env: NodeJS.ProcessEnv = process.env, home = homedir()): string | null {
  const c = carpetaClaudeAlterna(env)
  return c ? join(home, c) : null
}

/** CODEX_HOME de la cuenta alterna de OpenAI (`account: 'yt'`), o null en cliente. */
export function dirCodexAlterna(env: NodeJS.ProcessEnv = process.env, home = homedir()): string | null {
  if (esEdicionCliente(env)) return null
  const c = declaradas().codex
  return join(home, carpetaValida(c) ? c : NEUTRAS.codex)
}

/** Carpetas de Claude (relativas a HOME) donde buscar transcripciones: `.claude` y, fuera de cliente, las alternas. */
export function carpetasClaude(env: NodeJS.ProcessEnv = process.env): string[] {
  const alterna = carpetaClaudeAlterna(env)
  if (!alterna) return ['.claude']
  const extra = (declaradas().claude_extra ?? []).filter(carpetaValida)
  return [...new Set(['.claude', alterna, ...extra])]
}

/** Error que da el daemon cuando alguien pide una cuenta alterna en la edición cliente. */
export const CUENTA_ALTERNA_NO_DISPONIBLE = 'Cuenta no disponible en esta edición.'

/** CLAUDE_CONFIG_DIR para `account: 'bro'`; en cliente lanza (la cuenta no existe). */
export function dirClaudeAlternaO(env: NodeJS.ProcessEnv = process.env): string {
  const d = dirClaudeAlterna(env)
  if (!d) throw new Error(CUENTA_ALTERNA_NO_DISPONIBLE)
  return d
}
