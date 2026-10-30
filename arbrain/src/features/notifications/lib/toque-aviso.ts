/**
 * Tocar una notificación (18 oct 2026, Daniel: «me llegó la noti pero no a la conversación»). La parte PURA, sin React
 * (tests/notificaciones/toque-aviso.test.ts); la conecta `useReabrirEnChat` (cabina/panel/telefono-pestanas.ts).
 *
 * Un push suele tocarse después de minutos con la app en segundo plano, y en el teléfono volver tras `REAPERTURA_MS` abre
 * una conversación nueva. Si el mensaje del service worker («abre esta conversación») llegaba antes que el
 * `visibilitychange`, la reapertura lo pisaba con un chat vacío. El toque manda: la reapertura no corre si hubo uno reciente.
 */

/** Mensajes del service worker que significan «Daniel tocó una notificación» (public/sw.js, `notificationclick`). */
export const MENSAJES_DE_TOQUE = ['notificacion-tocada', 'open-chat-session', 'abrir-url'] as const

/** Cuánto tiempo un toque frena la reapertura en chat nuevo. Holgado: iOS entrega los mensajes al reanudar la página. */
export const TOQUE_VIGENTE_MS = 15_000

export type MensajeSW = { type?: unknown; url?: unknown; sessionId?: unknown; messageId?: unknown } | null | undefined

export const esMensajeDeToque = (m: MensajeSW) => typeof m?.type === 'string' && (MENSAJES_DE_TOQUE as readonly string[]).includes(m.type)

/** ¿Hubo un toque hace poco? Entonces volver a la app es ir a donde apunta la notificación, no a un chat nuevo. */
export const toqueReciente = (ultimoToque: number, ahora: number) => ultimoToque > 0 && ahora - ultimoToque >= 0 && ahora - ultimoToque < TOQUE_VIGENTE_MS

/**
 * `abrir-url`: el service worker no pudo navegar la ventana (iOS no siempre deja `client.navigate`) y le pide a la página
 * que vaya ella. Solo rutas del mismo origen y distintas de la actual; devuelve la ruta a abrir o null.
 */
export function rutaDeToque(m: MensajeSW, origen: string, actual: string): string | null {
  if (m?.type !== 'abrir-url' || typeof m.url !== 'string') return null
  try {
    const u = new URL(m.url, origen)
    if (u.origin !== origen) return null
    const ruta = u.pathname + u.search + u.hash
    return ruta === actual ? null : ruta
  } catch {
    return null
  }
}
