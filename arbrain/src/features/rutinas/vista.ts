// Rutinas, la vista viva (10 oct 2026, Daniel: «¿hay posibilidad de que la interfaz sea tan hermosa como la del calendario o
// el panel de Salud?»). Lógica pura, sin red ni DOM: une el scheduler, la bitácora de corridas y lo que rinde cada una, y la
// lee para el dueño. Brief: docs/builds/rutinas-vista-viva-2026-10-10/BRIEF.md.
//
// Honestidad: «sin dato» nunca es «bien». Una corrida que salió bien pero reportó un problema es un aviso; una rutina activa
// que dejó de correr a su ritmo está atrasada. Aquí nada pausa, mueve ni activa: es lectura.

import type { CronRun, CronSchedule, CronSnapshot } from '@/features/planning/types'
import { CATEGORIAS, RUTINAS, nombreRutina, type Categoria, type Rutina } from './catalogo'
import { estado as estadoBase, resumen } from './model'
import { fmtTokens, type Rendimiento } from './rinde'
import { localeIntl, tr } from '@/shared/i18n'

// ── El horario en el reloj de 24 h ──

export interface Hora { h: number; m: number }
export type Ritmo = 'continua' | 'diaria' | 'semanal' | 'mensual' | 'otra'
export interface Horario { horas: Hora[]; ritmo: Ritmo; cadaMin?: number; dias?: string }

// Día corto de la semana en el idioma activo (13 nov 2026): «dom», «lun»… en español; «Sun», «Mon»… en inglés. El 1 ene 2023 fue domingo.
const DOW = (d: number) => new Intl.DateTimeFormat(localeIntl(), { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(2023, 0, 1 + d))
const lista = (c: string) => /^\d+(,\d+)*$/.test(c) ? c.split(',').map(Number) : null

/** «5 3 * * *» → 03:05 diaria; «0 7 * * 0» → 07:00 los domingos; «*\/10 * * * *» → continua. Lo que no se entiende: `otra`. */
export function horario(schedule: string | null | undefined): Horario {
  const p = (schedule ?? '').trim().split(/\s+/)
  if (p.length !== 5) return { horas: [], ritmo: 'otra' }
  const [min, hora, dom, mes, dow] = p
  const cada = /^\*\/(\d+)$/.exec(min)
  if (cada && hora === '*' && dom === '*' && dow === '*') return { horas: [], ritmo: 'continua', cadaMin: Number(cada[1]) }
  const ms = lista(min)
  if (!ms || mes !== '*') return { horas: [], ritmo: 'otra' }
  const cadaH = /^\*\/(\d+)$/.exec(hora)
  const hs = cadaH ? Array.from({ length: Math.ceil(24 / Number(cadaH[1])) }, (_, i) => i * Number(cadaH[1])) : lista(hora)
  if (!hs) return { horas: [], ritmo: 'otra' }
  const horas = hs.flatMap(h => ms.map(m => ({ h, m }))).sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m))
  if (dom === '*' && dow === '*') return { horas, ritmo: 'diaria' }
  const dows = lista(dow)
  if (dom === '*' && dows) return { horas, ritmo: 'semanal', dias: dows.map(d => DOW(d % 7)).join(' · ') }
  const doms = lista(dom)
  if (doms && dow === '*') return { horas, ritmo: 'mensual', dias: tr('día {dias}', { dias: doms.join(', ') }) }
  return { horas, ritmo: 'otra' }
}

/** La noche de la casa: de las 22:00 a las 05:00 (censo §4). */
export const esNoche = (h: number) => h >= 22 || h < 5
export type Turno = 'noche' | 'dia' | 'ambos' | 'siempre'
export function turno(hz: Horario): Turno | null {
  if (hz.ritmo === 'continua') return 'siempre'
  if (!hz.horas.length) return null
  const n = hz.horas.filter(x => esNoche(x.h)).length
  return n === hz.horas.length ? 'noche' : n === 0 ? 'dia' : 'ambos'
}
export const hhmm = (x: Hora) => `${String(x.h).padStart(2, '0')}:${String(x.m).padStart(2, '0')}`

