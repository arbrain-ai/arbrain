/**
 * ¿Puede este dispositivo recibir notificaciones de Arbrain y qué le falta? (12 oct 2026)
 *
 * Puro (sin window): el hook le pasa el entorno y Ajustes › Notificaciones pinta el estado. Patrón tomado de la sección
 * de notificaciones de la web de la comunidad (12 oct) y adaptado a Arbrain.
 *
 * iOS/iPadOS solo entrega Web Push a una PWA INSTALADA en la pantalla de inicio (16.4+). En Safari normal ni siquiera
 * existe `PushManager`, así que el estado correcto no es «no soportado» sino «instálala primero».
 */

export type PermisoPush = 'default' | 'granted' | 'denied'

export type EstadoPush =
  | 'sin-configurar' // el build no trae la clave VAPID pública
  | 'no-soportado' // navegador sin Web Push (y no es un iPhone que pueda instalar), p. ej. la app de escritorio
  | 'ios-actualizar' // iOS anterior a 16.4: no hay Web Push
  | 'ios-instalar' // iOS 16.4+ en Safari: hay que agregarla a la pantalla de inicio
  | 'navegador-interno' // dentro de Instagram/WhatsApp/etc.: abrir en Safari
  | 'bloqueado' // permiso denegado: solo se cambia en los ajustes del sistema
  | 'listo' // un toque activa
  | 'activo' // suscrito en este dispositivo y registrado en el servidor
  | 'en-computadora' // edición cliente en 127.0.0.1 (la app o el navegador de la computadora): se activan en el teléfono

export interface EntornoPush {
  userAgent: string
  maxTouchPoints?: number
  /** PWA instalada (display-mode standalone o navigator.standalone). */
  instalada: boolean
  tieneNotification: boolean
  tieneServiceWorker: boolean
  tienePushManager: boolean
  permiso: PermisoPush
  /** Hay suscripción en el navegador Y el servidor la tiene a nombre de quien tiene la sesión. */
  suscrito: boolean
  vapidConfigurada: boolean
  /**
   * Edición cliente abierta en la computadora (127.0.0.1): ahí no hay service worker (cachearía la app de escritorio) y
   * los avisos son para el teléfono, que entra por la dirección de Tailscale (HTTPS). v0.2.18.
   */
  enComputadora?: boolean
}

/** ¿Este hostname es la propia computadora? */
export const esHostLocal = (h: string) => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(h.toLowerCase())

export interface Plataforma {
  ios: boolean
  /** [mayor, menor] o null si no se pudo leer. */
  versionIos: [number, number] | null
  navegadorInterno: boolean
  android: boolean
}

const NAVEGADORES_INTERNOS = /(FBAN|FBAV|Instagram|Line\/|LinkedInApp|TikTok|Twitter|WhatsApp|GSA\/)/i

export function detectarPlataforma(userAgent: string, maxTouchPoints = 0): Plataforma {
  const ua = userAgent || ''
  // iPadOS 13+ se presenta como Mac; lo delata la pantalla táctil.
  const ipadComoMac = /Macintosh/.test(ua) && maxTouchPoints > 1
  const ios = /iPhone|iPad|iPod/.test(ua) || ipadComoMac
  let versionIos: [number, number] | null = null
  if (ios) {
    const m = ua.match(/OS (\d+)[_.](\d+)/)
    if (m) versionIos = [Number(m[1]), Number(m[2])]
    else {
      // iPad en modo escritorio: la versión de Safari sigue a la de iOS.
      const v = ua.match(/Version\/(\d+)\.(\d+)/)
      if (v) versionIos = [Number(v[1]), Number(v[2])]
    }
  }
  return { ios, versionIos, navegadorInterno: NAVEGADORES_INTERNOS.test(ua), android: /Android/i.test(ua) }
}

function iosConWebPush(version: [number, number] | null): boolean {
  if (!version) return true // sin versión legible, no bloquear: que lo intente
  const [mayor, menor] = version
  return mayor > 16 || (mayor === 16 && menor >= 4)
}

export function estadoPush(e: EntornoPush): EstadoPush {
  if (e.enComputadora) return 'en-computadora'
  if (!e.vapidConfigurada) return 'sin-configurar'
  const p = detectarPlataforma(e.userAgent, e.maxTouchPoints)

  if (p.ios) {
    if (!iosConWebPush(p.versionIos)) return 'ios-actualizar'
    if (!e.instalada) return p.navegadorInterno ? 'navegador-interno' : 'ios-instalar'
  }

  const soportado = e.tieneNotification && e.tieneServiceWorker && e.tienePushManager
  if (!soportado) return p.navegadorInterno ? 'navegador-interno' : 'no-soportado'
  if (e.permiso === 'denied') return 'bloqueado'
  if (e.suscrito && e.permiso === 'granted') return 'activo'
  return 'listo'
}

/** Una línea de estado bajo el título de la sección. */
export function resumenEstado(estado: EstadoPush | 'cargando'): string {
  switch (estado) {
    case 'cargando': return 'Revisando este dispositivo…'
    case 'activo': return 'Activas en este dispositivo'
    case 'listo': return 'Apagadas en este dispositivo'
    case 'ios-instalar':
    case 'navegador-interno': return 'En iPhone funcionan con Arbrain en tu pantalla de inicio'
    case 'bloqueado': return 'Bloqueadas en este dispositivo'
    case 'ios-actualizar': return 'Tu iPhone necesita iOS 16.4 o más'
    case 'no-soportado': return 'Este dispositivo no recibe notificaciones'
    case 'sin-configurar': return 'Todavía no están disponibles en este servidor'
    case 'en-computadora': return 'Se activan en tu teléfono'
  }
}

/** La clave pública de una suscripción existente, en base64url sin relleno (para detectar una clave VAPID vieja). */
export function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (const b of arr) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** ¿La suscripción del navegador se hizo con otra clave VAPID? Entonces subscribe() fallaría: hay que reemplazarla. */
export function claveDistinta(previa: ArrayBuffer | null | undefined, vapidPublica: string): boolean {
  if (!previa || !vapidPublica) return false
  return base64Url(previa) !== vapidPublica.trim().replace(/=+$/, '')
}

/** Errores del navegador (en inglés y técnicos) a algo que se entienda. */
export function mensajeDeError(e: unknown): string {
  const nombre = (e as { name?: unknown } | null)?.name
  const texto = e instanceof Error ? e.message : ''
  if (nombre === 'NotAllowedError' || /permission denied/i.test(texto)) {
    return 'El teléfono no dejó activar las notificaciones. Revisa el permiso de Arbrain en Ajustes y vuelve a intentar.'
  }
  if (nombre === 'AbortError' || /push service/i.test(texto)) {
    return 'Este navegador no tiene servicio de notificaciones ahora. Intenta desde Arbrain en tu pantalla de inicio.'
  }
  if (nombre === 'InvalidStateError') return 'Hay una activación vieja en este dispositivo. Desactiva y vuelve a activar.'
  return texto && /[áéíóúñ¿]/i.test(texto) ? texto : 'No se pudo activar. Intenta de nuevo en un momento.'
}
