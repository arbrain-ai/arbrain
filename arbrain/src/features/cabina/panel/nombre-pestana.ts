/** Cómo se llama una pestaña en su tira: la de escritorio (PanelDerecho.tsx) y la del teléfono (FilaPestanas.tsx) dicen lo mismo. */
import { NOMBRE, nombreDocumento } from '../model'
import type { Fijada } from './fijadas'
import { TALLER, TAREAS } from './pestanas-fuera'

export const nombrePestana = (f: Fijada) => f.input.vista === 'documento' ? nombreDocumento(f.input) : f.input.vista === 'negocio' && f.input.seccion ? f.input.seccion : f.input.vista === 'lienzo' && f.input.titulo ? f.input.titulo : NOMBRE[f.input.vista]

/** El nombre de una pestaña por su clave: Tareas y Taller son de la casa; lo demás, una fijada. */
export function nombreDeClave(clave: string, fijadas: Fijada[]): string {
  if (clave === TAREAS) return 'Tareas'
  if (clave === TALLER) return 'Taller'
  const f = fijadas.find(x => x.id === clave)
  return f ? nombrePestana(f) : 'Pestaña'
}
