/**
 * Conversaciones nuevas sin mensajes todavía (16 nov 2026). La lista de «Recientes» ordena por `last_message_at` con
 * tope de 40, y esa columna la llena el trigger de `chat_messages`: una conversación recién creada cuyo primer turno
 * aún no guarda mensajes (p. ej. «Sin filtro») caía al fondo, fuera del tope, y aparecía y desaparecía según quién
 * pintara la lista. Daniel: «a veces si se ve 2 conv sin filtro y a veces solo 1». Se suman las recientes sin mensajes
 * y todo se ordena por su último momento (mensaje o, si no hay, su última actualización).
 */
export function unirSinMensajes<T extends { id: string; last_message_at?: string | null; updated_at: string }>(
  conMensajes: T[], sinMensajes: T[], limite: number,
): T[] {
  const vistas = new Set(conMensajes.map((f) => f.id))
  const extra = sinMensajes.filter((f) => !vistas.has(f.id))
  if (extra.length === 0) return conMensajes
  const momento = (f: T) => Date.parse(f.last_message_at ?? f.updated_at) || 0
  return [...conMensajes, ...extra].sort((a, b) => momento(b) - momento(a)).slice(0, limite)
}

/** Ventana de las recientes sin mensajes que se suman a la lista (y cuántas como máximo). */
export const SIN_MENSAJES_DIAS = 7
export const SIN_MENSAJES_MAX = 10
