/**
 * Pestañas en el teléfono (6 oct 2026): la parte PURA, sin React ni stores (tests/panel/telefono-pestanas.test.ts).
 * El hook que la une con los stores vive en telefono-pestanas.ts.
 */
import { pestanaActiva } from './pestanas-fuera'

/** Mantener presionada una pestaña (ms) y cuánto puede moverse el dedo (px) antes de contar como desplazamiento. */
export const LARGA_MS = 450
export const LARGA_MOVIMIENTO = 8

export type VistaTelefono = { tipo: 'chat' } | { tipo: 'pestana'; clave: string }

/**
 * Qué muestra el teléfono. Con el panel «abierto» y al menos una pestaña, la activa (o la primera si la activa ya no
 * existe); sin pestañas o con el panel cerrado, el chat.
 */
export function vistaTelefono(abierto: boolean, claves: string[], activa: string): VistaTelefono {
  if (!abierto) return { tipo: 'chat' }
  const clave = pestanaActiva(activa, claves)
  return clave ? { tipo: 'pestana', clave } : { tipo: 'chat' }
}

/**
 * Reabrir la app en el teléfono (10 oct 2026, Daniel: «lo primero es el chat, una conversación nueva, nunca un panel»).
 * Volver tras `REAPERTURA_MS` o más en segundo plano cuenta como abrirla otra vez; un vistazo corto a otra app (copiar un
 * código, contestar un mensaje) no, para no perder lo que se estaba leyendo.
 */
export const REAPERTURA_MS = 2 * 60_000
export const esReapertura = (ocultaDesde: number | null, ahora: number) => ocultaDesde !== null && ahora - ocultaDesde >= REAPERTURA_MS

/** ¿Cuenta como «mantener presionado»? Quieto (sin pasar el límite de movimiento) y desde hace `LARGA_MS`. */
export const esMantenido = (ms: number, dx: number, dy: number) => ms >= LARGA_MS && Math.hypot(dx, dy) <= LARGA_MOVIMIENTO
