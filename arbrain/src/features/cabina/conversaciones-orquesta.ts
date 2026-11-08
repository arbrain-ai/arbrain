/**
 * Orquestar conversaciones existentes (6 nov 2026), lado web. La herramienta `conversacion` de la Cabina (accion listar,
 * renombrar, fijar, desfijar) deja la orden en el agent-server (server/src/cabina/conversaciones.ts) y su pulso la manda
 * aquí con el token servidor-a-servidor. La ruta `/api/cabina/conversaciones` lee y escribe chat_sessions SOLO del dueño
 * que manda la orden (profile_id = ownerId): nunca borra ni archiva. `enviar` no pasa por aquí: el agent-server acepta el
 * turno en su journal. Este módulo es la parte pura (probada en tests/cabina/conversaciones-orquesta.test.ts).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const TOPE_TITULO_ORDEN = 80
export const LIMITE_LISTAR = { porDefecto: 40, maximo: 200, ids: 5 }
/** Lo que el agent-server necesita de cada fila: título, fijada y las 4 columnas del semáforo. */
export const COLUMNAS_ORDEN = 'id, title, account, is_favorite, pinned_position, last_role, last_message_at, last_read_at, updated_at, archived_at'

export type OrdenWeb =
  | { accion: 'listar'; ownerId: string; ids?: string[]; limite: number }
  | { accion: 'renombrar'; ownerId: string; id: string; titulo: string }
  | { accion: 'fijar' | 'desfijar'; ownerId: string; id: string }

/** Valida el cuerpo que manda el agent-server. */
export function leerOrden(body: unknown): OrdenWeb | { error: string } {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (typeof o.ownerId !== 'string' || !o.ownerId.trim() || o.ownerId.length > 120) return { error: 'ownerId obligatorio.' }
  const ownerId = o.ownerId.trim()
  if (o.accion === 'listar') {
    if (o.ids !== undefined) {
      if (!Array.isArray(o.ids) || !o.ids.length || o.ids.length > LIMITE_LISTAR.ids || !o.ids.every(x => typeof x === 'string' && UUID.test(x))) return { error: `ids: de 1 a ${LIMITE_LISTAR.ids} ids de conversación.` }
      return { accion: 'listar', ownerId, ids: o.ids as string[], limite: LIMITE_LISTAR.ids }
    }
    const n = o.limite === undefined ? LIMITE_LISTAR.porDefecto : Number(o.limite)
    if (!Number.isInteger(n) || n < 1 || n > LIMITE_LISTAR.maximo) return { error: `limite: de 1 a ${LIMITE_LISTAR.maximo}.` }
    return { accion: 'listar', ownerId, limite: n }
  }
  if (o.accion !== 'renombrar' && o.accion !== 'fijar' && o.accion !== 'desfijar') return { error: 'accion: listar, renombrar, fijar o desfijar.' }
  if (typeof o.id !== 'string' || !UUID.test(o.id)) return { error: 'id de conversación inválido.' }
  if (o.accion === 'renombrar') {
    const titulo = typeof o.titulo === 'string' ? o.titulo.replace(/\s+/g, ' ').trim() : ''
    if (!titulo || titulo.length > TOPE_TITULO_ORDEN) return { error: `titulo obligatorio, hasta ${TOPE_TITULO_ORDEN} caracteres.` }
    return { accion: 'renombrar', ownerId, id: o.id, titulo }
  }
  return { accion: o.accion, ownerId, id: o.id }
}

/**
 * El cambio a la fila, igual que el menú «⋯» de la barra (PATCH /api/chat/sessions): fijar la pone arriba de Fijadas (sin
 * posición); desfijar le quita la posición y la estrella (una favorita siempre está fijada). `null` = ya estaba así.
 */
export function cambioDe(orden: Exclude<OrdenWeb, { accion: 'listar' }>, fila: { title?: string | null; is_favorite?: boolean | null }): Record<string, unknown> | null {
  if (orden.accion === 'renombrar') return fila.title === orden.titulo ? null : { title: orden.titulo }
  if (orden.accion === 'fijar') return fila.is_favorite ? null : { is_favorite: true, pinned_position: null }
  return fila.is_favorite ? { is_favorite: false, pinned_position: null, is_starred: false } : null
}

/** Fijadas + recientes sin repetir (una fijada vieja no cae fuera del límite). */
export function unirSinRepetir<T extends { id: string }>(...listas: T[][]): T[] {
  const vistos = new Set<string>(), out: T[] = []
  for (const l of listas) for (const f of l) if (!vistos.has(f.id)) { vistos.add(f.id); out.push(f) }
  return out
}
