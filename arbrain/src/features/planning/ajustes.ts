'use client'
import { useCallback, useState } from 'react'
import { DIAS_VISTA, TRAMO, type DiasVista } from './semana-horas'

/**
 * El engrane del calendario (10 oct 2026, Daniel: «en lugar de tener un botón de enfoque, otro de horas, otro de agenda,
 * deberíamos tener un botón tipo tres puntitos o engrane»). Un solo lugar, guardado por superficie (sección, panel), con el
 * 80/20 de lo que trae una app de calendario seria. Fuera a propósito: inicio de semana (la semana es ISO, de lunes, porque los
 * objetivos semanales empiezan en lunes) y formato de 12 h (la casa usa 24 h).
 */
export interface Ajustes {
  /** Días a la vista en la Semana; null = «Auto», el default: los que quepan por ancho (3 en el teléfono vertical, 7 al girarlo). */
  dias: DiasVista | null
  vistaSemana: 'horas' | 'agenda'
  /** Enfoque, en Día, Semana y Mes: sin los chips de categorías ni los subtítulos, y las horas más altas. */
  enfoque: boolean
  /** Rango de horas de la rejilla. */
  desde: number
  hasta: number
  densidad: 'comoda' | 'compacta'
  finDeSemana: boolean
  /** Eventos que rechazaste en Google: ocultos por defecto. */
  rechazados: boolean
  /** La zona horaria en la esquina de la rejilla. */
  zona: boolean
  mesVista: 'recorrido' | 'cuadricula'
  /** Semanas a la vista en la cuadrícula del Mes; 0 = el mes de calendario. */
  mesSemanas: SemanasMes
  /**
   * Lo principal, plegado por defecto en una línea (10 oct 2026, Daniel: «es tan simple como dar un clic, no irme a configuraciones»).
   * Un toque lo abre y se recuerda, el mismo estado en Día, Semana y Mes: el objetivo del periodo y lo de día completo.
   */
  abreObjetivo: boolean
  abreTodoElDia: boolean
  /** La Semana Perfecta (25 oct 2026) en fantasma detrás de la semana real. Encendida por defecto: sin plantilla no pinta nada. */
  semanaPerfecta: boolean
  /** La rutina a futuro en Día y Semana (26 oct 2026, Daniel: «no quiero ver mi rutina a futuro, ya me la sé»). Apagada por defecto:
   *  lo que ya empezó se ve; lo que falta de la rutina, no (rutinas.ts, `rutinaOculta`). */
  rutinaFutura: boolean
}
/**
 * Versión de lo guardado. La 2 (10 oct 2026) trajo «Auto»: antes no existía y quien eligió 7 en el teléfono lo hizo porque no había
 * otra forma de ver la semana; al migrar, los días vuelven a «Auto» una sola vez. Lo demás se respeta.
 */
export const VERSION_AJUSTES = 3
/**
 * La 3 (25 oct 2026, Daniel: «el recorrido es el default en todas las pantallas; la cuadrícula queda como opción en el engrane»):
 * antes la pantalla ancha mostraba la cuadrícula siempre, así que lo guardado no dice qué prefiere; el Mes vuelve a Recorrido una vez.
 */
const VERSION_DIAS = 2, VERSION_MES = 3
export const SEMANAS_MES = [0, 2, 4, 6] as const
export type SemanasMes = typeof SEMANAS_MES[number]

export const AJUSTES_BASE: Ajustes = { dias: null, vistaSemana: 'horas', enfoque: false, desde: TRAMO.desde, hasta: TRAMO.hasta, densidad: 'comoda',
  finDeSemana: true, rechazados: false, zona: false, mesVista: 'recorrido', mesSemanas: 0, abreObjetivo: false, abreTodoElDia: false, semanaPerfecta: true, rutinaFutura: false }

/** Lo que había antes del engrane, en sus llaves sueltas: se respeta al migrar. */
export interface Legado { dias?: string | null; vista?: string | null; enfoque?: string | null; rejillaMes?: string | null }

const entero = (v: unknown, min: number, max: number): number | null => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null

