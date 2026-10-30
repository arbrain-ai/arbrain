/**
 * Contrato de autoría (27 oct 2026, COMPETENCIA §8 punto 7): T3 y Cloudroom borran las líneas de coautor de los
 * agentes al fusionar; aquí hacemos lo contrario. Cada commit de un subagente lleva un trailer estable
 * «Subagente: <nombre del encargo>» para que la vista historia sepa quién lo cambió sin adivinar.
 *
 * Viaja en el encargo que `delegar` le pasa al CLI (no en la descripción de la herramienta: la dieta de la Cabina
 * no crece). El nombre se aplana a una línea y se recorta: un trailer de git es «Clave: valor» en un solo renglón.
 */
export const CLAVE_AUTORIA = 'Subagente'

/** El valor del trailer: una línea, sin dos puntos al inicio ni espacios de sobra, máximo 80 caracteres. */
export function valorAutoria(nombre: string): string {
  return nombre.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s:]+/, '').trim().slice(0, 80) || 'sin nombre'
}

export const trailerAutoria = (nombre: string) => `${CLAVE_AUTORIA}: ${valorAutoria(nombre)}`

/** La nota que se suma al encargo. */
export const notaAutoria = (nombre: string) =>
  `\n\n[Autoría] Si haces commits, cierra cada mensaje con esta línea de trailer, después de una línea en blanco y junto a los demás trailers (Co-Authored-By incluido): ${trailerAutoria(nombre)}`
