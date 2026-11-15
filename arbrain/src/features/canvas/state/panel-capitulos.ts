/**
 * El minipanel de capítulos (13 nov 2026, Daniel: «un minipanel a la derecha inferior con todo esto, así es más fácil
 * leer con lista vertical normal… mejores prácticas de progressive disclosure»). Lo puro: qué temas se ven abiertos y
 * si el panel está plegado (se recuerda POR DISPOSITIVO, como lo demás de «Mostrar en el lienzo»).
 */

export const CLAVE_PANEL = 'arbrain.lienzo.capitulos-plegado'

/**
 * Los temas abiertos cuando cambia el tema activo: SOLO el activo (los demás se pliegan, lo que abriste a mano se
 * cierra al viajar). Sin tema activo (vista completa) se conserva lo que estaba.
 */
export function abiertosAlCambiar(antes: ReadonlySet<number>, activo: number | null): Set<number> {
  return activo == null ? new Set(antes) : new Set([activo])
}

/**
 * Tocar el nombre de un tema en el panel lo abre o lo pliega. El tema activo queda abierto: es el ancla de lectura;
 * los toggles son para asomar los otros temas sin perder dónde estás.
 */
export function alternar(abiertos: ReadonlySet<number>, k: number, activo: number | null = null): Set<number> {
  const s = new Set(abiertos)
  if (k === activo) return s.add(k)
  if (s.has(k)) s.delete(k); else s.add(k)
  return s
}

/** Lo guardado: «1» plegado, «0» abierto; sin guardar, plegado solo en pantallas angostas (el teléfono). */
export function leerPlegado(angosto: boolean): boolean {
  try {
    const v = localStorage.getItem(CLAVE_PANEL)
    if (v === '1') return true
    if (v === '0') return false
  } catch { /* sin almacenamiento */ }
  return angosto
}

export function guardarPlegado(plegado: boolean): void {
  try { localStorage.setItem(CLAVE_PANEL, plegado ? '1' : '0') } catch { /* sin almacenamiento: vale por esta sesión */ }
}
