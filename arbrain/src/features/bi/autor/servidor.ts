/**
 * En la versión del alumno no viajan los lectores del autor: con su catálogo vacío nunca se llama. Rige el motor genérico
 * (features/bi/motor.ts) sobre las fuentes del dueño.
 */
import type { Ventana } from '../catalogo'
import type { RespuestaConsulta } from '../modelo'

export async function ejecutarAutor(id: string, _ventana: Ventana, _raiz: string | null): Promise<RespuestaConsulta> {
  throw new Error(`«${id}» no está en el catálogo de esta instalación.`)
}
