'use client'
/**
 * Lado navegador de las notificaciones push (12 oct 2026). Lo usan Ajustes › Notificaciones, el atajo de la campana
 * y la guardia de re-suscripción de PWARegister: un solo camino para activar, comprobar y apagar.
 * El servidor decide el destinatario por la sesión; aquí nunca se manda un userId.
 */
import { claveDistinta, esHostLocal, type EntornoPush, type PermisoPush } from './soportePush'
import { esEdicionCliente } from '@/lib/edicion'

export const VAPID_PUBLICA = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim()

/**
 * La llave pública con la que este navegador se suscribe. En la instalación original viene horneada; en la edición
 * cliente (v0.2.18) cada instalación tiene la suya y la da el servidor (`GET /api/notifications/subscribe` → `clave`).
 */
let claveEnVivo = VAPID_PUBLICA
export const claveVapid = () => claveEnVivo

/** Pide la llave al servidor si no la tiene; devuelve la que haya (vacía = esta instalación no tiene avisos). */
export async function cargarClave(): Promise<string> {
  if (claveEnVivo) return claveEnVivo
  try {
    const res = await fetch('/api/notifications/subscribe?endpoint=', { credentials: 'same-origin', cache: 'no-store' })
    const j = res.ok ? await res.json() as { clave?: unknown } : null
    if (typeof j?.clave === 'string' && /^[A-Za-z0-9_-]{80,100}$/.test(j.clave)) claveEnVivo = j.clave
  } catch { /* sin servidor: se queda vacía y la sección lo dice */ }
  return claveEnVivo
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export const soportaPush = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export function permisoActual(): PermisoPush {
  return typeof Notification === 'undefined' ? 'default' : (Notification.permission as PermisoPush)
}

export function leerEntorno(suscrito: boolean): EntornoPush {
  const nav = navigator as Navigator & { standalone?: boolean }
  const instalada = nav.standalone === true
    || window.matchMedia?.('(display-mode: standalone)').matches === true
    || window.matchMedia?.('(display-mode: fullscreen)').matches === true
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    instalada,
    tieneNotification: 'Notification' in window,
    tieneServiceWorker: 'serviceWorker' in navigator,
    tienePushManager: 'PushManager' in window,
    permiso: permisoActual(),
    suscrito,
    vapidConfigurada: claveEnVivo.length > 0,
    // Edición cliente: en la computadora (127.0.0.1) no hay service worker; los avisos se activan en el teléfono.
    enComputadora: esEdicionCliente() && esHostLocal(location.hostname),
  }
}

const esDevLocal = () => ['localhost', '127.0.0.1'].includes(location.hostname) || location.hostname.startsWith('192.168.')

/** serviceWorker.ready no tiene tope: si el SW no registró, el botón quedaría colgado. */
async function swListo(ms = 8000): Promise<ServiceWorkerRegistration> {
  const existente = await navigator.serviceWorker.getRegistration('/')
  // Mismo registro que PWARegister (en dev local no hay SW a propósito: cachea los chunks de HMR).
  if (!existente && !esDevLocal()) await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('El servicio de notificaciones no arrancó. Cierra Arbrain, ábrelo y vuelve a intentar.')), ms)),
  ])
}

/** La suscripción de este navegador, si hay SW listo (sin esperar de más). */
export async function suscripcionDelNavegador(): Promise<PushSubscription | null> {
  if (!soportaPush()) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  return (await reg?.pushManager.getSubscription()) ?? null
}

async function leerError(res: Response): Promise<string> {
  const j = await res.json().catch(() => null) as { error?: string } | null
  return j?.error || `El servidor respondió ${res.status}`
}

/** Registra la suscripción a nombre de la sesión. Lanza si el servidor no la guardó (antes se ignoraba). */
export async function registrarEnServidor(sub: PushSubscription): Promise<void> {
  const res = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  })
  if (!res.ok) throw new Error(await leerError(res))
  marcarRegistrada(sub.endpoint)
}

