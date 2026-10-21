'use client'
/**
 * Cómo está dividida cada ventana (8 oct 2026, ver division.ts). Cada ventana de Arbrain es su propio contexto de
 * JavaScript, así que cada una guarda solo la suya en este dispositivo (`arbrain.division.<ventana>`): sobrevive a
 * recargar y a reiniciar la app. No se publica a las demás: la división es de la ventana, no de las pestañas.
 */
import { create } from 'zustand'
import { CORTES, VACIAS, type Celdas, type Cortes, type Grupos, type Ranura } from './division'

/** `oculta`: la columna derecha escondida con ⌘B (9 oct 2026); sus pestañas y su ancho siguen ahí. */
export interface Division { celdas: Celdas; grupos: Grupos; foco: Ranura; cortes: Cortes; oculta: boolean }
const NUEVA: Division = { celdas: VACIAS, grupos: {}, foco: 0, cortes: CORTES, oculta: false }
const clave = (ventana: string) => `arbrain.division.${ventana}`

function leer(ventana: string): Division {
  try {
    const v = JSON.parse(localStorage.getItem(clave(ventana)) ?? 'null') as Partial<Division> | null
    if (!v || !Array.isArray(v.celdas) || v.celdas.length !== 4) return NUEVA
    const celdas = v.celdas.map(c => (typeof c === 'string' ? c : null)) as Celdas
    const foco = ([0, 1, 2, 3] as const).includes(v.foco as Ranura) ? (v.foco as Ranura) : 0
    const x = typeof v.cortes?.x === 'number' ? v.cortes.x : CORTES.x
    const y = Array.isArray(v.cortes?.y) && v.cortes.y.length === 2 ? (v.cortes.y.map(n => (typeof n === 'number' ? n : 0.5)) as [number, number]) : CORTES.y
    const grupos: Grupos = {}
    if (v.grupos && typeof v.grupos === 'object') for (const [c, g] of Object.entries(v.grupos)) if ([0, 1, 2, 3].includes(g as number)) grupos[c] = g as Ranura
    return { celdas, grupos, foco, cortes: { x, y }, oculta: v.oculta === true }
  } catch { return NUEVA }
}

/** Lo leído del almacenamiento antes de la primera escritura (mismo objeto en cada render). */
const leidas = new Map<string, Division>()

interface Estado {
  por: Record<string, Division>
  de: (ventana: string) => Division
  poner: (ventana: string, cambio: Partial<Division>, persistir?: boolean) => void
}

export const useDivisiones = create<Estado>((set, get) => ({
  por: {},
  de: ventana => {
    const ya = get().por[ventana] ?? leidas.get(ventana)
    if (ya) return ya
    if (typeof window === 'undefined') return NUEVA
    const d = leer(ventana); leidas.set(ventana, d); return d
  },
  poner: (ventana, cambio, persistir = true) => {
    const nueva = { ...get().de(ventana), ...cambio }
    set(s => ({ por: { ...s.por, [ventana]: nueva } }))
    if (persistir) try { localStorage.setItem(clave(ventana), JSON.stringify(nueva)) } catch { /* sin almacenamiento */ }
  },
}))

/** La división de una ventana (se lee de este dispositivo la primera vez). */
export function useDivision(ventana: string): Division {
  return useDivisiones(s => s.por[ventana]) ?? useDivisiones.getState().de(ventana)
}
