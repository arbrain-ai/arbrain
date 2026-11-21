/**
 * Lo tuyo en Contenido (17 nov 2026, el dueño: «como youtube puedes guardar videos, programar para ver después que se
 * sincronice bien con mi calendario»). Modelo puro, sin red ni archivos: lo usan la pantalla (optimista) y el Studio
 * (la escritura de verdad, ESQUEMA.md §1, apartado de PANTALLAS `pantallas/mios.json`).
 *
 *  · Guardados: un toque guarda, otro quita. Sin tope y sin caducidad.
 *  · Ver después: la cola. Con hora (tiene su bloque en el calendario) o sin hora. Ordenada por cuándo toca; lo sin hora
 *    va al final, lo más reciente primero. Verlo o votarlo lo saca de la cola; el bloque del calendario NO se borra solo
 *    (borrar es decisión del dueño): queda en su calendario como lo que fue.
 */

export interface FichaVideo {
  video_id: string
  titulo: string
  canal: string
  channel_id?: string | null
  miniatura_url?: string | null
  duracion_s?: number | null
  publicado?: string | null
  temas?: string[]
}

/** Dónde vive el bloque en el calendario: lo justo para moverlo por la misma pluma del Día. */
export interface EventoRef { externalId: string; account: string; calendarId: string; etag?: string | null }

export interface Guardado extends FichaVideo { guardado: string }
export interface EnCola extends FichaVideo { agregado: string; cuando: string | null; evento: EventoRef | null }
export interface Mios { version: 1; guardados: Guardado[]; despues: EnCola[] }

export type CambioMios =
  | { accion: 'guardar'; video: FichaVideo }
  | { accion: 'quitar'; video_id: string }
  | { accion: 'despues'; video: FichaVideo; cuando: string | null; evento: EventoRef | null }
  /** Visto o votado: sale de la cola (el bloque se queda en el calendario). */
  | { accion: 'salir'; video_id: string }

export const VACIO: Mios = { version: 1, guardados: [], despues: [] }
const ID = /^[\w-]{11}$/
const texto = (x: unknown, max = 400) => typeof x === 'string' ? x.slice(0, max) : ''
const fecha = (x: unknown) => typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? x : null

/** Solo lo que la pantalla necesita para pintar una tarjeta: nada más viaja al archivo. */
export function ficha(v: Partial<FichaVideo> & { video_id: string }): FichaVideo {
  return {
    video_id: v.video_id, titulo: texto(v.titulo) || v.video_id, canal: texto(v.canal, 120),
    channel_id: typeof v.channel_id === 'string' ? v.channel_id.slice(0, 40) : null,
    miniatura_url: typeof v.miniatura_url === 'string' && /^https:\/\//.test(v.miniatura_url) ? v.miniatura_url.slice(0, 300) : null,
    duracion_s: typeof v.duracion_s === 'number' && v.duracion_s > 0 ? Math.round(v.duracion_s) : null,
    publicado: fecha(v.publicado),
    temas: Array.isArray(v.temas) ? v.temas.filter(t => typeof t === 'string').slice(0, 12) : [],
  }
}

function evento(x: unknown): EventoRef | null {
  const e = x as Partial<EventoRef> | null
  if (!e || typeof e.externalId !== 'string' || typeof e.account !== 'string' || typeof e.calendarId !== 'string') return null
  return { externalId: e.externalId, account: e.account, calendarId: e.calendarId, etag: typeof e.etag === 'string' ? e.etag : null }
}

