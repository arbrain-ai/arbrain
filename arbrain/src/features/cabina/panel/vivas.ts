/**
 * Pestañas vivas del panel (5 oct 2026). Daniel: «cada que menciono un componente se traba la aplicación entera».
 *
 * MEDIDO (CPU ×4, chat de 234 mensajes, lienzo del Customer Journey en el panel): el panel montaba SOLO la pestaña
 * activa. Cada vez que Levy mostraba algo, la vista anterior se destruía y la nueva nacía desde cero: el calendario
 * rehacía FullCalendar entero (≈220 ms de tarea larga, también la segunda vez) y volver al lienzo volvía a medir el
 * texto de sus 532 elementos (≈170-230 ms). Como en Chrome, las últimas pestañas vistas se quedan montadas y ocultas:
 * volver a una es mostrarla, no reconstruirla.
 */

/** Cuántas vistas fijadas quedan montadas (la activa incluida). Lo demás se desmonta como antes. */
export const VIVAS_MAX = 4

/**
 * Las vistas que siguen montadas tras ver `activa`: la activa primero, luego las recientes, sin las que ya no
 * existen en este panel. `activa` puede no ser una fijada (Tareas, Taller): entonces solo se depuran las demás.
 */
export function vivasTras(previas: readonly string[], activa: string | null, existentes: readonly string[], max = VIVAS_MAX): string[] {
  const hay = new Set(existentes)
  const orden = activa && hay.has(activa) ? [activa, ...previas.filter(id => id !== activa)] : [...previas]
  return orden.filter(id => hay.has(id)).slice(0, max)
}

/**
 * ¿Hay que volver a nacer la vista? Solo cuando Levy la pidió de nuevo (`en` cambió) y con OTRO contenido (`firma`).
 * Navegar dentro de la pestaña cambia la firma sin cambiar `en` (no remonta); Levy pidiendo lo mismo que ya está
 * cambia `en` sin cambiar la firma (tampoco: se muestra al instante).
 */
export interface Nacimiento { en: number; firma: string; gen: number }
export function siguienteNacimiento(prev: Nacimiento | null, en: number, firma: string): Nacimiento {
  if (!prev) return { en, firma, gen: 0 }
  if (en !== prev.en && firma !== prev.firma) return { en, firma, gen: prev.gen + 1 }
  return { en, firma, gen: prev.gen }
}
