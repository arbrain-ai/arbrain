/**
 * Proveedor del motor de Claude en la edición cliente (BYOK; contrato §4). Dos vías, en este orden:
 *   1. `ANTHROPIC_API_KEY` (API de Anthropic) → 'anthropic'
 *   2. solo `OPENROUTER_API_KEY` → 'openrouter': el CLI de Claude habla con la API compatible con Anthropic de
 *      OpenRouter (`ANTHROPIC_BASE_URL=https://openrouter.ai/api`, la llave como `ANTHROPIC_AUTH_TOKEN`) y los ids
 *      de modelo se traducen a los de OpenRouter (`anthropic/claude-sonnet-4.5`).
 * Sin vía de suscripción (decisión del autor, 12 oct 2026): un `CLAUDE_CODE_OAUTH_TOKEN` o un `ANTHROPIC_AUTH_TOKEN`
 * suelto no cuentan como llave (el cofre ni los acepta). Instalación de Daniel: nada de esto se aplica (solo lo llama
 * cliente/arranque.ts).
 */
export type ProveedorClaude = 'anthropic' | 'openrouter'

export const OPENROUTER_ANTHROPIC_BASE = 'https://openrouter.ai/api'
/** Modelos por defecto vía OpenRouter (sonnet verificado por el coordinador, 11 oct). Cada uno se puede fijar por variable. */
export const MODELOS_OPENROUTER_DEFECTO = {
  sonnet: 'anthropic/claude-sonnet-4.5',
  opus: 'anthropic/claude-opus-4.1',
  haiku: 'anthropic/claude-haiku-4.5',
} as const

const tiene = (env: NodeJS.ProcessEnv, k: string) => typeof env[k] === 'string' && env[k]!.trim().length > 0
const esOpenRouter = (env: NodeJS.ProcessEnv) => env.ARBRAIN_PROVEEDOR_CLAUDE === 'openrouter' || (env.ANTHROPIC_BASE_URL ?? '').includes('openrouter.ai')

/** Qué vía usa el chat de Claude con este entorno, o null si no hay ninguna llave. Pura. */
export function proveedorClaude(env: NodeJS.ProcessEnv = process.env): ProveedorClaude | null {
  if (esOpenRouter(env)) return tiene(env, 'ANTHROPIC_AUTH_TOKEN') || tiene(env, 'OPENROUTER_API_KEY') ? 'openrouter' : null
  if (tiene(env, 'ANTHROPIC_API_KEY')) return 'anthropic'
  if (tiene(env, 'OPENROUTER_API_KEY')) return 'openrouter'
  return null
}

/**
 * Si la única llave es la de OpenRouter, deja el entorno listo para que el CLI de Claude (que hereda process.env) vaya
 * por OpenRouter. Devuelve el proveedor elegido. Muta `env`.
 */
export function configurarProveedorClaude(env: NodeJS.ProcessEnv = process.env): ProveedorClaude | null {
  const p = proveedorClaude(env)
  if (p !== 'openrouter' || env.ARBRAIN_PROVEEDOR_CLAUDE === 'openrouter') return p
  const llave = env.OPENROUTER_API_KEY!.trim()
  env.ARBRAIN_PROVEEDOR_CLAUDE = 'openrouter'
  env.ANTHROPIC_BASE_URL = OPENROUTER_ANTHROPIC_BASE
  env.ANTHROPIC_AUTH_TOKEN = llave
  env.ANTHROPIC_API_KEY = ''
  const sonnet = env.ARBRAIN_OR_MODELO_SONNET || MODELOS_OPENROUTER_DEFECTO.sonnet
  const opus = env.ARBRAIN_OR_MODELO_OPUS || MODELOS_OPENROUTER_DEFECTO.opus
  const haiku = env.ARBRAIN_OR_MODELO_HAIKU || MODELOS_OPENROUTER_DEFECTO.haiku
  env.ANTHROPIC_DEFAULT_SONNET_MODEL = sonnet
  env.ANTHROPIC_DEFAULT_OPUS_MODEL = opus
  env.ANTHROPIC_DEFAULT_HAIKU_MODEL = haiku
  env.ANTHROPIC_SMALL_FAST_MODEL = haiku
  // Sin modelo explícito, el CLI usa este: el verificado.
  env.ANTHROPIC_MODEL = env.ARBRAIN_OR_MODELO || sonnet
  return 'openrouter'
}

const ALIAS = /^(default|opus|sonnet|haiku|opusplan|best)(\[1m\])?$/i

/**
 * Id de modelo de Claude → id de OpenRouter, solo con el proveedor OpenRouter activo. Los alias (opus, sonnet…) los
 * resuelve el CLI con ANTHROPIC_DEFAULT_*_MODEL; los ids con «/» ya son de OpenRouter. Pura.
 *   claude-sonnet-4-5 · claude-sonnet-4-5-20250929 · claude-opus-5-5[1m] → anthropic/claude-sonnet-4.5 · … · anthropic/claude-opus-5.5
 */
export function modeloParaProveedor(modelo: string | undefined, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!modelo || !esOpenRouter(env)) return modelo
  if (ALIAS.test(modelo) || modelo.includes('/')) return modelo
  const base = modelo.replace(/\[1m\]$/i, '').replace(/-\d{8}$/, '')
  if (!/^claude-/i.test(base)) return modelo
  return `anthropic/${base.replace(/-(\d+)-(\d+)(?=$|-)/, '-$1.$2')}`
}
