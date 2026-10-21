/**
 * Tope de gasto (seguridad del alumno, 12 oct 2026; AUDITORIA punto 3). La app muestra cuánto lleva gastado la llave
 * del alumno y su límite, cuando el proveedor lo permite con una llave normal:
 *
 *   - OpenRouter: `GET https://openrouter.ai/api/v1/key` con `Authorization: Bearer <llave>` devuelve `data.usage`
 *     (créditos usados en total), `usage_daily|weekly|monthly`, `limit` (null = sin límite), `limit_remaining` y
 *     `limit_reset` (doc oficial: openrouter.ai/docs/api-reference/limits, consultada el 12 oct 2026). El límite por
 *     llave se pone en openrouter.ai/settings/keys.
 *   - Anthropic: con una API key normal no hay endpoint de gasto (el de uso y costo es de la Admin API, con otra llave
 *     que no pedimos). El límite se pone en la consola (Settings › Billing › Spend limits:
 *     platform.claude.com/settings/billing) y el gasto se ve en platform.claude.com/usage. La app solo enlaza.
 *
 * Nunca devuelve la llave ni la escribe en ningún registro. Instalación de Daniel: no se usa.
 */
import { secreto } from './cofre.js'

export const ENLACES_GASTO = {
  openrouterLlaves: 'https://openrouter.ai/settings/keys',
  openrouterCreditos: 'https://openrouter.ai/settings/credits',
  anthropicLimite: 'https://platform.claude.com/settings/billing',
  anthropicUso: 'https://platform.claude.com/usage',
} as const

export interface GastoOpenRouter {
  usado: number
  usadoHoy: number | null
  usadoSemana: number | null
  usadoMes: number | null
  limite: number | null
  restante: number | null
  reinicio: string | null
  gratis: boolean
}

export interface RespuestaGasto {
  openrouter: { conectada: boolean; gasto: GastoOpenRouter | null; error: string | null }
  anthropic: { conectada: boolean; gastoDisponible: false }
  enlaces: typeof ENLACES_GASTO
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Traduce la respuesta oficial de `/api/v1/key` (pura). */
export function leerRespuestaOpenRouter(j: unknown): GastoOpenRouter | null {
  const d = (j && typeof j === 'object' ? (j as { data?: unknown }).data : null) as Record<string, unknown> | null
  if (!d || typeof d !== 'object') return null
  return {
    usado: num(d.usage) ?? 0, usadoHoy: num(d.usage_daily), usadoSemana: num(d.usage_weekly), usadoMes: num(d.usage_monthly),
    limite: num(d.limit), restante: num(d.limit_remaining), reinicio: typeof d.limit_reset === 'string' ? d.limit_reset : null,
    gratis: d.is_free_tier === true,
  }
}

let cache: { t: number; r: RespuestaGasto } | null = null

export async function consultarGasto(f: typeof fetch = fetch, ahora = Date.now()): Promise<RespuestaGasto> {
  if (cache && ahora - cache.t < 60_000) return cache.r
  const llaveOr = secreto('OPENROUTER_API_KEY')
  const r: RespuestaGasto = {
    openrouter: { conectada: !!llaveOr, gasto: null, error: null },
    anthropic: { conectada: !!secreto('ANTHROPIC_API_KEY'), gastoDisponible: false },
    enlaces: ENLACES_GASTO,
  }
  if (llaveOr) {
    try {
      const res = await f('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${llaveOr}` }, signal: AbortSignal.timeout(8_000) })
      if (res.ok) r.openrouter.gasto = leerRespuestaOpenRouter(await res.json())
      else r.openrouter.error = res.status === 401 ? 'OpenRouter no reconoce la llave.' : `OpenRouter respondió ${res.status}.`
    } catch { r.openrouter.error = 'No se pudo consultar OpenRouter (¿sin internet?).' }
  }
  cache = { t: ahora, r }
  return r
}

/** Solo pruebas. */
export function _gastoParaPruebas(): void { cache = null }
