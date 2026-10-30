/**
 * En la versión del alumno no existe la casa física del autor (su casa en 3D, sus luces y su perro robot): solo queda
 * lo que importa la cabina, una vista vacía y un resumen vacío. La edición cliente ya no deja abrir /casa ni su API.
 */
import type { EstadoCasa } from './contrato'

export const URL_CASA = '/api/casa'

export function resumenCasa(_e: EstadoCasa | null): string | null {
  return null
}

export function VistaCasa(_props: { grande?: boolean; pagina?: boolean; modo?: 'tu-casa'; repetir?: boolean }) {
  return null
}
