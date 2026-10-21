import { createHash, randomBytes } from 'node:crypto'
import { siteUrl } from '@/lib/site-url'
import type { Conexion } from './modelo'

/**
 * Salud multiusuario, lado servidor (5 oct 2026). El token de ingesta solo escribe salud; nunca abre la cuenta.
 * Se guarda su sha256 y se muestra completo una sola vez, al generarlo.
 */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
export const nuevoToken = () => `arb_salud_${randomBytes(24).toString('base64url')}`
export const pistaDe = (token: string) => token.slice(-4)

/**
 * La URL a la que el iPhone manda sus envíos. Una dirección local (127.0.0.1, localhost) no le sirve al teléfono:
 * primero SALUD_INGEST_URL, luego el sitio público (en el Studio, el Funnel), luego el host público por el que llegó
 * la petición. Si nada es público, se devuelve la local y la pantalla lo dice.
 */
const esLocal = (u: string) => /\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(u)
export function urlIngest(origen?: string | null): string {
  const propia = (process.env.SALUD_INGEST_URL ?? '').trim()
  if (/^https?:\/\//.test(propia)) return propia.replace(/\/+$/, '')
  const base = siteUrl()
  const publica = !esLocal(base) ? base : origen && !esLocal(origen) ? origen.replace(/\/+$/, '') : base
  return `${publica}/api/salud/ingest`
}
export const urlEsLocal = (u: string) => esLocal(u)

/** El origen público con el que llegó una petición (el Funnel pone x-forwarded-host). */
export function origenDe(request: Request): string | null {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!host) return null
  const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '')
  return `${proto}://${host}`
}

export interface FilaConexion { token_pista: string; ultimo_envio: string | null; ultimo_envio_muestras: number | null; ultimo_error: string | null }
export const conexionDe = (fila: FilaConexion | null, origen?: string | null): Conexion => ({
  tieneToken: !!fila, pista: fila?.token_pista ?? null, ultimoEnvio: fila?.ultimo_envio ?? null,
  muestras: fila?.ultimo_envio_muestras ?? null, error: fila?.ultimo_error ?? null, url: urlIngest(origen),
})

/** El token de un envío: `Authorization: Bearer …` (lo recomendado) o `?k=` (como el receptor del Studio). */
export function tokenDe(request: Request): string | null {
  const h = request.headers.get('authorization') ?? ''
  const t = /^Bearer\s+(\S+)$/i.exec(h)?.[1] ?? new URL(request.url).searchParams.get('k')
  return t && t.length >= 20 && t.length <= 200 ? t : null
}
