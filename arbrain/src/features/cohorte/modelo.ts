/**
 * En la versión del alumno no existe la vista de la cohorte (la venta y la entrega del autor, con sus productos de
 * Polar): solo queda el tipo que importa la cabina y un resumen vacío.
 */
export type DatosCohorte = Record<string, never>

export function resumenCohorte(_x: DatosCohorte | undefined): string | null {
  return null
}
