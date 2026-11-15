/**
 * El contador del periodo con premio (22 oct 2026, Daniel: «quiero ver alguna interfaz que diga… uno de 30 y tantos»). Lógica
 * pura, sin React (tests/planning/periodo-premio.test.ts). Las fechas viven en un solo lugar: `instalacion().periodo`.
 *
 * `desde` es el día 1; `hasta` es el cierre (el día de salida al premio) y ya no se cuenta: del 22 oct al 20 nov son 29 días
 * (el 19 nov es el día 29). La temporada de hábitos toma de aquí inicio, cierre y premio: una sola fuente.
 */
import { tr, type Idioma } from '@/shared/i18n'
import { localeFechas } from '@/shared/i18n/fechas'
import type { Month } from 'date-fns'

const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

export type EstadoPeriodo = 'antes' | 'en-curso' | 'cierre' | 'pasado'
/** `empieza`: días que faltan para el día 1 (solo cuenta `antes`); `faltan`: días para el cierre. */
export interface DiaPeriodo { estado: EstadoPeriodo; dia: number | null; total: number; faltan: number; empieza: number }

export function diaDelPeriodo(hoy: string, p: { desde: string; hasta: string }): DiaPeriodo {
  const total = Math.max(1, dias(p.desde, p.hasta)), faltan = dias(hoy, p.hasta), empieza = Math.max(0, dias(hoy, p.desde))
  if (hoy < p.desde) return { estado: 'antes', dia: null, total, faltan, empieza }
  if (hoy === p.hasta) return { estado: 'cierre', dia: total, total, faltan: 0, empieza }
  if (hoy > p.hasta) return { estado: 'pasado', dia: total, total, faltan, empieza }
  return { estado: 'en-curso', dia: dias(p.desde, hoy) + 1, total, faltan, empieza }
}

/** La línea grande: «Día 1 de 34», «Empieza en 3 días», «Hoy se cierra». `idioma` fija uno (sin él, el de la instalación). */
export function textoPeriodo(d: DiaPeriodo, idioma?: Idioma): string {
  if (d.estado === 'antes') return d.empieza === 1 ? tr('Empieza mañana', undefined, idioma) : tr('Empieza en {n} días', { n: d.empieza }, idioma)
  if (d.estado === 'cierre') return tr('Hoy se cierra', undefined, idioma)
  if (d.estado === 'pasado') return tr('Periodo cerrado', undefined, idioma)
  return tr('Día {dia} de {total}', { dia: d.dia, total: d.total }, idioma)
}

/** El pie: cuánto falta para el cierre. */
export function textoFaltan(d: DiaPeriodo): string | null {
  if (d.estado !== 'en-curso') return null
  return d.faltan === 1 ? tr('Mañana se cierra') : tr('Faltan {n} días', { n: d.faltan })
}

/** El mes corto del idioma activo: «nov» en español (ene, feb… dic), «Nov» en inglés. */
const mesCorto = (m: number) => localeFechas().localize.month((m - 1) as Month, { width: 'abbreviated' })
/** «20–25 nov» o «28 nov – 2 dic» (en inglés, «Nov 20–25» o «Nov 28 – Dec 2»). */
export function rangoCorto(desde: string, hasta: string): string {
  const [, m1, d1] = desde.split('-').map(Number), [, m2, d2] = hasta.split('-').map(Number)
  return m1 === m2 ? tr('{d1}–{d2} {mes}', { d1, d2, mes: mesCorto(m2) }) : tr('{d1} {mes1} – {d2} {mes2}', { d1, mes1: mesCorto(m1), d2, mes2: mesCorto(m2) })
}

/** La temporada de hábitos completa: nombre y arranque suyos; inicio, cierre (con el trofeo) y premio del periodo. */
export interface TemporadaHabitos { nombre: string; desde: string; arranque: string; hasta: string; premio: string }
export function temporadaDeHabitos(t: { nombre: string; arranque: string } | undefined, p: { desde: string; hasta: string; premio: string } | undefined): TemporadaHabitos | null {
  if (!t || !p) return null
  return { nombre: t.nombre, arranque: t.arranque, desde: p.desde, hasta: p.hasta, premio: p.premio }
}

/**
 * La franja de la temporada (24 oct 2026, cascada Temporada → Mes → Semana → Día): UN contador, la tira y nada más que cuente.
 * «Monk mode · Día N de 29 → Monterrey · 24–29 nov · Darles resultados a mis clientes»; antes del día 1, «Empieza en N días».
 * Sin «Faltan N días»: la tira ya lo dice.
 */
export interface Franja { rotulo: string | null; contador: string; destino: string; porFirmar: boolean; meta: string | null }
export function franjaDeTemporada(hoy: string, p: { desde: string; hasta: string; premio: string; meta?: string; viaje?: { desde: string; hasta: string; firmado: boolean } },
  nombre?: string | null): Franja {
  const d = diaDelPeriodo(hoy, p)
  return { rotulo: nombre?.trim() || null, contador: textoPeriodo(d), destino: p.viaje ? `${p.premio} · ${rangoCorto(p.viaje.desde, p.viaje.hasta)}` : p.premio,
    porFirmar: Boolean(p.viaje && !p.viaje.firmado), meta: p.meta?.trim() || null }
}
