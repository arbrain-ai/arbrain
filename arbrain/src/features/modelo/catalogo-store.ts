import { create } from 'zustand'
import type { Catalogo } from './catalogo-modelos'

/** Catálogo de modelos compartido (3 oct 2026): lo necesita el chat nuevo para saber qué está encendido. */
interface Estado { catalogo: Catalogo | null; cargar: () => Promise<void> }

export const useCatalogoModelos = create<Estado>((set) => ({
  catalogo: null,
  cargar: async () => {
    try {
      const r = await fetch('/api/chat/modelos-catalogo', { cache: 'no-store' })
      const data = await r.json().catch(() => ({}))
      if (r.ok && Array.isArray(data.modelos)) set({ catalogo: data as Catalogo })
    } catch { /* sin catálogo no se decide nada: el chat sigue como estaba */ }
  },
}))
