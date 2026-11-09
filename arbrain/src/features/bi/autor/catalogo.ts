/**
 * En la versión del alumno no viaja el catálogo del autor (sus consultas fijas): queda vacío y rige el catálogo genérico,
 * conectado a las fuentes del dueño (features/bi/generico.ts y bi-fuentes.json).
 */
import { consultaEn, type Consulta } from '../catalogo'

export const CATALOGO_AUTOR: readonly Consulta[] = []
export const consultaAutor = (id: string) => consultaEn(CATALOGO_AUTOR, id)
