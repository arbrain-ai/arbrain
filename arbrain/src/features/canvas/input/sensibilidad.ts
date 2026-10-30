/**
 * Canvas v4 — sensibilidad de la rueda (5 oct 2026).
 *
 * Daniel: «configuración dinámica de la velocidad del scroll horizontal/vertical y del zoom con cursor».
 * Dos multiplicadores, nada más: PANEO (dos dedos, rueda, ⇧+rueda) y ZOOM (pellizco, ⌘+rueda). 1 = el
 * comportamiento por defecto, que ya imita a Figma. Es preferencia del APARATO (un trackpad y un ratón
 * piden cosas distintas), así que vive en localStorage y no en el documento.
 */

export interface Sensibilidad { paneo: number; zoom: number }

const LLAVE = 'arbrain.lienzo.sensibilidad'
export const SENSIBILIDAD_POR_DEFECTO: Sensibilidad = { paneo: 1, zoom: 1 }
export const SENSIBILIDAD_MIN = 0.25
export const SENSIBILIDAD_MAX = 3

const acotar = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(SENSIBILIDAD_MAX, Math.max(SENSIBILIDAD_MIN, v)) : 1

let actual: Sensibilidad | null = null

export function leerSensibilidad(): Sensibilidad {
  if (actual) return actual
  let guardada: Partial<Sensibilidad> = {}
  try { guardada = JSON.parse(localStorage.getItem(LLAVE) ?? '{}') ?? {} } catch { /* sin almacenamiento */ }
  actual = { paneo: acotar(guardada.paneo ?? 1), zoom: acotar(guardada.zoom ?? 1) }
  return actual
}

export function guardarSensibilidad(s: Partial<Sensibilidad>): Sensibilidad {
  actual = { ...leerSensibilidad(), ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, acotar(v)])) }
  try { localStorage.setItem(LLAVE, JSON.stringify(actual)) } catch { /* sin almacenamiento: vale en esta sesión */ }
  return actual
}

/** Multiplica el desplazamiento en px de un paneo con rueda o trackpad. */
export const factorPaneo = () => leerSensibilidad().paneo

/** Exponente sobre el factor de zoom de la rueda: 2 = el doble de zoom por el mismo gesto. */
export const factorZoom = () => leerSensibilidad().zoom

/** Solo para pruebas: olvida lo leído. */
export function _olvidarSensibilidad(): void { actual = null }
