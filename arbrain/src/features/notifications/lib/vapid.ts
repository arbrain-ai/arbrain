import webpush from 'web-push'
import { instalacion } from '@/config'

// Init perezoso: el build no truena si faltan las claves VAPID (lo comparten /api/notifications/send y /prueba).
let vapidLista = false
export function prepararVapid(): boolean {
  if (vapidLista) return true
  const publicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim()
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? '').trim()
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(`mailto:${(process.env.VAPID_EMAIL ?? instalacion().correoDueno).trim()}`, publicKey, privateKey)
  vapidLista = true
  return true
}
