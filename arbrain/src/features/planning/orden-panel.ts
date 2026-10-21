'use client'
import { create } from 'zustand'
import type { CalendarMode } from './types'

/**
 * Una orden para el calendario de la pestaña del panel (5 oct 2026, Ctrl+D/X/W/M): ir a esta fecha y escala. Ese calendario
 * lee su escala solo al montarse (`inicio`), así que con la pestaña ya abierta hace falta avisarle; si la pestaña recién se
 * abre, la orden lo espera y la toma al montar. Caduca a los pocos segundos: una vieja nunca le cambia la vista después.
 */
export interface OrdenCalendario { fecha: string; modo: CalendarMode; en: number }
export const CADUCA_ORDEN_MS = 5_000

export const useOrdenCalendario = create<{ orden: OrdenCalendario | null; pedir: (fecha: string, modo: CalendarMode) => void; tomar: () => OrdenCalendario | null }>((set, get) => ({
  orden: null,
  pedir: (fecha, modo) => set({ orden: { fecha, modo, en: Date.now() } }),
  tomar: () => {
    const o = get().orden
    if (o) set({ orden: null })
    return o && Date.now() - o.en < CADUCA_ORDEN_MS ? o : null
  },
}))
