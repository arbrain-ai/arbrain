/**
 * Rutinas con llave de tope cuando el chat corre con la suscripción (29 oct 2026, «solo en tu servidor»; guía:
 * INSTALAR-NUBE.md y docs/builds/nube-primero-2026-10-29/REPORTE.md).
 *
 * Términos de Anthropic (fuentes primarias, leídas el 29 oct 2026):
 *   - Consumer Terms §3 (vigentes desde el 8 oct 2025): no se accede a los servicios «through automated or non-human
 *     means, whether through a bot, script, or otherwise», salvo con una llave de API o permiso explícito.
 *   - code.claude.com/docs/en/legal-and-compliance: los límites de Pro y Max asumen «ordinary, individual usage»; y no
 *     se impide «an end user from signing in to the unmodified Claude Code binary with their own Claude subscription».
 * Por eso: lo que la persona escribe en el chat puede ir con su cuenta de Claude (motor «Mi Claude Code»,
 * cliente/suscripcion.ts); las rutinas que corren solas, nunca. Hasta hoy, con ese motor las rutinas simplemente no
 * corrían (scheduler.ts › MENSAJE_RUTINAS). Con esto corren por OpenRouter (Haiku 5.5 por defecto) con la llave de la persona, SOLO si esa
 * llave tiene tope de gasto verificado: la marca `<config>/nube-llave.json` que escribe `nube.sh llave` después de
 * preguntarle a OpenRouter (scripts/instalar/nube-llave.mjs). Sin esa marca, todo sigue como antes.
 *
 * El CLI de la rutina no ve la sesión de la persona: va con `CLAUDE_CONFIG_DIR` aislado (`<datos>/claude`, el mismo de
 * una instalación con llave) y la llave como `ANTHROPIC_AUTH_TOKEN` hacia OpenRouter, que en el orden de Claude Code
 * gana a la sesión de suscripción (code.claude.com/docs/en/authentication › Authentication precedence).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { esEdicionCliente } from '../edicion.js'
import { NUNCA_EN_ENTORNO, RUTAS_CREDENCIALES_AJENAS, secreto } from './cofre.js'
import { configurarProveedorClaude } from './proveedor.js'
import { entornoSinApi, motorSuscripcion } from './suscripcion.js'

export const MARCA_TOPE = 'nube-llave.json'
/**
 * Modelo de las rutinas por OpenRouter (Daniel, 29 oct 08:37: «puede ser el modelo de Haiku 5.5, que hoy es bastante
 * bueno para esto de las rutinas»). Id del catálogo vivo de OpenRouter (GET /api/v1/models, 29 oct 2026:
 * US$0.10 / US$0.50 por millón de tokens de entrada / salida). `ARBRAIN_OR_MODELO_RUTINAS` lo cambia.
 */
export const MODELO_RUTINAS = 'anthropic/claude-haiku-5.5'

/** Carpeta de configuración del daemon (la misma que usa arranque.ts). */
export function dirConfig(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.ARBRAIN_CONFIG_DIR || (env.ARBRAIN_DATA_DIR ? join(env.ARBRAIN_DATA_DIR, 'config') : undefined)
}

/** Tope en dólares de la llave verificada por `nube.sh llave`, o null. No lee la llave: solo la marca. */
export function topeVerificado(configDir: string | undefined): number | null {
  if (!configDir) return null
  try {
    const n = Number((JSON.parse(readFileSync(join(configDir, MARCA_TOPE), 'utf8')) as { tope?: unknown }).tope)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch { return null }
}

/**
 * ¿Las rutinas corren por la llave de OpenRouter con tope mientras el chat va con la suscripción? Solo en la edición
 * cliente, con el motor «Mi Claude Code», una llave de OpenRouter en el cofre y su tope verificado.
 */
export function rutinasConLlaveTope(env: NodeJS.ProcessEnv = process.env, llave: string | undefined = secreto('OPENROUTER_API_KEY')): boolean {
  return esEdicionCliente(env) && motorSuscripcion(env) && !!llave?.trim() && topeVerificado(dirConfig(env)) !== null
}

/**
 * Entorno del CLI para una rutina con la llave de tope: el del daemon sin ninguna vía de la suscripción ni de API, más
 * OpenRouter (cliente/proveedor.ts) y la carpeta aislada del CLI. Pura salvo por `llave` (por defecto, el cofre).
 */
export function entornoRutinaConLlave(base: NodeJS.ProcessEnv = process.env, llave: string = secreto('OPENROUTER_API_KEY') ?? ''): Record<string, string> {
  const env = entornoSinApi(base)
  for (const k of [...NUNCA_EN_ENTORNO, ...RUTAS_CREDENCIALES_AJENAS, 'ARBRAIN_MOTOR_CLAUDE']) delete env[k]
  const vista: NodeJS.ProcessEnv = { ...env, OPENROUTER_API_KEY: llave.trim() }
  configurarProveedorClaude(vista)
  delete vista.OPENROUTER_API_KEY
  // Sin modelo explícito (los crons no lo fijan) el CLI usa ANTHROPIC_MODEL; lo rápido y los subagentes «haiku», igual.
  const modelo = (base.ARBRAIN_OR_MODELO_RUTINAS ?? '').trim() || MODELO_RUTINAS
  vista.ANTHROPIC_MODEL = modelo
  vista.ANTHROPIC_DEFAULT_HAIKU_MODEL = modelo
  vista.ANTHROPIC_SMALL_FAST_MODEL = modelo
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(vista)) if (typeof v === 'string') out[k] = v
  if (base.ARBRAIN_DATA_DIR) out.CLAUDE_CONFIG_DIR = join(base.ARBRAIN_DATA_DIR, 'claude')
  out.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = '1'
  out.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR = '1'
  return out
}