/** El mayor hueco esperado entre dos corridas (ms); null si no se sabe. */
export function huecoEsperado(hz: Horario): number | null {
  if (hz.ritmo === 'continua') return (hz.cadaMin ?? 10) * 60_000
  if (!hz.horas.length) return null
  if (hz.ritmo === 'semanal') return 7 * 86_400_000
  if (hz.ritmo === 'mensual') return 31 * 86_400_000
  if (hz.ritmo !== 'diaria') return null
  const mins = hz.horas.map(x => x.h * 60 + x.m)
  const huecos = mins.map((m, i) => (i + 1 < mins.length ? mins[i + 1] : mins[0] + 1440) - m)
  return Math.max(...huecos) * 60_000
}

// ── Estado honesto ──

export type TonoViva = 'ok' | 'falla' | 'aviso' | 'atrasada' | 'curso' | 'sin-dato' | 'pausada'
export interface EstadoViva { tono: TonoViva; texto: string; ms: number | null }

/** Corrió, pero lo que reportó dice que algo no está bien (⚠️, ROJO, «no responde», salida distinta de cero). */
const AVISO = /^\s*(⚠️|🔴|❌)|\bROJO\b|no responde|c[oó]digo (de salida )?[1-9]|exit (code )?[1-9]/i

export function estadoViva(job: CronSchedule, runs: CronRun[], ahora: number): EstadoViva {
  const e = estadoBase(job, runs)
  if (e.tono === 'pausada') return { tono: 'pausada', texto: tr('En pausa'), ms: e.ms }
  if (e.tono === 'error') return { tono: 'falla', texto: tr('Falló'), ms: e.ms }
  if (e.tono === 'curso') return { tono: 'curso', texto: tr('Trabajando'), ms: e.ms }
  const hueco = huecoEsperado(horario(job.schedule))
  const ultima = Math.max(job.last_run ? job.last_run * 1000 : 0, ...runs.filter(r => r.job_id === job.id).map(r => Date.parse(r.created_at)))
  // Atrasada: activa y sin correr en hueco y medio (más una hora de holgura). Sin hueco conocido, no se juzga.
  if (hueco && ultima && ahora - ultima > hueco * 1.5 + 3_600_000) return { tono: 'atrasada', texto: tr('No ha corrido a su hora'), ms: ultima }
  if (e.tono === 'sin-dato') return { tono: 'sin-dato', texto: e.texto, ms: e.ms }
  // Solo el encabezado del reporte: un informe largo puede citar «ROJO» de otra cosa (el semanal audita a las demás).
  if (job.last_result && AVISO.test(job.last_result.slice(0, 160))) return { tono: 'aviso', texto: tr('Corrió, pero avisó algo'), ms: e.ms }
  return { tono: 'ok', texto: tr('Salió bien'), ms: e.ms }
}

// ── Historial ──

export interface Corrida { at: number; tono: 'ok' | 'falla' | 'curso'; durMs: number | null; error: string | null }
const FALLA = (r: CronRun) => !!r.error || ['error', 'failed'].includes(r.status)
export function historial(runs: CronRun[], id: string, max = 14): Corrida[] {
  return runs.filter(r => r.job_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, max).map(r => ({
    at: Date.parse(r.created_at), tono: FALLA(r) ? 'falla' : ['running', 'in_progress', 'pending'].includes(r.status) ? 'curso' : 'ok',
    durMs: r.duration_ms ?? null, error: r.error ? resumen(r.error, 160) : null,
  }))
}

// ── Qué cuesta y quién lo usa ──

