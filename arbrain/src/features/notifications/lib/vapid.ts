import webpush from 'web-push'
import { instalacion } from '@/config'
import { esEdicionCliente } from '@/lib/edicion'

/**
 * Llaves VAPID de esta instalación. Init perezoso: el build no truena si faltan (lo comparten /api/notifications/send,
 * /prueba y /api/chat/complete).
 *
 * Edición cliente (v0.2.18): cada instalación trae las suyas, que genera el supervisor una vez en `avisos.json`
 * (scripts/servidor/rutas.mjs › llavesVapidNuevas). La pública llega por entorno en tiempo de ejecución
 * (`ARBRAIN_VAPID_PUBLICA`; la de `NEXT_PUBLIC_…` se hornea al compilar y la copia del alumno no la trae) y el
 * navegador la pide en `GET /api/notifications/subscribe`. La privada llega solo por stdin (`VAPID_PRIVATE_KEY`).
 */
let vapidLista = false

/** La llave pública con la que el navegador se suscribe; vacía si esta instalación no tiene avisos. */
export function clavePublicaVapid(env: Record<string, string | undefined> = process.env): string {
  return (env.ARBRAIN_VAPID_PUBLICA ?? '').trim() || (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim()
}

/**
 * Contacto del remitente para el servicio de push (Apple, Google). En la edición cliente no hay correo del dueño:
 * va la página pública del proyecto (Apple pide un `mailto:` o una URL `https:` real; uno de dominio local lo rechaza).
 */
export const SUJETO_VAPID_CLIENTE = 'https://github.com/arbrain-ai/arbrain'

export function sujetoVapid(cliente = esEdicionCliente(), env: Record<string, string | undefined> = process.env): string {
  if (cliente) return SUJETO_VAPID_CLIENTE
  return `mailto:${(env.VAPID_EMAIL ?? instalacion().correoDueno).trim()}`
}

export function prepararVapid(): boolean {
  if (vapidLista) return true
  const publicKey = clavePublicaVapid()
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? '').trim()
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(sujetoVapid(), publicKey, privateKey)
  vapidLista = true
  return true
}