/** Lo que venga del archivo (o del cuerpo de una petición) se vuelve un `Mios` válido; lo roto se descarta. */
export function normalizar(raw: unknown): Mios {
  const r = (raw ?? {}) as { guardados?: unknown[]; despues?: unknown[] }
  const vale = (x: unknown): x is { video_id: string } => !!x && typeof (x as { video_id?: unknown }).video_id === 'string' && ID.test((x as { video_id: string }).video_id)
  const unicos = <T extends { video_id: string }>(xs: T[]) => [...new Map(xs.map(x => [x.video_id, x])).values()]
  return {
    version: 1,
    guardados: unicos((Array.isArray(r.guardados) ? r.guardados : []).filter(vale).map(g => ({ ...ficha(g), guardado: fecha((g as { guardado?: unknown }).guardado) ?? new Date(0).toISOString() }))),
    despues: unicos((Array.isArray(r.despues) ? r.despues : []).filter(vale).map(d => {
      const x = d as { agregado?: unknown; cuando?: unknown; evento?: unknown }
      return { ...ficha(d), agregado: fecha(x.agregado) ?? new Date(0).toISOString(), cuando: fecha(x.cuando), evento: evento(x.evento) }
    })),
  }
}

export function validarCambio(c: unknown): CambioMios | null {
  const x = c as { accion?: unknown; video?: { video_id?: unknown }; video_id?: unknown; cuando?: unknown; evento?: unknown } | null
  if (!x) return null
  const conVideo = x.video && typeof x.video.video_id === 'string' && ID.test(x.video.video_id) ? ficha(x.video as FichaVideo) : null
  if (x.accion === 'guardar' && conVideo) return { accion: 'guardar', video: conVideo }
  if (x.accion === 'despues' && conVideo) return { accion: 'despues', video: conVideo, cuando: fecha(x.cuando), evento: evento(x.evento) }
  if ((x.accion === 'quitar' || x.accion === 'salir') && typeof x.video_id === 'string' && ID.test(x.video_id)) return { accion: x.accion, video_id: x.video_id }
  return null
}

export function aplicar(m: Mios, c: CambioMios, ahora = new Date()): Mios {
  const iso = ahora.toISOString()
  switch (c.accion) {
    case 'guardar': {
      const previo = m.guardados.find(g => g.video_id === c.video.video_id)
      return { ...m, guardados: [{ ...c.video, guardado: previo?.guardado ?? iso }, ...m.guardados.filter(g => g.video_id !== c.video.video_id)] }
    }
    case 'quitar': return { ...m, guardados: m.guardados.filter(g => g.video_id !== c.video_id) }
    case 'despues': {
      const previo = m.despues.find(d => d.video_id === c.video.video_id)
      // Cambiarle la hora conserva su bloque: el mismo evento se mueve, no se crea otro.
      const ev = c.evento ?? previo?.evento ?? null
      return { ...m, despues: [...m.despues.filter(d => d.video_id !== c.video.video_id), { ...c.video, agregado: previo?.agregado ?? iso, cuando: c.cuando, evento: c.cuando ? ev : (c.evento ?? null) }] }
    }
    case 'salir': return { ...m, despues: m.despues.filter(d => d.video_id !== c.video_id) }
  }
}

/** La cola por cuándo toca: con hora primero (la más próxima arriba), sin hora al final (lo último que dejaste, primero). */
export function colaOrdenada(xs: readonly EnCola[]): EnCola[] {
  return [...xs].sort((a, b) => {
    if (a.cuando && b.cuando) return Date.parse(a.cuando) - Date.parse(b.cuando)
    if (a.cuando) return -1
    if (b.cuando) return 1
    return Date.parse(b.agregado) - Date.parse(a.agregado)
  })
}

export const estaGuardado = (m: Mios | null | undefined, id: string) => !!m?.guardados.some(g => g.video_id === id)
export const enCola = (m: Mios | null | undefined, id: string) => m?.despues.find(d => d.video_id === id) ?? null

/** Búsqueda y tema sobre los guardados (los mismos chips de tema que ya existen en Inicio). */
export function filtrarGuardados(xs: readonly Guardado[], { q = '', tema = null as string | null } = {}): Guardado[] {
  const t = q.trim().toLowerCase()
  return xs.filter(g => (!tema || (g.temas ?? []).includes(tema)) && (!t || `${g.titulo} ${g.canal}`.toLowerCase().includes(t)))
}
