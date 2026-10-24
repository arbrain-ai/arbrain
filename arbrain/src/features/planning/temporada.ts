import type { Instalacion } from '@/config/tipos'

/**
 * La temporada en tiempo de ejecución (24 oct 2026, Daniel: «lo mismo para la edición del alumno (sus hábitos y su calendario: la
 * plantilla de temporada/mes/semana/día que guía su Levy)»). El escalón de arriba de la cascada Temporada → Mes → Semana → Día:
 * fechas, premio, meta y lo que debe estar cumplido antes del cierre (`periodo`), más el nombre y el arranque de la temporada de
 * hábitos. Lógica pura, sin React ni node:* (la usan la franja, «Hábitos de hoy», la ruta /api/planning/temporada, el CLI de Levy
 * y las pruebas, tests/planning/temporada.test.ts).
 *
 * Precedencia (una sola regla): si hay documento guardado (almacén, `lib/planning/temporada-store.ts`), manda ENTERO, incluso si
 * dice «sin temporada» (la persona la quitó); si no hay, manda la instalación (`instalacion().periodo` y `temporadaHabitos`). La de
 * Daniel no tiene almacén: sigue mandando `src/config/instalacion.ts`. El alumno nace sin archivo y sin periodo (plantilla).
 */
export type Periodo = NonNullable<Instalacion['periodo']>
export type TemporadaHabitosConf = NonNullable<Instalacion['temporadaHabitos']>

/** Lo que leen las vistas: lo mismo que daba `instalacion()`. */
export interface TemporadaVigente { periodo?: Periodo; temporadaHabitos?: TemporadaHabitosConf }

/** El documento guardado: `periodo: null` = sin temporada (la persona la quitó o aún no la arma). */
export interface DocTemporada { version: 1; actualizado: string; nombre: string | null; arranque: string | null; periodo: Periodo | null }

/** Si la temporada no trae nombre, la fila de hábitos y la franja dicen esto. */
export const NOMBRE_POR_DEFECTO = 'Temporada'
/** Tope de días de una temporada (un año) y de casillas «antes del cierre». */
export const DIAS_MAX = 366, CUMPLIR_MAX = 6

const esFecha = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`))
  && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s
const texto = (s: unknown, max: number) => typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : ''
const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
const obj = (x: unknown) => x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null

/** Valida un periodo. Devuelve el periodo limpio o el motivo (en palabras de la persona) por el que no sirve. */
export function validarPeriodo(crudo: unknown): Periodo | string {
  const p = obj(crudo)
  if (!p) return 'Falta la temporada: fechas, premio y meta.'
  if (!esFecha(p.desde)) return 'Falta el día 1 de la temporada (AAAA-MM-DD).'
  if (!esFecha(p.hasta)) return 'Falta el día del cierre (AAAA-MM-DD).'
  const total = dias(p.desde, p.hasta)
  if (total < 1) return 'El cierre tiene que caer después del día 1.'
  if (total > DIAS_MAX) return `Una temporada dura como mucho ${DIAS_MAX} días.`
  const premio = texto(p.premio, 80)
  if (!premio) return 'Falta el premio: qué te espera al cerrar la temporada.'
  const meta = texto(p.meta, 140)
  let viaje: Periodo['viaje']
  if (p.viaje !== undefined && p.viaje !== null) {
    const v = obj(p.viaje)
    if (!v || !esFecha(v.desde) || !esFecha(v.hasta) || v.hasta < v.desde) return 'Las fechas del premio no son válidas (desde y hasta, AAAA-MM-DD).'
    viaje = { desde: v.desde, hasta: v.hasta, firmado: v.firmado !== false }
  }
  if (p.cumplir !== undefined && !Array.isArray(p.cumplir)) return '«Antes del cierre» es una lista.'
  const cumplir = (Array.isArray(p.cumplir) ? p.cumplir : []).map(x => texto(x, 80)).filter(Boolean)
  if (cumplir.length > CUMPLIR_MAX) return `Antes del cierre caben ${CUMPLIR_MAX} cosas como mucho: elige las que importan.`
  return { desde: p.desde, hasta: p.hasta, premio, ...(meta ? { meta } : {}), ...(viaje ? { viaje } : {}), cumplir }
}

/** Lee un documento sin confiar en él: lo inválido queda como «sin temporada», nunca rompe la vista. */
export function normalizarTemporada(crudo: unknown): DocTemporada {
  const d = obj(crudo) ?? {}
  const p = d.periodo === null || d.periodo === undefined ? null : validarPeriodo(d.periodo)
  const actualizado = typeof d.actualizado === 'string' && Number.isFinite(Date.parse(d.actualizado)) ? d.actualizado : '1970-01-01T00:00:00.000Z'
  return { version: 1, actualizado, nombre: texto(d.nombre, 40) || null, arranque: esFecha(d.arranque) ? d.arranque : null, periodo: typeof p === 'string' ? null : p }
}

/** Arma el documento nuevo a partir de lo que pide Levy o la app. `arranque` antes del día 1 o después del cierre no vale. */
export function fijarTemporada(entrada: unknown, ahora = new Date().toISOString()): DocTemporada | string {
  const e = obj(entrada) ?? {}
  const periodo = validarPeriodo(e.periodo)
  if (typeof periodo === 'string') return periodo
  const arranque = e.arranque === undefined || e.arranque === null || e.arranque === '' ? null : e.arranque
  if (arranque !== null && (!esFecha(arranque) || arranque < periodo.desde || arranque >= periodo.hasta)) return 'El arranque de los hábitos va entre el día 1 y el cierre.'
  return { version: 1, actualizado: ahora, nombre: texto(e.nombre, 40) || null, arranque, periodo }
}

/** Quitar la temporada: queda el documento, sin periodo (y la instalación ya no manda: la persona eligió «sin temporada»). */
export const sinTemporada = (ahora = new Date().toISOString()): DocTemporada => ({ version: 1, actualizado: ahora, nombre: null, arranque: null, periodo: null })

/** Lo que leen las vistas, con la precedencia de arriba: documento guardado > instalación. */
export function temporadaVigente(doc: DocTemporada | null, inst: TemporadaVigente): TemporadaVigente {
  if (!doc) return { periodo: inst.periodo, temporadaHabitos: inst.temporadaHabitos }
  if (!doc.periodo) return {}
  return { periodo: doc.periodo, temporadaHabitos: { nombre: doc.nombre ?? NOMBRE_POR_DEFECTO, arranque: doc.arranque ?? doc.periodo.desde } }
}
