/**
 * «Guardar por fecha» (v3, 10 oct 2026): los botones «Reporte diario / semanal / mensual» del calendario abren el reporte
 * de ESE periodo, también de días pasados, esté donde esté (la conversación favorita desde el 10 oct, el hilo «Reportes»
 * antes). Sin dependencias de cliente: lo usan el calendario y /api/cabina/reporte/abrir.
 *
 * Cada reporte pertenece al periodo que revisa:
 * - diario (morning-briefing, 05:30): el día de su corrida.
 * - semanal (business-council, domingo): la semana lunes–domingo que cierra ese domingo.
 * - mensual (monthly-review, día 1): el mes ANTERIOR a su corrida (el de octubre llega el 1 de noviembre).
 * La fecha de un reporte es la de su corrida original (`metadata.originalAt` en una reentrega), en CDMX.
 */
export type AlcanceReporte = 'dia' | 'semana' | 'mes'

export const JOB_DEL_REPORTE: Record<AlcanceReporte, string> = { dia: 'morning-briefing', semana: 'business-council', mes: 'monthly-review' }

const ZONA = 'America/Mexico_City'

/** Fecha civil (CDMX) de un instante. */
export function fechaCivil(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

const sumarDias = (fecha: string, n: number) => {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** El periodo [desde, hasta) que muestra el calendario en esa fecha: el día, su semana (lunes a domingo) o su mes. */
export function periodoDe(alcance: AlcanceReporte, fecha: string): { desde: string; hasta: string } {
  if (alcance === 'dia') return { desde: fecha, hasta: sumarDias(fecha, 1) }
  if (alcance === 'semana') {
    const [y, m, d] = fecha.split('-').map(Number)
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = domingo
    const lunes = sumarDias(fecha, -((dow + 6) % 7))
    return { desde: lunes, hasta: sumarDias(lunes, 7) }
  }
  const [y, m] = fecha.split('-').map(Number)
  return { desde: `${fecha.slice(0, 7)}-01`, hasta: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10) }
}

/** Las fechas de corrida [desde, hasta) cuyo reporte habla de ese periodo. El mensual corre los primeros días del mes siguiente. */
export function corridasDelPeriodo(alcance: AlcanceReporte, fecha: string): { desde: string; hasta: string } {
  const p = periodoDe(alcance, fecha)
  return alcance === 'mes' ? { desde: p.hasta, hasta: sumarDias(p.hasta, 3) } : p
}

export interface MensajeDeReporte { id: string; session_id: string; created_at: string; metadata: { originalAt?: unknown } | null }

/** El reporte de ese periodo entre los mensajes del cron: el más reciente cuya corrida cae en la ventana; null si no hay. */
export function reporteDelPeriodo<M extends MensajeDeReporte>(mensajes: readonly M[], alcance: AlcanceReporte, fecha: string): M | null {
  const v = corridasDelPeriodo(alcance, fecha)
  const corrida = (m: M) => fechaCivil(typeof m.metadata?.originalAt === 'string' ? m.metadata.originalAt : m.created_at)
  return mensajes
    .filter((m) => { const c = corrida(m); return c >= v.desde && c < v.hasta })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null
}
