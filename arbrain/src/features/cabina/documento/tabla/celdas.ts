/** Referencias de celda de Excel, sin dependencias (las usa también el modelo, que no carga el lector de .xlsx). */

/** «AB12» → { c: 27, r: 11 } (base cero). */
export function referencia(ref: string): { c: number; r: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref)
  if (!m) return null
  let c = 0
  for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64)
  return { c: c - 1, r: Number(m[2]) - 1 }
}
/** 0 → A, 25 → Z, 26 → AA. */
export function letraColumna(i: number): string {
  let s = '', n = i + 1
  while (n > 0) { const k = (n - 1) % 26; s = String.fromCharCode(65 + k) + s; n = Math.floor((n - 1) / 26) }
  return s
}
