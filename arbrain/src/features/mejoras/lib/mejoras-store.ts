'use client'
/**
 * Estado de Ajustes › Mejoras para React. Nace con lo de fábrica (igual en el servidor y en la primera pintura) y al
 * montarse toma lo guardado en este dispositivo y luego lo del daemon, que manda. Otra ventana del mismo navegador se
 * entera por `storage`; al volver a la ventana se relee el daemon (lo pudo cambiar el teléfono).
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import { EVENTO_MEJORAS, guardarMejorasLocal, leerMejorasLocal, MEJORAS_DE_FABRICA, normalizarMejoras, CLAVE_MEJORAS, type EstadoMejoras, type Mejora } from './mejoras'

const URL_MEJORAS = '/api/cabina/mejoras'

interface Estado {
  mejoras: EstadoMejoras
  cargado: boolean
  error: string | null
  cargar: () => void
  fijar: (id: Mejora, activa: boolean) => Promise<void>
}

async function delDaemon(): Promise<EstadoMejoras | null> {
  try {
    const r = await fetch(URL_MEJORAS, { cache: 'no-store' })
    const j = await r.json().catch(() => null) as { mejoras?: unknown } | null
    return r.ok && j?.mejoras ? normalizarMejoras(j.mejoras) : null
  } catch { return null }
}

export const useMejoras = create<Estado>((set, get) => {
  const poner = (m: EstadoMejoras) => { guardarMejorasLocal(m); set({ mejoras: m }) }
  const releer = async () => { const m = await delDaemon(); if (m) poner(m) }
  return {
    mejoras: MEJORAS_DE_FABRICA,
    cargado: false,
    error: null,
    cargar: () => {
      if (get().cargado || typeof window === 'undefined') return
      set({ cargado: true, mejoras: leerMejorasLocal() })
      window.addEventListener('storage', (e) => { if (e.key === CLAVE_MEJORAS) set({ mejoras: leerMejorasLocal() }) })
      window.addEventListener(EVENTO_MEJORAS, () => set({ mejoras: leerMejorasLocal() }))
      window.addEventListener('focus', () => { void releer() })
      void releer()
    },
    fijar: async (id, activa) => {
      const antes = get().mejoras
      poner({ ...antes, [id]: activa })
      try {
        const r = await fetch(URL_MEJORAS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mejoras: { [id]: activa } }) })
        const j = await r.json().catch(() => null) as { mejoras?: unknown; error?: string } | null
        if (!r.ok || !j?.mejoras) throw new Error(j?.error ?? String(r.status))
        poner(normalizarMejoras(j.mejoras)); set({ error: null })
      } catch (e) {
        // Sin daemon (p. ej. reiniciándose) queda en este dispositivo y se avisa.
        set({ error: e instanceof Error ? e.message : String(e) })
      }
    },
  }
})

/** ¿La mejora está prendida? Para componentes: se re-pinta al cambiar el interruptor. */
export function useMejora(id: Mejora): boolean {
  const activa = useMejoras((s) => s.mejoras[id])
  useEffect(() => { useMejoras.getState().cargar() }, [])
  return activa
}
