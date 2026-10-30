/**
 * El Año Precargado (*Buy Back Your Time*, cap. 14, p. 259–267): primero se ponen en el calendario las cosas que dan sentido al año
 * (premios, viajes, lanzamientos) y después se rellena con el trabajo. 25 oct 2026, Daniel firmó verlo en el Mes y la temporada con
 * «los eventos de premio, viaje y lanzamiento primero».
 *
 * Lógica pura (la usan la vista del Mes y las pruebas, tests/planning/ano-precargado.test.ts): toma los eventos de día completo o de
 * varios días del horizonte, los clasifica por título y los ordena: premio → viaje → lanzamiento, y luego las demás piedras (fases,
 * uno a uno) por fecha. La lista la escribe la persona o su Levy en Google por `mc-event.py` (la pluma de siempre); aquí solo se lee.
 */
export type TipoPiedra = 'premio' | 'viaje' | 'lanzamiento' | 'piedra'
export interface Piedra { id: string; titulo: string; tipo: TipoPiedra; desde: string; hasta: string }
export interface EventoPiedra { id: string; title: string; start: string; end: string; allDay?: boolean }

export const ORDEN_PIEDRAS: readonly TipoPiedra[] = ['premio', 'viaje', 'lanzamiento', 'piedra']
export const ROTULO_PIEDRA: Record<TipoPiedra, string> = { premio: 'Premio', viaje: 'Viaje', lanzamiento: 'Lanzamiento', piedra: 'Piedra' }

const RE = (s: string) => new RegExp(`(?<![\\p{L}\\d])(?:${s})(?![\\p{L}\\d])`, 'iu')
const PREMIO = RE('premio|recompensa|celebraci[oó]n|celebrar')
const VIAJE = RE('viaje|vuelo|vacaciones|hotel|retiro|presencial|escapada')
const FASE = RE('fase \\d+|uno a uno|1 ?a ?1|s\\d+')
const LANZAMIENTO = RE('lanzamiento|lanzar|launch|abre|apertura|estreno|demo day|cohorte|preventa|webinar|masterclass')

export function tipoDePiedra(titulo: string): TipoPiedra {
  const t = titulo.trim()
  if (/^\s*🏆/u.test(t) || PREMIO.test(t)) return 'premio'
  if (/^\s*(?:✈️?|🏔️?|🏖️?)/u.test(t) || VIAJE.test(t)) return 'viaje'
  // «🎤 Demo day · … (S1)» es lanzamiento aunque nombre su semana; «🚀 Fase 5 · Escala» es una fase (piedra) aunque lleve cohete.
  if (/^\s*(?:🔓|🎤)/u.test(t) || LANZAMIENTO.test(t)) return 'lanzamiento'
  if (FASE.test(t)) return 'piedra'
  if (/^\s*🚀/u.test(t)) return 'lanzamiento'
  return 'piedra'
}

const DIA = 86_400_000
/** Fecha civil `YYYY-MM-DD` de un inicio o fin (todo el día viene como fecha; con hora, su parte de fecha). */
const fecha = (s: string) => s.slice(0, 10)
/** El último día que ocupa (Google da el fin exclusivo en los de día completo). */
function ultimoDia(e: EventoPiedra): string {
  const fin = fecha(e.end)
  if (!e.allDay && e.end.length > 10) return fin
  const d = new Date(`${fin}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1)
  const u = d.toISOString().slice(0, 10)
  return u < fecha(e.start) ? fecha(e.start) : u
}

/**
 * Las piedras de [hoy, horizonte]: de día completo o de 20 h o más, que no hayan terminado. Una por título (la primera). Ordenadas
 * premio → viaje → lanzamiento → piedra, y dentro de cada tipo por fecha.
 */
export function piedrasPrecargadas(eventos: readonly EventoPiedra[], hoy: string, horizonte: string): Piedra[] {
  const vistos = new Set<string>()
  const out: Piedra[] = []
  for (const e of [...eventos].sort((a, b) => a.start.localeCompare(b.start))) {
    const largo = e.allDay || Date.parse(e.end) - Date.parse(e.start) >= 20 * 3_600_000
    if (!largo || !e.title?.trim()) continue
    const desde = fecha(e.start), hasta = ultimoDia(e)
    if (hasta < hoy || desde > horizonte) continue
    const clave = e.title.trim().toLowerCase()
    if (vistos.has(clave)) continue
    vistos.add(clave)
    out.push({ id: e.id, titulo: e.title.trim(), tipo: tipoDePiedra(e.title), desde, hasta })
  }
  return out.sort((a, b) => ORDEN_PIEDRAS.indexOf(a.tipo) - ORDEN_PIEDRAS.indexOf(b.tipo) || a.desde.localeCompare(b.desde))
}

/** Días de hoy al inicio (0 = hoy o ya en curso). */
export const enDias = (hoy: string, desde: string) => Math.max(0, Math.round((Date.parse(`${desde}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / DIA))
