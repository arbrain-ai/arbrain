/**
 * Ajustes › Mejoras: la lista de mejoras opcionales que trae esta copia y cómo nacen. Módulo PURO (sin imports): lo
 * comparten el daemon (cliente/mejoras.ts, que guarda el archivo) y la web (features/mejoras/lib/mejoras.ts, que pinta
 * los interruptores). Cada mejora lee su interruptor y, apagada, la app se comporta exactamente como sin ella.
 */
// v0.2.29: entran las cuatro revisadas. Los avisos y el modo voz manos libres quedan para un diseño propio: no se
// muestra un interruptor que no hace nada.
export const MEJORAS = ['panel-plegable', 'mic-con-turno', 'nota-borrador', 'voz-lemonfox'] as const
export type Mejora = (typeof MEJORAS)[number]
export type EstadoMejoras = Record<Mejora, boolean>

/** Cómo nacen los interruptores en una instalación nueva (sin archivo ni nada guardado). */
export const MEJORAS_DE_FABRICA: EstadoMejoras = {
  'panel-plegable': false,
  'mic-con-turno': false,
  'nota-borrador': false,
  'voz-lemonfox': false,
}

export const esMejora = (v: unknown): v is Mejora => typeof v === 'string' && (MEJORAS as readonly string[]).includes(v)

/** Lo guardado sobre lo de fábrica: solo cuentan ids conocidos con valor booleano. */
export function normalizarMejoras(v: unknown, base: EstadoMejoras = MEJORAS_DE_FABRICA): EstadoMejoras {
  const r = { ...base }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (esMejora(k) && typeof x === 'boolean') r[k] = x
  return r
}
