/**
 * Canvas v4 — QUE se mueve cuando se arrastra un elemento (puro, sin React).
 *
 * Se deriva de los DATOS, no del estado de React: la pertenencia a un grupo vive en el elemento.
 *   · seleccion multiple que incluye al arrastrado → toda la seleccion; si no, solo el elemento.
 *   · se expande a su grupo (salvo el grupo abierto con doble clic).
 *   · lo bloqueado se queda.
 *   · una SECCION arrastra lo que tiene dentro.
 */

import type { CanvasElement } from './element'
import { expandirSeleccion } from './group'
import { hijosDeSeccion } from './create'

export function objetivosDeArrastre(
  elements: CanvasElement[], id: string, seleccion: ReadonlySet<string>, grupoAbierto?: string | null,
): Set<string> {
  const base = seleccion.has(id) && seleccion.size > 1 ? new Set(seleccion) : new Set([id])
  const objetivos = expandirSeleccion(elements, base, grupoAbierto)
  for (const el of elements) if (el.locked) objetivos.delete(el.id)
  for (const el of elements) {
    if (el.type === 'frame' && objetivos.has(el.id)) for (const h of hijosDeSeccion(el, elements)) objetivos.add(h)
  }
  return objetivos
}
