import { shiftDay } from '@/features/sistema/calendar-days'
import type { Marca } from './habitos-dia'
import { estadoCelda, semanasTemporada, type EstadoCelda } from './habitos-hoy'

/**
 * La vista H del calendario, «hábitos a través del tiempo» (25 oct 2026, Daniel: «necesito una vista que me permita ver mis hábitos
 * acumulados a través del tiempo… con Ctrl+H accedo a ella»). Lógica pura, sin React (tests/planning/habitos-tiempo.test.ts).
 * La fuente es la misma de «Hábitos de hoy» (useHabitRecords → /api/sistema); aquí solo se decide qué se pinta.
 *
 * El mapa va de la temporada (dom 25 oct → Monterrey, 24 nov) y más atrás si hay historia: empieza en la primera marca que exista,
 * si es anterior. Lo de antes de la primera marca no es «fallado»: no hay historia que contar.
 */

/** Lo que se lee: el máximo que acepta /api/sistema (366 días), terminando hoy. */
export const DIAS_HISTORIA = 366
export const rangoTiempo = (hoy: string) => ({ date: hoy, from: shiftDay(hoy, -(DIAS_HISTORIA - 1)), to: hoy })

/** El primer día con alguna marca (cumplida o no) de estos hábitos; null si no hay ninguna. */
export function primeraMarca(records: readonly { fecha: string; habito_clave: string; hecho: boolean | null }[], claves: readonly string[]): string | null {
  const c = new Set(claves)
  let primera: string | null = null
  for (const r of records) if (c.has(r.habito_clave) && r.hecho !== null && (!primera || r.fecha < primera)) primera = r.fecha
  return primera
}

/**
 * La ventana del mapa: de lo más viejo entre la temporada y la primera marca, a lo más lejano entre el cierre y hoy. Sin temporada,
 * las últimas 4 semanas (o desde la primera marca). Nunca antes de lo que se puede leer.
 */
export function ventanaTiempo(hoy: string, temporada: { desde: string; hasta: string } | null, primera: string | null): { desde: string; hasta: string } {
  const minimo = rangoTiempo(hoy).from
  let desde = temporada?.desde ?? shiftDay(hoy, -27)
  if (primera && primera < desde) desde = primera
  if (desde < minimo) desde = minimo
  const hasta = temporada && temporada.hasta > hoy ? temporada.hasta : hoy
  return { desde, hasta }
}

/** Las columnas del mapa (una por semana, lunes a domingo; `null` fuera de la ventana). */
export const semanasDelMapa = (v: { desde: string; hasta: string }) => semanasTemporada(v.desde, v.hasta)

/** La racha más larga de días cumplidos dentro de la ventana (hasta hoy). */
export function mejorRacha(marca: (fecha: string) => Marca, desde: string, hoy: string): number {
  let mejor = 0, actual = 0
  for (let d = desde; d <= hoy; d = shiftDay(d, 1)) {
    actual = marca(d) === true ? actual + 1 : 0
    if (actual > mejor) mejor = actual
  }
  return mejor
}

/** Cómo se pinta una celda: como en «Hábitos de hoy» desde `inicio` (el arranque). Antes, lo registrado se pinta (es historia) y
 *  lo vacío queda neutro: no había compromiso de llenar. */
export const estadoTiempo = (m: Marca, fecha: string, hoy: string, inicio: string | null): EstadoCelda =>
  inicio && fecha < inicio && fecha <= hoy && (m === true || m === false) ? (m ? 'hecho' : 'fallado') : estadoCelda(m, fecha, hoy, inicio)

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** El rótulo de mes arriba de la primera semana que lo trae (solo esa: «oct», «nov»). */
export function rotulosDeMes(semanas: (string | null)[][]): (string | null)[] {
  let anterior = ''
  return semanas.map(s => {
    const f = s.find((x): x is string => !!x)
    const mes = f ? f.slice(0, 7) : ''
    if (!mes || mes === anterior) return null
    anterior = mes
    return MESES[Number(mes.slice(5, 7)) - 1]
  })
}

/*
 * Llenar, no cumplir (25 oct 2026, 08:20, Daniel: «3 hábitos LLENADOS durante TODO el mes; no importa si fallo, importa que los
 * llene»). Registrado = marcado cumplido o no cumplido; lo único que falla el objetivo es el día vivido sin registro. El cumplimiento
 * queda en segundo plano.
 */
export const registrado = (m: Marca) => m === true || m === false

/** Los días vividos de una lista (hasta hoy, desde `inicio`). */
const vividos = (dias: readonly (string | null)[], hoy: string, inicio: string | null) => dias.filter((f): f is string => !!f && f <= hoy && (!inicio || f >= inicio))

/** Del primer día del mes de `hoy` a `hoy`. */
export function diasDelMes(hoy: string): string[] {
  const dias: string[] = []
  for (let d = `${hoy.slice(0, 8)}01`; d <= hoy; d = shiftDay(d, 1)) dias.push(d)
  return dias
}

/**
 * Cuánto se llenó: casillas registradas sobre las posibles y días con TODOS los hábitos registrados (el total «x de 3»).
 * Sin días vividos, null: nunca un 0 inventado.
 */
