/**
 * El reporte de la mañana como vista viva (5 oct 2026). Pedido de Daniel leyendo el de las 09:00: «es el tipo de
 * cosas que podemos automatizar para que me muestres mejores animaciones… para las tareas o para el día».
 *
 * El cron sigue imprimiendo su markdown (historial, Cron Lens y el texto corto del push); el webhook, al
 * entregarlo al hilo, le cuelga una invocación `mostrar {vista:'diario'}` y la app pinta la vista viva en lugar
 * del texto. La vista lee sus datos AL ABRIRSE (/api/cabina/diario y /api/planning): nunca se congela.
 *
 * 10 oct 2026: el de Daniel ya no cae al hilo «Reportes» sino a su conversación favorita (elegirFavorita), y su
 * texto es un mensaje corto de Levy que el chat SÍ pinta bajo la vista (metadata.reporteConTexto).
 */
import { TITULO_REPORTES, esHiloRutina } from './rutinas-hilos'
import { DUENO, instalacion, SEGUNDA } from '@/config'

/** Rutinas cuyo resultado llega como vista diario, y de quién es cada una. */
/** La rutina del reporte propio de la segunda persona (su id en el scheduler lleva su clave). */
export const JOB_REPORTE_SEGUNDA = `reporte-${SEGUNDA()}`
/** El cierre del día de la segunda persona (29 oct 2026, 20:30): texto a su hilo «Reportes», sin vista. */
export const JOB_CIERRE_SEGUNDA = `cierre-${SEGUNDA()}`
export const REPORTES_VIVOS: Readonly<Record<string, string>> = { 'morning-briefing': DUENO(), [JOB_REPORTE_SEGUNDA]: SEGUNDA() }

/** El hilo «Reportes» de la socia (suyo: profile_id = la socia). Id fijo: el push del script abre aquí
 *  (arbrain/server/scripts/analytics/reportes_matutinos.py, SEGUNDA_REPORTES_SESION). */
export const SEGUNDA_REPORTES_SESION = '5d0a1c10-7a11-4b0e-9a01-0000000000d1'
export const SEGUNDA_EMAIL = instalacion().correoReportesSecundario.toLowerCase()

/**
 * La conversación favorita de Daniel (10 oct 2026, Daniel: «llevo en esta conversación de Planeación mensual mucho
 * tiempo, incluso la marqué como favorita… ¿no debería llegar aquí este mismo reporte diario?»).
 *
 * v3 (10 oct 2026, estrella única): la favorita es la de la ESTRELLA (`is_starred`), una sola; marcar otra le quita la
 * estrella a la anterior (PATCH /api/chat/sessions). Daniel la rota cada domingo («Semana 42 · …»). Si por historia
 * quedara más de una con estrella, gana la de actividad más reciente. Sin estrella, la regla del 10 oct por la mañana:
 * la primera de «Fijadas» tal como la ve en la barra (ordenarFijadas: sin posición primero, luego por posición). Nunca
 * archivadas ni hilos de reportes/rutinas. null = sin favorita: el reporte cae al hilo «Reportes» como antes.
 * El ensayo en seco de reportes_matutinos.py (destino_del_reporte) repite esta regla en SQL.
 */
export interface SesionFijable {
  id: string
  title: string
  is_favorite: boolean | null
  is_starred?: boolean | null
  pinned_position: number | null
  archived_at: string | null
  updated_at: string
}

export function elegirFavorita<S extends SesionFijable>(sesiones: readonly S[]): S | null {
  const validas = sesiones.filter((s) => !s.archived_at && s.title !== TITULO_REPORTES && !esHiloRutina(s))
  const conEstrella = validas.filter((s) => s.is_starred).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
  if (conEstrella[0]) return conEstrella[0]
  const candidatas = validas.filter((s) => s.is_favorite)
  candidatas.sort((a, b) => {
    const pa = a.pinned_position, pb = b.pinned_position
    if (pa === null && pb !== null) return -1
    if (pb === null && pa !== null) return 1
    return (pa ?? 0) - (pb ?? 0) || Date.parse(b.updated_at) - Date.parse(a.updated_at)
  })
  return candidatas[0] ?? null
}

/** La vista viva que acompaña a cada reporte en la favorita (v3). La vista lee sus datos al abrirse: nunca se congela. */
export type VistaDeReporte =
  | { vista: 'diario'; fecha: string; quien?: string }
  | { vista: 'calendario'; alcance: 'semana' | 'mes'; fecha: string }
  | { vista: 'finanzas' }

/**
 * Qué vista lleva cada reporte de Daniel según el día de su corrida (CDMX). El semanal corre el domingo y revisa la
 * semana que cierra ese domingo (la semana del calendario empieza en lunes): su vista es esa semana. El mensual corre
 * el día 1 y revisa el mes anterior: su vista es ese mes. El ritual de la noche es una charla: sin vista.
 */
export function vistaDelReporte(jobId: string, fecha: string): VistaDeReporte | null {
  if (jobId === 'morning-briefing') return { vista: 'diario', fecha }
  if (jobId === 'business-council') return { vista: 'calendario', alcance: 'semana', fecha }
  if (jobId === 'monthly-review') return { vista: 'calendario', alcance: 'mes', fecha: ultimoDiaDelMesAnterior(fecha) }
  if (jobId === 'snapshot-finanzas') return { vista: 'finanzas' }
  return null
}

function ultimoDiaDelMesAnterior(fecha: string): string {
  const [y, m] = fecha.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 0))
  return d.toISOString().slice(0, 10)
}

/** Fecha civil (CDMX) del día del reporte a partir de la hora de su corrida. */
export function fechaDelReporte(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

/** La invocación que el webhook persiste en el mensaje del cron (metadata.toolCalls / toolInputs). */
export function invocacionVista(runId: string, input: VistaDeReporte) {
  const toolId = `${input.vista}-${runId}`.slice(0, 120)
  return {
    toolCalls: [{ toolId, toolName: 'mcp__cabina__mostrar', status: 'done' as const }],
    toolInputs: { [toolId]: JSON.stringify(input) },
  }
}

export function invocacionDiario(runId: string, quien: string, fecha: string) {
  return invocacionVista(runId, { vista: 'diario', fecha, ...(quien === SEGUNDA() ? { quien } : {}) })
}