/** Lee los ajustes guardados (JSON) sin confiar en ellos: cada campo inválido vuelve a su valor base. Sin guardado, el legado. */
export function leerAjustes(crudo: string | null, legado: Legado = {}): Ajustes {
  let g: Record<string, unknown> | null = null
  try { const v = crudo ? JSON.parse(crudo) : null; g = v && typeof v === 'object' && !Array.isArray(v) ? v : null } catch { g = null }
  // Lo de antes del engrane (botones sueltos): los días a la vista no se heredan, nacen en «Auto» (VERSION_AJUSTES).
  if (!g) return { ...AJUSTES_BASE, vistaSemana: legado.vista === 'agenda' ? 'agenda' : 'horas', enfoque: legado.enfoque === '1', mesVista: legado.rejillaMes === '1' ? 'cuadricula' : 'recorrido' }
  const a: Ajustes = { ...AJUSTES_BASE }
  const version = typeof g.v === 'number' ? g.v : 0
  if (version >= VERSION_DIAS && (g.dias === null || (DIAS_VISTA as readonly unknown[]).includes(g.dias))) a.dias = g.dias as DiasVista | null
  if (g.vistaSemana === 'agenda' || g.vistaSemana === 'horas') a.vistaSemana = g.vistaSemana
  if (typeof g.enfoque === 'boolean') a.enfoque = g.enfoque
  const desde = entero(g.desde, 0, 23), hasta = entero(g.hasta, 1, 24)
  if (desde !== null && hasta !== null && hasta - desde >= 4) { a.desde = desde; a.hasta = hasta }
  if (g.densidad === 'compacta' || g.densidad === 'comoda') a.densidad = g.densidad
  for (const k of ['finDeSemana', 'rechazados', 'zona', 'abreObjetivo', 'abreTodoElDia', 'semanaPerfecta', 'rutinaFutura'] as const) if (typeof g[k] === 'boolean') a[k] = g[k] as boolean
  if (version >= VERSION_MES && (g.mesVista === 'cuadricula' || g.mesVista === 'recorrido')) a.mesVista = g.mesVista
  if ((SEMANAS_MES as readonly unknown[]).includes(g.mesSemanas)) a.mesSemanas = g.mesSemanas as SemanasMes
  return a
}

/** Un cambio del engrane: el rango de horas siempre deja al menos cuatro horas, sin importar qué extremo se mueva. */
export function ajustar(a: Ajustes, cambio: Partial<Ajustes>): Ajustes {
  const n = { ...a, ...cambio }
  if (n.hasta - n.desde < 4) { if ('desde' in cambio) n.hasta = Math.min(24, n.desde + 4); else n.desde = Math.max(0, n.hasta - 4) }
  return n
}

/** Rechazado por ti en Google (tu respuesta en la lista de invitados). */
export const rechazado = (e: { attendees?: { self: boolean; response: string }[] }) => Boolean(e.attendees?.some(x => x.self && x.response === 'declined'))

export const claveAjustes = (donde: string) => `arbrain:planning:ajustes:${donde}`

export function useAjustes(donde: string): [Ajustes, (cambio: Partial<Ajustes>) => void] {
  const [ajustes, setAjustes] = useState<Ajustes>(() => {
    try {
      const ls = localStorage
      return leerAjustes(ls.getItem(claveAjustes(donde)), { dias: ls.getItem(`arbrain:planning:semana-dias:${donde}`), vista: ls.getItem(`arbrain:planning:semana-vista:${donde}`),
        enfoque: ls.getItem(`arbrain:planning:semana-enfoque:${donde}`), rejillaMes: ls.getItem(`arbrain:planning:rejilla-month:${donde}`) })
    } catch { return AJUSTES_BASE }
  })
  const poner = useCallback((cambio: Partial<Ajustes>) => setAjustes(a => {
    const n = ajustar(a, cambio)
    try { localStorage.setItem(claveAjustes(donde), JSON.stringify({ ...n, v: VERSION_AJUSTES })) } catch { /* sin almacenamiento: vale para esta sesión */ }
    return n
  }), [donde])
  return [ajustes, poner]
}
