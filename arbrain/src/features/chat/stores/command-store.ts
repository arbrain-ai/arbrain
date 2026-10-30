import { create } from 'zustand'
import { CATALOGO_BASE, type ComandoCatalogo } from '../lib/command-catalog'

// Estado compartido de la paleta «/»: los nombres que el SDK entrega en el evento `init` (por cuenta).
// Vive en memoria: es vista, no dato.

interface CommandState {
  /** Catálogo fusionado vigente (lo publica useCommandCatalog): el pintado de mensajes lo lee sin repetir la carga. */
  catalogo: ComandoCatalogo[]
  setCatalogo: (c: ComandoCatalogo[]) => void
  initNames: Record<string, string[]>
  setInitNames: (account: string, names: string[]) => void
}

export const useCommandStore = create<CommandState>((set) => ({
  catalogo: CATALOGO_BASE,
  setCatalogo: (catalogo) => set({ catalogo }),
  initNames: {},
  setInitNames: (account, names) => set((s) => {
    const previo = s.initNames[account]
    if (previo && previo.length === names.length && previo.every((n, i) => n === names[i])) return s
    return { initNames: { ...s.initNames, [account]: names } }
  }),
}))