export async function estadoEnServidor(endpoint: string): Promise<{ registrada: boolean; dispositivos: number } | null> {
  const res = await fetch(`/api/notifications/subscribe?endpoint=${encodeURIComponent(endpoint)}`, { credentials: 'same-origin', cache: 'no-store' })
  if (!res.ok) return null
  return res.json()
}

/**
 * «Activar notificaciones» en un toque. iOS exige que requestPermission salga directo del toque: va primero, sin awaits
 * antes. Devuelve el permiso final; lanza con un error legible si algo falló después del permiso.
 */
export async function activarEnDispositivo(): Promise<PermisoPush> {
  let permiso = permisoActual()
  if (permiso !== 'granted') permiso = (await Notification.requestPermission()) as PermisoPush
  if (permiso !== 'granted') return permiso
  const clave = await cargarClave()
  if (!clave) throw new Error('Las notificaciones no están configuradas en este servidor.')
  const reg = await swListo()
  // Una suscripción vieja hecha con otra clave VAPID hace fallar subscribe(): se reemplaza.
  const previa = await reg.pushManager.getSubscription()
  if (previa && claveDistinta(previa.options?.applicationServerKey, clave)) await previa.unsubscribe()
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(clave) })
  await registrarEnServidor(sub)
  try { localStorage.removeItem(APAGADO) } catch { /* sin almacenamiento */ }
  return 'granted'
}

/** Apaga este dispositivo: primero el servidor (deja de enviarle), luego el navegador. */
export async function desactivarEnDispositivo(): Promise<void> {
  const sub = await suscripcionDelNavegador()
  if (!sub) return
  const res = await fetch('/api/notifications/subscribe', {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  })
  if (!res.ok) throw new Error(await leerError(res))
  await sub.unsubscribe()
  try { localStorage.removeItem(MARCA); localStorage.setItem(APAGADO, '1') } catch { /* sin almacenamiento */ }
}

export async function pedirPrueba(): Promise<{ ok: boolean; mensaje: string }> {
  try {
    const res = await fetch('/api/notifications/prueba', { method: 'POST', credentials: 'same-origin' })
    const j = await res.json().catch(() => ({})) as { enviadas?: number; error?: string }
    if (res.ok && (j.enviadas ?? 0) > 0) {
      return { ok: true, mensaje: j.enviadas! > 1 ? `Enviada a tus ${j.enviadas} dispositivos. Llega en unos segundos.` : 'Enviada. Llega en unos segundos, también con Arbrain cerrado.' }
    }
    return { ok: false, mensaje: j.error || 'No se pudo enviar la prueba.' }
  } catch {
    return { ok: false, mensaje: 'Sin conexión con Arbrain. Revisa tu internet.' }
  }
}

// Re-registro periódico (guardia de PWARegister): el servidor borra suscripciones que el push service rechaza, y iOS
// revoca en silencio. Con la marca, una suscripción viva se re-confirma cada 12 h sin pedir nada.
const MARCA = 'arbrain:push-registrado'
// «Desactivar» deja el permiso del sistema concedido: sin esta marca la guardia lo re-suscribiría en el siguiente foreground.
const APAGADO = 'arbrain:push-apagado'
export function apagadoAMano(): boolean {
  try { return localStorage.getItem(APAGADO) === '1' } catch { return false }
}
const CADA_MS = 12 * 60 * 60 * 1000
function marcarRegistrada(endpoint: string) {
  try { localStorage.setItem(MARCA, JSON.stringify({ endpoint, en: Date.now() })) } catch { /* sin almacenamiento */ }
}
export function tocaReconfirmar(endpoint: string, ahora = Date.now()): boolean {
  try {
    const m = JSON.parse(localStorage.getItem(MARCA) ?? 'null') as { endpoint?: string; en?: number } | null
    return !m || m.endpoint !== endpoint || !m.en || ahora - m.en > CADA_MS
  } catch { return true }
}
