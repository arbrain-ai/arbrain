/**
 * Los lienzos recientes (6 oct 2026), para el selector del título (Ctrl+L): los últimos que se abrieron, el más nuevo primero.
 * Vive en el navegador (es comodidad de este aparato, no un dato del lienzo). Lo puro se prueba en tests/canvas/recientes.test.ts.
 */
const CLAVE = 'arbrain.lienzo.recientes'
const MAX = 8

/** `id` al frente, sin repetirse, hasta `max`. */
export const registrarReciente = (lista: readonly string[], id: string, max = MAX): string[] =>
  [id, ...lista.filter(x => x !== id)].slice(0, max)

/** Los recientes que siguen vivos (existen y no están ocultos), sin el que está abierto, hasta `max`. */
export const recientesVisibles = (lista: readonly string[], vivos: ReadonlySet<string>, abierto: string | null, max = 5): string[] =>
  lista.filter(id => id !== abierto && vivos.has(id)).slice(0, max)

export function leerRecientes(): string[] {
  try { const v = JSON.parse(localStorage.getItem(CLAVE) ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [] } catch { return [] }
}
export function guardarReciente(id: string) {
  try { localStorage.setItem(CLAVE, JSON.stringify(registrarReciente(leerRecientes(), id))) } catch { /* sin almacenamiento */ }
}
