/**
 * Reposo de la ventana (6 oct 2026, «eficiente»). Arbrain se queda abierta todo el día; con la pestaña oculta
 * o la app en segundo plano no hay nadie mirando, y los sondeos, los bucles de dibujo y las animaciones
 * infinitas seguían gastando CPU y red como si la tuviera enfrente. Los compradores la usarán en laptops
 * modestas, donde eso es batería y ventilador.
 *
 * Tres estados: `activa` (a la vista y con foco), `sin-foco` (a la vista pero Daniel trabaja en otra app) y
 * `oculta` (minimizada, otra pestaña o pantalla apagada). Oculta no sondea; sin foco sondea `FACTOR_SIN_FOCO`
 * veces más lento; al volver, cada quien relee lo que se le hizo viejo (`alVolver`).
 */

export type EstadoVentana = 'activa' | 'sin-foco' | 'oculta'

/** En reposo solo se pausan las animaciones que laten para siempre; las de entrada terminan solas (12 oct 2026). */
export function lateParaSiempre(iteraciones: number | undefined | null): boolean {
  return iteraciones === Infinity
}

/** Sin foco, un sondeo de 1.2 s pasa a ~5 s y uno de 4 s a 16 s: lo vivo sigue llegando, sin martillar. */
export const FACTOR_SIN_FOCO = 4

export function estadoVentana(): EstadoVentana {
  if (typeof document === 'undefined') return 'activa'
  if (document.visibilityState !== 'visible') return 'oculta'
  try { return document.hasFocus() ? 'activa' : 'sin-foco' } catch { return 'activa' }
}

/**
 * ¿Toca releer algo que se sondea cada `cadaMs` y se leyó por última vez en `leidoEn`? Puro: el reloj y el
 * estado entran de fuera. Varios relojes de la misma fuente comparten `leidoEn`, así que entre todos leen
 * una vez por intervalo (el 0.8 absorbe el desfase entre relojes y la latencia de la respuesta).
 */
export function tocaLeer(cadaMs: number, leidoEn: number | undefined, ahora: number, estado: EstadoVentana): boolean {
  if (estado === 'oculta') return false
  const intervalo = estado === 'sin-foco' ? cadaMs * FACTOR_SIN_FOCO : cadaMs
  return ahora - (leidoEn ?? 0) >= intervalo * 0.8
}

/** Atajo con el reloj y el estado de esta ventana. */
export function tocaLeerAhora(cadaMs: number, leidoEn: number | undefined): boolean {
  return tocaLeer(cadaMs, leidoEn, Date.now(), estadoVentana())
}

/** Llama `fn` cuando la ventana vuelve a la vista o recupera el foco. Devuelve la baja. */
export function alVolver(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const visible = () => { if (document.visibilityState === 'visible') fn() }
  window.addEventListener('focus', fn)
  document.addEventListener('visibilitychange', visible)
  return () => { window.removeEventListener('focus', fn); document.removeEventListener('visibilitychange', visible) }
}

/** Avisa cada cambio de estado (con el estado nuevo). Devuelve la baja. */
export function alCambiarEstado(fn: (estado: EstadoVentana) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  let previo = estadoVentana()
  const revisar = () => { const e = estadoVentana(); if (e !== previo) { previo = e; fn(e) } }
  window.addEventListener('focus', revisar)
  window.addEventListener('blur', revisar)
  document.addEventListener('visibilitychange', revisar)
  return () => { window.removeEventListener('focus', revisar); window.removeEventListener('blur', revisar); document.removeEventListener('visibilitychange', revisar) }
}