export interface Costo { tipo: 'programa' | 'tokens' | 'sin-dato'; tokens: number | null; porCorrida: number | null; nota: string | null }
export function costoDe(info: Rutina | undefined, r: Rendimiento | undefined): Costo {
  const tokens = r?.tokens ?? null, porCorrida = r?.tokensPorCorrida ?? null
  if (info?.motor === 'programa') return { tipo: 'programa', tokens, porCorrida,
    nota: tokens ? (info.programaDesde ? tr('En 30 días midió {tokens} tokens de cuando lo envolvía un modelo (hasta el {fecha}).', { tokens: fmtTokens(tokens), fecha: info.programaDesde }) : tr('En 30 días midió {tokens} tokens de cuando lo envolvía un modelo.', { tokens: fmtTokens(tokens) })) : null }
  if (tokens != null && tokens > 0) return { tipo: 'tokens', tokens, porCorrida, nota: r && r.medidas < r.corridas ? tr('Medidas {medidas} de {corridas} corridas.', { medidas: r.medidas, corridas: r.corridas }) : null }
  if (tokens === 0) return { tipo: 'programa', tokens: 0, porCorrida: 0, nota: null }
  return { tipo: 'sin-dato', tokens: null, porCorrida: null, nota: null }
}

/** Lo que se nota: nadie usa lo que produce, quien lo usa está en pausa, o falla más de lo que entrega. */
export function noRinde(info: Rutina | undefined, r: Rendimiento | undefined, pausadas: Set<string>): string | null {
  if (info?.para === 'nadie' && !info.seguro) return tr('Nadie usa lo que produce.')
  if (info?.consumidor && pausadas.has(info.consumidor)) return tr('Lo usa «{nombre}», que está en pausa.', { nombre: nombreRutina(info.consumidor) })
  if (r?.tono === 'no-rinde') return r.motivo
  return null
}

// ── Cada rutina, leída ──

export interface Fila {
  id: string; nombre: string; info: Rutina | undefined; categoria: Categoria; job: CronSchedule
  estado: EstadoViva; horario: Horario; turno: Turno | null; historial: Corrida[]; reporte: string | null
  costo: Costo; noRinde: string | null; rinde: Rendimiento | undefined; siguiente: number | null
}

const esLapidaDeMigracion = (id: string) => /-migrated$/.test(id)

export function leerFilas(d: CronSnapshot, rinde: Rendimiento[] | null | undefined, ahora: number): { activas: Fila[]; pausadas: Fila[] } {
  const porId = new Map((rinde ?? []).map(r => [r.id, r]))
  const jobs = d.jobs.filter(j => !esLapidaDeMigracion(j.id))
  const pausadasIds = new Set(jobs.filter(j => j.status === 'paused').map(j => j.id))
  const filas = jobs.map((job): Fila => {
    const info = RUTINAS[job.id], r = porId.get(job.id), hz = horario(job.schedule)
    return {
      id: job.id, nombre: nombreRutina(job.id), info, categoria: info?.categoria ?? 'maquina', job,
      estado: estadoViva(job, d.runs, ahora), horario: hz, turno: turno(hz), historial: historial(d.runs, job.id),
      reporte: resumen(job.last_result, 420), costo: costoDe(info, r), noRinde: job.status === 'paused' ? null : noRinde(info, r, pausadasIds), rinde: r,
      siguiente: job.status === 'active' && job.next_run ? job.next_run * 1000 : null,
    }
  })
  const orden = (a: Fila, b: Fila) => (a.horario.horas[0] ? a.horario.horas[0].h * 60 + a.horario.horas[0].m : -1) - (b.horario.horas[0] ? b.horario.horas[0].h * 60 + b.horario.horas[0].m : -1)
  return { activas: filas.filter(f => f.estado.tono !== 'pausada').sort(orden), pausadas: filas.filter(f => f.estado.tono === 'pausada') }
}

// ── De un vistazo ──

export const GRAVEDAD: Partial<Record<TonoViva, number>> = { falla: 0, atrasada: 1, aviso: 2, 'sin-dato': 3 }
const ORDEN_CAT = new Map(CATEGORIAS.map((c, i) => [c.id, i]))

