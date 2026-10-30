'use client'
import { useEffect } from 'react'
import { create } from 'zustand'
import type { Atomicos, PrincipioHabito } from '@/lib/sistema/atomicos'

type Cambio = { identidad: string } | ({ clave: string } & Partial<PrincipioHabito>)

/**
 * Identidad, señal, versión de 2 minutos y privacidad de cada hábito (`/api/sistema/atomicos`). Un solo almacén para toda la app:
 * la fila «Hábitos de hoy», el teléfono y Salud leen lo mismo (un hábito privado se ve privado en todas). Optimista: se ve al
 * instante y vuelve atrás si falla.
 */
interface Almacen {
  data: Atomicos | null; error: string | null; leyendo: boolean
  leer: () => Promise<void>; guardar: (c: Cambio) => Promise<void>
}

export const useAlmacenAtomicos = create<Almacen>((set, get) => ({
  data: null, error: null, leyendo: false,
  leer: async () => {
    if (get().leyendo) return
    set({ leyendo: true })
    try {
      const r = await fetch('/api/sistema/atomicos', { cache: 'no-store' }), j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudieron leer.')
      set({ data: j, error: null })
    } catch (e) { set({ error: e instanceof Error ? e.message : 'Sin conexión.' }) }
    finally { set({ leyendo: false }) }
  },
  guardar: async (cambio) => {
    const antes = get().data
    if (antes) {
      if ('identidad' in cambio) set({ data: { ...antes, identidad: cambio.identidad } })
      else {
        const { clave, ...resto } = cambio
        set({ data: { ...antes, habitos: { ...antes.habitos, [clave]: { ...(antes.habitos[clave] ?? { senal: '', dosMinutos: '' }), ...resto } } } })
      }
    }
    try {
      const r = await fetch('/api/sistema/atomicos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambio) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo guardar.')
      set({ data: j, error: null })
    } catch (e) { set({ data: antes, error: e instanceof Error ? e.message : 'No se pudo guardar.' }) }
  },
}))

export function useAtomicos() {
  const a = useAlmacenAtomicos()
  useEffect(() => { if (!useAlmacenAtomicos.getState().data) void useAlmacenAtomicos.getState().leer() }, [])
  return a
}
