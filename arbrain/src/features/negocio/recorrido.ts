/**
 * Tu negocio › El pulso › El recorrido (17 nov 2026). Daniel, al ver «El nervio · cómo fluye la gente» en su lienzo: «esto
 * me encanto no lo habia visto…». El centro del panel es ese recorrido de izquierda a derecha: las seis columnas del
 * embudo (Adquisición → Expansión) como estaciones, agrupadas bajo el órgano que las mide (Marketing «¿llega gente?», Venta
 * «¿paga?», Entrega «¿avanzan?», Finanzas «¿queda dinero?»), el cuello marcado y el lazo de los casos que vuelven al show.
 *
 * Y «quiero que ya todo pase a ser terminal encendido asap»: una etapa está ENCENDIDA cuando opera hoy y ya tiene número
 * (la misma regla del lienzo: `nervioso.py` y `mapa/bloques/nervioso.tsx`). La apagada dice qué le falta con lo que ya
 * escribe su fuente: «por construir» si su embudo aún no opera, o su `mide.como_medirlo`. Nada se enciende sin dato.
 *
 * Lógica pura (sin React): la usa la vista y node:test. Todo sale de `embudo.json`; sin embudo, las seis estaciones vacías.
 */
import { corridaInactiva, corridaLaunchd, ETAPAS, motorDe, nombreEmbudo, type Arista, type Corrida, type Embudo, type Etapa, type Rutina } from './embudo'
import { estado as estadoCron, hace } from '@/features/rutinas/model'
import type { CronSnapshot } from '@/features/planning/types'
import { localeIntl, tr } from '@/shared/i18n'
import type { Organo } from './pulso'

export type Columna = (typeof ETAPAS)[number]

/** Una etapa del embudo vista desde el recorrido: si ya tiene número y, si no, qué le falta (de su fuente). */
export interface EtapaRecorrido {
  id: string; nombre: string; embudo: string
  encendida: boolean
  /** Qué mide (encendida) o qué la mediría (apagada); tal como lo escribe `embudo.json`. */
  mide: string
  /** Apagada: «por construir» (su embudo no opera hoy) o su `como_medirlo`. null si está encendida. */
  falta: null | { tipo: 'por-construir' } | { tipo: 'medir'; como: string }
  cuello: boolean; frase: string | null
  rutinas: Etapa['rutinas']
}

export interface Estacion { columna: Columna; etapas: EtapaRecorrido[]; encendidas: number; cuello: boolean }

/** Los órganos sobre el recorrido: qué columnas mide cada uno (la pieza «El nervio» del lienzo v18). */
export const TRAMOS: ReadonlyArray<{ organo: Organo; desde: number; hasta: number }> = [
  { organo: 'marketing', desde: 0, hasta: 1 },
  { organo: 'venta', desde: 2, hasta: 2 },
  { organo: 'entrega', desde: 3, hasta: 4 },
  { organo: 'finanzas', desde: 5, hasta: 5 },
]

/** ¿Ya tiene número? Opera hoy y su fuente ya lo da (misma regla que el lienzo). */
export const encendida = (et: Pick<Etapa, 'opera_hoy' | 'mide'>) => !!et.opera_hoy && !!et.mide?.hay_numero

export function etapaRecorrido(e: Embudo, et: Etapa): EtapaRecorrido {
  const on = encendida(et)
  const como = et.mide?.como_medirlo?.trim()
  return {
    id: et.id, nombre: et.nombre, embudo: nombreEmbudo(e, et.embudo), encendida: on,
    mide: (on ? et.mide?.nombre : como || et.mide?.nombre) ?? '',
    falta: on ? null : !et.opera_hoy ? { tipo: 'por-construir' } : como ? { tipo: 'medir', como } : { tipo: 'por-construir' },
    cuello: !!et.cuello?.es, frase: et.cuello?.frase?.trim() || null,
    rutinas: Array.isArray(et.rutinas) ? et.rutinas : [],
  }
}

/** Las seis estaciones en orden, cada una con sus etapas: primero las encendidas, luego por su orden en el archivo. */
export function estaciones(e: Embudo | null | undefined): Estacion[] {
  return ETAPAS.map(columna => {
    const ets = (e?.etapas ?? []).filter(et => et.etapa === columna)
      .map((et, i) => ({ r: etapaRecorrido(e!, et), i }))
      .sort((a, b) => Number(b.r.encendida) - Number(a.r.encendida) || a.i - b.i)
      .map(x => x.r)
    return { columna, etapas: ets, encendidas: ets.filter(x => x.encendida).length, cuello: ets.some(x => x.cuello) }
  })
}

/** Cuántas etapas ya tienen número, de cuántas. */
export function encendido(es: Estacion[]): { encendidas: number; total: number } {
  return { encendidas: es.reduce((n, x) => n + x.encendidas, 0), total: es.reduce((n, x) => n + x.etapas.length, 0) }
}

/** El lazo: la arista que vuelve (casos → tu show), con su estado tal como lo dice el embudo. */
export const lazoDe = (e: Embudo | null | undefined): Arista | null => e?.aristas?.find(a => a.tipo === 'volante') ?? null

