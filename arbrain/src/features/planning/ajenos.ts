/**
 * Lo de otra persona se dice suyo (2 nov 2026, el dueño con captura: «veo que dice Panteón y yo nunca lo puse»). Su Google
 * ve, compartido, el calendario principal de otra persona (`calendarId` = el correo de ella, título = su nombre), y un
 * evento de ella caía en «Tu día» y en la rejilla como si fuera de él. No se oculta: se nombra («Fulana · 🌼 Panteón»).
 *
 * Regla sin nombres escritos a mano: un calendario es de otra persona cuando su id es el correo de alguien (no un
 * `…calendar.google.com` de grupo, festivos o importado) y ese correo no es ninguna de las cuentas del snapshot (dos
 * cuentas del mismo dueño se ven entre sí y siguen siendo suyas). Su nombre es el título del calendario o, si el título es
 * el correo, lo de antes de la arroba. La ruta `/api/planning` lo anota en cada evento (`de`); escribir nunca lo lleva
 * (`eventData` elige sus campos), así que mover o editar no le pega «Fulana ·» al título en Google.
 */
import type { CalendarSource, PlanEvent } from './types'

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** De quién es este calendario si no es del dueño; null si es suyo (o de grupo, festivos, importado). */
export function duenoDeFuente(f: Pick<CalendarSource, 'calendarId' | 'title'>, cuentas: ReadonlySet<string>): string | null {
  const id = f.calendarId.trim().toLowerCase()
  if (!CORREO.test(id) || id.endsWith('calendar.google.com') || cuentas.has(id)) return null
  const titulo = f.title?.trim()
  return titulo && titulo.toLowerCase() !== id ? titulo : id.split('@')[0]
}

/** Anota en cada evento de un calendario ajeno de quién es (`de`). Lo demás pasa tal cual. */
export function marcarAjenos<T extends { sources?: CalendarSource[]; events?: PlanEvent[] }>(snap: T): T {
  if (!Array.isArray(snap.sources) || !Array.isArray(snap.events)) return snap
  const cuentas = new Set(snap.sources.map(s => s.account.trim().toLowerCase()))
  const duenos = new Map<string, string>()
  for (const s of snap.sources) { const d = duenoDeFuente(s, cuentas); if (d) duenos.set(s.id, d) }
  if (!duenos.size) return snap
  return { ...snap, events: snap.events.map(e => duenos.has(e.sourceId) ? { ...e, de: duenos.get(e.sourceId)! } : e) }
}

/** El título que se pinta: «Fulana · 🌼 Panteón» si es de otra persona; el de siempre si es tuyo. */
export const tituloVisible = (e: Pick<PlanEvent, 'title' | 'de'>, vacio = '') => {
  const t = e.title || vacio
  return e.de ? `${e.de} · ${t}` : t
}