export interface Lectura {
  tono: 'bien' | 'atencion' | 'mal' | 'sin-dato'; palabra: string
  trabajan: number; fallaron: number; atrasadas: number; avisos: number; sinDato: number
  /** Lo más grave: peor estado y, a igualdad, la categoría que más pesa (el dinero antes que la máquina). */
  grave: Fila | null
}

export function lectura(activas: Fila[]): Lectura {
  const cuenta = (t: TonoViva) => activas.filter(f => f.estado.tono === t).length
  const fallaron = cuenta('falla'), atrasadas = cuenta('atrasada'), avisos = cuenta('aviso'), sinDato = cuenta('sin-dato')
  const graves = activas.filter(f => GRAVEDAD[f.estado.tono] != null)
    .sort((a, b) => GRAVEDAD[a.estado.tono]! - GRAVEDAD[b.estado.tono]! || ORDEN_CAT.get(a.categoria)! - ORDEN_CAT.get(b.categoria)!)
  const grave = graves[0] ?? null
  const base = { trabajan: activas.length, fallaron, atrasadas, avisos, sinDato, grave }
  if (!activas.length) return { ...base, tono: 'sin-dato', palabra: tr('Sin rutinas a la vista') }
  if (fallaron) return { ...base, tono: 'mal', palabra: fallaron === 1 ? tr('Falló {nombre}', { nombre: grave!.nombre }) : tr('Fallaron {n}', { n: fallaron }) }
  if (atrasadas) return { ...base, tono: 'atencion', palabra: atrasadas === 1 ? tr('{nombre} no corrió a su hora', { nombre: grave!.nombre }) : tr('{n} no corrieron a su hora', { n: atrasadas }) }
  if (avisos) return { ...base, tono: 'atencion', palabra: avisos === 1 ? tr('{nombre} avisó algo', { nombre: grave!.nombre }) : tr('{n} avisaron algo', { n: avisos }) }
  if (sinDato) return { ...base, tono: 'sin-dato', palabra: tr('Corren; {n} sin dato', { n: sinDato }) }
  return { ...base, tono: 'bien', palabra: tr('Todo en orden') }
}

/** La próxima rutina que toca (por el `next_run` del scheduler). */
export function siguiente(activas: Fila[], ahora: number): Fila | null {
  return activas.filter(f => f.siguiente && f.siguiente > ahora && f.horario.ritmo !== 'continua').sort((a, b) => a.siguiente! - b.siguiente!)[0] ?? null
}

/** Cuántas corren de noche (22–05) y cuántas de día, contando cada rutina una vez (las de ambos, en las dos). */
export function nocheYDia(activas: Fila[]) {
  return { noche: activas.filter(f => f.turno === 'noche' || f.turno === 'ambos').length, dia: activas.filter(f => f.turno === 'dia' || f.turno === 'ambos').length, siempre: activas.filter(f => f.turno === 'siempre').length }
}

/**
 * El reloj sin puntos encimados (10 oct 2026): en un mismo anillo, las marcas a menos de `minGrados` se reparten alrededor de
 * su centro, en orden, a `minGrados` entre sí (05:30 y 05:35 son 1.3° y se tapaban). Devuelve el ángulo a pintar de cada una,
 * en el mismo orden que llegan; la hora exacta la dice la lente.
 */
export function repartir(grados: number[], minGrados: number): number[] {
  const orden = grados.map((g, i) => ({ g, i })).sort((a, b) => a.g - b.g)
  const out = [...grados]
  let k = 0
  while (k < orden.length) {
    let fin = k
    while (fin + 1 < orden.length && orden[fin + 1].g - orden[fin].g < minGrados) fin++
    const grupo = orden.slice(k, fin + 1), centro = (grupo[0].g + grupo[grupo.length - 1].g) / 2
    grupo.forEach((x, j) => { out[x.i] = centro + (j - (grupo.length - 1) / 2) * minGrados })
    k = fin + 1
  }
  return out
}