/** La etapa cuello (la que el embudo marca), si hay. */
export function cuelloDelRecorrido(es: Estacion[]): { columna: number; etapa: EtapaRecorrido } | null {
  for (const [i, s] of es.entries()) { const et = s.etapas.find(x => x.cuello); if (et) return { columna: i, etapa: et } }
  return null
}

// ── Fase 2 (17 nov 2026): tocar una estación abre sus etapas y sus rutinas con su estado real ──
// Daniel: «darle clic a las rutinas debería ser mejor la ux… más dinámico, no tan estático por el lienzo». Las rutinas se
// leen de donde ya las lee el Taller: el scheduler (`/api/planning/crons`, la misma ventana de 8 días) y launchd (la lectura
// que trae `/api/negocio/embudo`). Es la misma cuenta que pinta la ficha de una etapa en Tu negocio › El sistema.

/** Una rutina de una etapa, en palabras: cómo le fue la última vez y cuándo le toca. */
export interface EstadoRutina { tono: Corrida['tono']; texto: string; toca: string | null }

export function estadoRutina(r: Rutina, ctx: {
  crons?: CronSnapshot; cronsError?: string; launchd?: Record<string, { semaforo: 'verde' | 'ambar' | 'rojo' | 'gris'; texto: string }>; ahora: number
}): EstadoRutina {
  if (!r.activa) return { ...corridaInactiva(r), toca: null }
  const m = motorDe(r)
  if (m === 'launchd') {
    const base = corridaLaunchd(r.id ? ctx.launchd?.[r.id] : undefined)
    const tarde = base.tono === 'ok' && atrasada(r.horario, r.id ? ctx.launchd?.[r.id]?.texto : undefined)
    return { ...(tarde ? { tono: 'atencion' as const, texto: `${base.texto} · ${tr('más de 3 veces su cadencia')}` } : base), toca: horarioEnPalabras(r.horario) }
  }
  if (m === 'scheduler') {
    const snap = ctx.crons
    const job = snap?.jobs?.find(j => j.id === r.id)
    if (!job) return { tono: 'sin-dato', texto: snap || ctx.cronsError ? tr('Sin dato aquí') : tr('Leyendo…'), toca: null }
    const est = estadoCron(job, snap!.runs ?? [])
    return {
      tono: est.tono, texto: est.ms ? `${est.texto} · ${hace(est.ms, ctx.ahora, snap!.timeZone)}` : est.texto,
      toca: job.status !== 'paused' && job.next_run ? cuandoToca(job.next_run * 1000, ctx.ahora, snap!.timeZone) : null,
    }
  }
  return { tono: 'sin-dato', texto: tr('Sin dato'), toca: horarioEnPalabras(r.horario) }
}

/** «a las 05:30» si el horario es una hora; si es una cadencia («cada 10 min», «diario 02:40»), tal cual la escribe el embudo. */
export function horarioEnPalabras(h?: string | null): string | null {
  const t = h?.trim()
  if (!t) return null
  return /^\d{1,2}:\d{2}$/.test(t) ? tr('a las {hora}', { hora: t }) : t
}

/** ¿Su última corrida pasó tres veces su cadencia? Solo si el embudo la escribe («cada 10 min») y launchd dice «hace N». */
export function atrasada(horario?: string | null, cuando?: string | null): boolean {
  const min = (n: number, u: string) => (/^d/i.test(u) ? n * 1440 : /^h/i.test(u) ? n * 60 : n)
  const c = horario?.match(/cada\s+(\d+)\s*(min|minutos?|h|horas?)\b/i)
  const h = cuando?.match(/hace\s+(\d+)\s*(min|minutos?|h|horas?|d|d[ií]as?)\b/i)
  return !!c && !!h && min(+h[1], h[2]) > 3 * min(+c[1], c[2])
}

/** Lo que el río enseña sin abrir nada: si alguna rutina de la estación falló o está corriendo ahora. */
export function senalDeRutinas(tonos: EstadoRutina['tono'][]): 'falla' | 'corre' | null {
  return tonos.includes('error') ? 'falla' : tonos.includes('curso') ? 'corre' : null
}

/** «toca hoy 05:30», «toca mañana 05:30», «toca jue 19 · 05:30». */
export function cuandoToca(ms: number, ahora: number, timeZone = 'America/Mexico_City'): string {
  const dia = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone })
  const hora = new Date(ms).toLocaleTimeString(localeIntl(), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone })
  if (ms <= ahora) return tr('toca ya')
  if (dia(ms) === dia(ahora)) return tr('toca hoy {hora}', { hora })
  if (dia(ms) === dia(ahora + 86_400_000)) return tr('toca mañana {hora}', { hora })
  return tr('toca {dia} · {hora}', { dia: new Date(ms).toLocaleDateString(localeIntl(), { weekday: 'short', day: 'numeric', timeZone }), hora })
}

/** El alto del dibujo del río: el de su fila (17 nov 2026, pantalla de Daniel a zoom 1.2: si se tomaba un mínimo más alto que
 *  la fila, el lazo bajaba sobre los nombres de las estaciones). Tope de 320 px: más alto no dice más. */
export const altoDelRio = (fila: number, minimo: number) => (fila > 0 ? Math.min(fila, 320) : minimo)
