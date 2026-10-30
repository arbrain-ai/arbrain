import { instalacion } from '@/config'
import { esEdicionCliente } from '@/lib/edicion'
/**
 * URL base del sitio, saneada.
 *
 * NEXT_PUBLIC_SITE_URL en Vercel llego a tener un newline literal al final:
 * el JSON de los endpoints draw3 devolvia `"url": "https://...\n/draw3/..."`
 * y rompia a cualquier consumidor (jq, agentes). Trim + validacion de scheme
 * con fallback al dominio canonico.
 */
export function siteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim()
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw.replace(/\/+$/, '')
  }
  if (esEdicionCliente()) {
    // Edición cliente (red team L1, 11 oct 2026): nunca el puerto del autor (3218). La web corre en el puerto que eligió
    // la app; si no llega, error claro en vez de enlaces que apuntan a otra instalación.
    const puerto = (process.env.PORT ?? '').trim()
    if (/^\d{2,5}$/.test(puerto)) return `http://127.0.0.1:${puerto}`
    throw new Error('Falta el origen de la web: la app debe pasar NEXT_PUBLIC_SITE_URL o PORT al servidor web.')
  }
  return instalacion().urlSitio || 'http://127.0.0.1:3218'
}
