'use client'
import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties } from 'react'
import { CUADRANTES, DRIP, esCuadrante, type Cuadrante, type LecturaDrip, type Tarifa } from './drip'
import type { DocDripVista } from './useDrip'
import type { PlanEvent } from './types'
import s from './drip.module.css'

/**
 * El gobierno del tiempo (24 oct 2026, Daniel: «el circuito cibernético de Martell: Levy como sensor, comparador, atenuador y
 * actuador»). Lo que el calendario sabe de DRIP, una vez, para todas sus piezas: la lectura de cada evento, los cuadrantes
 * ocultos, los tres números y los toques (corregir, delegar, proteger, abrir el domingo). Sin proveedor (la vista del chat), cada
 * pieza se comporta como antes.
 */
export interface Numeros {
  /** Horas en Producir esta semana (lunes a domingo de hoy), en lo que hay en el calendario. null = sin lectura de esta semana. */
  producir: number | null
  /** Horas recompradas esta semana (drip.ts › horasRecompradas). null = sin medición. */
  recompradas: number | null
  tarifa: Tarifa | null
}

export interface Gobierno {
  lectura: (e: PlanEvent) => LecturaDrip
  ocultas: ReadonlySet<Cuadrante>
  alternar: (c: Cuadrante) => void
  numeros: Numeros
  doc: DocDripVista | null
  corregir: (e: PlanEvent, c: Cuadrante | null) => Promise<unknown>
  delegar: (e: PlanEvent, activo: boolean) => Promise<unknown>
  /** Proteger un bloque: `[protegido]` en su descripción por la pluma (con ⌘Z). null = sin pluma (solo lectura). */
  proteger: ((e: PlanEvent, si: boolean) => Promise<unknown>) | null
  abrirDomingo: () => void
  ponerTarifa: (monto: number | null, moneda?: string) => Promise<unknown>
  /** El toque de la mañana: el día queda aceptado (almacén DRIP, `mananas`). */
  aceptarManana: (dia: string) => Promise<unknown>
  /** La leyenda vive en el engrane del calendario (25 oct 2026); las escalas no la repiten. */
  leyendaEnBarra: boolean
  /** Deja un encargo en el chat (sin ejecutar nada). */
  conversar?: (borrador: string) => void
}

export const GobiernoCtx = createContext<Gobierno | null>(null)
export const useGobierno = () => useContext(GobiernoCtx)

const CLAVE_OCULTOS = 'arbrain:planning:drip-ocultos'
const EVENTO_OCULTOS = 'arbrain:drip-ocultos'
function leerOcultos(): Set<Cuadrante> {
  try { const v = JSON.parse(localStorage.getItem(CLAVE_OCULTOS) ?? '[]'); return new Set(Array.isArray(v) ? v.filter(esCuadrante) : []) } catch { return new Set() }
}
/** Los cuadrantes ocultos con la leyenda: compartidos por la sección y el panel (localStorage + evento). */
export function useOcultosDrip(): [ReadonlySet<Cuadrante>, (c: Cuadrante) => void] {
  const [ocultos, setOcultos] = useState<ReadonlySet<Cuadrante>>(() => typeof window === 'undefined' ? new Set() : leerOcultos())
  useEffect(() => {
    const leer = () => setOcultos(leerOcultos())
    window.addEventListener(EVENTO_OCULTOS, leer); window.addEventListener('storage', leer)
    return () => { window.removeEventListener(EVENTO_OCULTOS, leer); window.removeEventListener('storage', leer) }
  }, [])
  const alternar = useCallback((c: Cuadrante) => {
    const x = leerOcultos(); if (x.has(c)) x.delete(c); else x.add(c)
    try { localStorage.setItem(CLAVE_OCULTOS, JSON.stringify([...x])) } catch { /* vale para esta sesión */ }
    window.dispatchEvent(new Event(EVENTO_OCULTOS))
  }, [])
  return [ocultos, alternar]
}

/** Arriba, la fila de lo que te paga; abajo, lo que paga poco. A la izquierda lo que te drena; a la derecha lo que te enciende. */
const MATRIZ: Cuadrante[] = ['reemplazar', 'producir', 'delegar', 'invertir']

/**
 * La leyenda ES la matriz (24 oct 2026): cuatro pastillas en su lugar de la DRIP Matrix, así se aprende con solo verla. Tocar una
 * oculta o muestra ese cuadrante en Día, Semana y Mes. Sin números: los tres números viven en la franja.
 */
export function LeyendaDrip({ enBarra = false }: { enBarra?: boolean }) {
  const g = useGobierno()
  if (!g) return null
  return <div className={s.leyenda} data-en-barra={enBarra || undefined} role="group" aria-label="DRIP: Producir, Invertir, Reemplazar, Delegar. Arriba te paga; a la derecha te enciende.">
    <span className={s.eje} aria-hidden><span>te paga</span><span>paga poco</span></span>
    <div className={s.matriz}>
      {MATRIZ.map(c => { const d = DRIP[c], oculto = g.ocultas.has(c)
        return <button key={c} className={s.celda} data-c={c} aria-pressed={!oculto} data-oculto={oculto || undefined} style={{ '--c': d.color } as CSSProperties}
          onClick={() => g.alternar(c)} title={`${d.nombre}: ${d.lema}. ${oculto ? 'Toca para mostrar' : 'Toca para ocultar'}.`}>
          <i aria-hidden /><span>{d.nombre}</span></button> })}
    </div>
  </div>
}

/** El punto de color de un cuadrante (lo usan la hoja, el domingo y la mañana). */
export function PuntoDrip({ c }: { c: Cuadrante }) {
  return <i className={s.punto} style={{ '--c': DRIP[c].color } as CSSProperties} aria-hidden />
}

export { CUADRANTES }
