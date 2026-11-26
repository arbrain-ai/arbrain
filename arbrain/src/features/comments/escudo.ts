/**
 * Escudo de la bandeja de comentarios (19 nov 2026). Las críticas y el hate (categoría `criticism`) no reciben
 * borrador (scripts/analytics/_comentarios_bandeja.py) y nunca llegan en primer plano: la bandeja las cuenta aparte,
 * plegadas («N críticas»), solo las de los últimos 30 días. El resto de lo redactado (ESCALATE o AUTO_PUBLISH, que
 * con la autopublicación apagada también espera su toque) va a la lista principal.
 */
export const CATEGORIAS_ESCUDO = new Set(['criticism'])
export const DECISIONES_BANDEJA = ['ESCALATE', 'AUTO_PUBLISH'] as const
export const DIAS_CRITICAS = 30

export type FilaCola = { category?: string | null } & Record<string, unknown>

export const esCritica = (f: FilaCola) => CATEGORIAS_ESCUDO.has(String(f.category ?? '').toLowerCase())

/** Parte la cola en lo que se muestra y las críticas plegadas. Ninguna crítica sale en `items`. */
export function separarCriticas<T extends FilaCola>(filas: T[]): { items: T[]; criticas: T[] } {
  const items: T[] = []
  const criticas: T[] = []
  for (const f of filas) (esCritica(f) ? criticas : items).push(f)
  return { items, criticas }
}

/** Lo que viaja de una crítica plegada: sin borrador, solo para leer si él quiere. */
export function plegarCritica(f: FilaCola) {
  const { comment_id, comment_text, author_display_name, video_title, comment_published_at } = f as Record<string, unknown>
  return { comment_id, comment_text, author_display_name, video_title, comment_published_at }
}

export function desdeCriticas(ahora = new Date()): string {
  return new Date(ahora.getTime() - DIAS_CRITICAS * 86_400_000).toISOString()
}
