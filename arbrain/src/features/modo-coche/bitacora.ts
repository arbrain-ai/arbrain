/**
 * La bitácora del modo coche: cada cambio de fase, toque y decisión queda en memoria (los últimos 300), para entender
 * qué pasó si un día «deja de escuchar». Nunca guarda audio ni lo que dijiste o lo que te respondieron: solo la fase, el
 * evento y números. No sale de tu navegador. Para verla, en la consola: `window.__modoCoche`.
 */

export type EventoCoche = { ev: string; fase?: string; de?: string; vista?: string; ms?: number; n?: number }

const TOPE = 300
const eventos: Array<EventoCoche & { en: string }> = []

export function anotar(e: EventoCoche): void {
  if (typeof window === 'undefined') return
  eventos.push({ ...e, en: new Date().toISOString() })
  if (eventos.length > TOPE) eventos.splice(0, eventos.length - TOPE)
  ;(window as unknown as { __modoCoche?: typeof eventos }).__modoCoche = eventos
}

/** Al cerrar el modo coche: una marca para separar sesiones. */
export function vaciar(): void {
  anotar({ ev: 'fin-sesion' })
}