export function llenado(dias: readonly (string | null)[], claves: readonly string[], marca: (fecha: string, clave: string) => Marca, hoy: string, inicio: string | null) {
  const v = vividos(dias, hoy, inicio)
  if (!v.length || !claves.length) return null
  let llenas = 0, diasLlenos = 0
  for (const f of v) {
    const k = claves.filter(c => registrado(marca(f, c))).length
    llenas += k
    if (k === claves.length) diasLlenos++
  }
  const posibles = v.length * claves.length
  return { llenas, posibles, sinRegistro: posibles - llenas, diasLlenos, dias: v.length, pct: Math.round(llenas / posibles * 100) }
}

/** Días seguidos con registro que terminan hoy (o ayer, si hoy aún no se llena). Nunca antes de `inicio`. */
export function rachaLlenado(marca: (fecha: string) => Marca, hoy: string, inicio: string | null): number {
  let d = registrado(marca(hoy)) ? hoy : shiftDay(hoy, -1), n = 0
  while ((!inicio || d >= inicio) && registrado(marca(d)) && n < 3660) { n++; d = shiftDay(d, -1) }
  return n
}

/** Hábitos llenados hoy: «x de 3». */
export const llenadosHoy = (claves: readonly string[], marca: (fecha: string, clave: string) => Marca, hoy: string) =>
  claves.filter(c => registrado(marca(hoy, c))).length

/*
 * La tabla (25 oct 2026, 10:00, Daniel: «literal una tabla mensual con los hábitos como columna y los días como fila. No 3
 * componentes, uno solo que englobe todo»). Filas = los días del periodo completo (de `desde` al cierre, inclusive: 25 oct → 24 nov
 * cruza el mes); sin periodo, el mes de hoy entero.
 */
export function diasDeTabla(hoy: string, periodo: { desde: string; hasta: string } | null | undefined): string[] {
  let desde = `${hoy.slice(0, 8)}01`, hasta = shiftDay(`${shiftDay(desde, 31).slice(0, 8)}01`, -1)
  if (periodo && periodo.desde <= periodo.hasta) ({ desde, hasta } = periodo)
  const dias: string[] = []
  for (let d = desde; d <= hasta && dias.length < 400; d = shiftDay(d, 1)) dias.push(d)
  return dias
}

const DOW_CORTO = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
/** El rótulo de la fila para leerse en teléfono: «L 26». El mes solo en la primera fila y en cada día 1: «D 25 oct», «D 1 nov». */
export function rotuloDia(f: string, primera: boolean): { dia: string; mes: string | null } {
  const dow = new Date(`${f}T12:00:00Z`).getUTCDay(), n = Number(f.slice(8, 10))
  return { dia: `${DOW_CORTO[dow]} ${n}`, mes: primera || n === 1 ? MESES[Number(f.slice(5, 7)) - 1] : null }
}

/** La línea sobria de arriba: «Monk mode · Día 1 de 30 · 25 oct → Monterrey». Antes del día 1, «Empieza en N días». */
export function lineaPeriodo(nombre: string | null | undefined, p: { desde: string; hasta: string; premio: string }, dia: { estado: string; dia: number | null; total: number; empieza: number }): string {
  const cuenta = dia.estado === 'antes' ? (dia.empieza === 1 ? 'Empieza mañana' : `Empieza en ${dia.empieza} días`)
    : dia.estado === 'pasado' ? 'Cerrado' : dia.estado === 'cierre' ? 'Hoy se cierra' : `Día ${dia.dia} de ${dia.total}`
  const inicio = `${Number(p.desde.slice(8, 10))} ${MESES[Number(p.desde.slice(5, 7)) - 1]}`
  return [nombre?.trim(), cuenta, `${inicio} → ${p.premio}`].filter(Boolean).join(' · ')
}

/*
 * El trayecto del monk mode (28 oct 2026, rediseño de la vista H: «funcional, pero muy minimalista»). Un tramo por día del periodo:
 * lo vivido dice cuánto se llenó, hoy brilla y el futuro se ve como camino por recorrer, no como hueco.
 */
export type Tramo = 'lleno' | 'parcial' | 'vacio' | 'hoy' | 'futuro' | 'fuera'
export function trayecto(dias: readonly string[], claves: readonly string[], marca: (fecha: string, clave: string) => Marca, hoy: string, inicio: string | null): { fecha: string; tramo: Tramo; llenos: number }[] {
  return dias.map(fecha => {
    const llenos = claves.filter(c => registrado(marca(fecha, c))).length
    const tramo: Tramo = fecha > hoy ? 'futuro' : inicio && fecha < inicio ? 'fuera'
      : llenos === claves.length && claves.length > 0 ? 'lleno' : fecha === hoy ? 'hoy' : llenos > 0 ? 'parcial' : 'vacio'
    return { fecha, tramo, llenos }
  })
}

/** Lo de cada hábito en su tarjeta: racha de cumplidos, la mejor del periodo y cuánto se ha llenado (registrado) de lo vivido. */
export function resumenHabito(clave: string, dias: readonly string[], marca: (fecha: string, clave: string) => Marca, hoy: string, inicio: string | null) {
  const m = (f: string) => marca(f, clave)
  const desde = inicio ?? dias[0] ?? hoy
  let racha = 0
  for (let d = m(hoy) === true ? hoy : shiftDay(hoy, -1); d >= desde && m(d) === true && racha < 3660; d = shiftDay(d, -1)) racha++
  const l = llenado(dias, [clave], marca, hoy, inicio)
  const cumplidos = vividos(dias, hoy, inicio).filter(f => m(f) === true).length
  return { racha, mejor: mejorRacha(m, desde, hoy), pct: l?.pct ?? null, cumplidos, vividos: l?.dias ?? 0, hoy: m(hoy) }
}
