/**
 * Editar un mensaje de la fila (12 oct 2026, Daniel: «le di editar al botón y el texto se bajó pero las fotos se
 * quedaron arriba»). Antes `sacar` regresaba solo el texto y dejaba las fotos en la fila: medio mensaje arriba y
 * medio abajo. Ahora el pendiente sale COMPLETO de la fila y entra completo al composer: su texto y sus adjuntos
 * ya subidos (URLs del storage), en el mismo orden. Nada se pierde, nada se queda, nada sale dos veces.
 */

export interface PendienteFila { id: string; texto: string; imagenes?: string[] }

/** Quita de la fila el pendiente `id` (o el último) y lo devuelve entero. `null` si no existe. */
export function sacarDeFila<T extends PendienteFila>(items: T[], id?: string): { item: T; resto: T[] } | null {
  const item = id ? items.find(x => x.id === id) : items[items.length - 1]
  if (!item) return null
  return { item, resto: items.filter(x => x !== item) }
}

/** El borrador del composer con el pendiente devuelto: su texto al final y sus adjuntos detrás de los que ya había. */
export function devolverAlComposer<D extends { input: string; imagenesSubidas: string[] }>(
  draft: D, item: { texto: string; imagenes?: string[] },
): D {
  const texto = item.texto.trim()
  const input = !texto ? draft.input : draft.input.trim() ? `${draft.input}\n\n${texto}` : texto
  return { ...draft, input, imagenesSubidas: [...draft.imagenesSubidas, ...(item.imagenes ?? [])] }
}
