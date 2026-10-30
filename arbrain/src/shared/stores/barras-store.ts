import { create } from 'zustand'
import {
  CLAVE_BARRAS, ESTADO_INICIAL, alternarConversaciones, leerEstado, serializarEstado,
  type EstadoBarras,
} from '@/shared/lib/barras-estado'

/**
 * Barra de conversaciones del escritorio, la única barra lateral (4 oct 2026). Se recuerda en este equipo
 * (localStorage) y se lee con `hidratar()` antes del primer pintado (useLayoutEffect del shell), así no
 * hay salto entre el estado del servidor (a la vista) y el guardado.
 * En el teléfono no aplica: ahí manda el cajón de layout-store.
 */
interface BarrasStore extends EstadoBarras {
  hidratado: boolean
  hidratar: () => void
  /** ⌘⇧B, `[`, ⌘⌃H y el asa del borde: esconde o muestra la barra. */
  alternarConversaciones: () => void
}

export const useBarras = create<BarrasStore>((set, get) => ({
  ...ESTADO_INICIAL,
  hidratado: false,
  hidratar: () => {
    let raw: string | null = null
    try { raw = window.localStorage.getItem(CLAVE_BARRAS) } catch { /* modo privado */ }
    set({ ...leerEstado(raw), hidratado: true })
  },
  alternarConversaciones: () => {
    const siguiente = alternarConversaciones({ conversaciones: get().conversaciones })
    set(siguiente)
    try { window.localStorage.setItem(CLAVE_BARRAS, serializarEstado(siguiente)) } catch { /* modo privado */ }
  },
}))
